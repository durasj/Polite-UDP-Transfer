import electron = require('electron')
import fs = require('fs')
import path = require('path')
import zlib = require('zlib')
import dgram = require('dgram')

import { File } from './File'
import Config from './Config'
import Debug from './Debug'

const dialog = electron.remote.dialog
const md5File = require('md5-file/promise')
const randomAccessFile = require('random-access-file')

export default class Server {
    /**
     * List of shared files
     */
    private files: File[] = []

    /**
     * Socket used for sending
     */
    private txSocket: dgram.Socket

    /**
     * Socket used for receiving
     */
    private rxSocket: dgram.Socket

    /**
     * Create new Server
     */
    constructor() {
        this.txSocket = dgram.createSocket('udp4')
        this.rxSocket = dgram.createSocket('udp4')
        this.initReceiver()
        this.initSender()
    }

    /**
     * Receiver socket init for listening
     */
    private initReceiver() {
        this.rxSocket.on('error', (err) => {
            Debug.log(`Server error:\n${err.stack}`)
            alert('Server socket error, closing')
            this.rxSocket.close()
        })

        this.rxSocket.on('message', (msg, rinfo) => {
            const msgPreview = msg.byteLength > 18 ? msg.slice(0, 18) : msg.slice()
            Debug.log(
                `Server got: "${msgPreview}..." from ${rinfo.address}:${rinfo.port}`
            )
            this.processMessage(msg, rinfo).then((data: string) => {
                const response = Buffer.from(data)

                this.rxSocket.send(
                    response,
                    0,
                    response.length,
                    rinfo.port,
                    rinfo.address,
                    (err, bytes) => {
                        if (err) throw err
                    }
                )
            }, (message) => {
                const response = Buffer.from(Config.POLITE_ERROR_WORD + ' ' + message)

                this.rxSocket.send(
                    response,
                    0,
                    response.length,
                    rinfo.port,
                    rinfo.address,
                    (err, bytes) => {
                        if (err) throw err
                    }
                )
            })
        })

        this.rxSocket.on('listening', () => {
            const address = this.rxSocket.address()
            Debug.log(
                `Sserver listening ${address.address}:${address.port}`
            )
        })

        this.rxSocket.bind(Config.META_PORT)
    }

    /**
     * Sender socket init
     */
    private initSender() {
        this.txSocket.bind()
    }

    /**
     * Process received message over meta socket
     * @param msg
     * @param rinfo
     */
    private processMessage(msg: Buffer, rinfo: dgram.AddressInfo) {
        const request = msg
            .toString()
            .replace(' ' + Config.POLITE_REQUEST_WORD, '')
            .trim()
            .split(' ')
        const command = request[0]

        switch (command) {
            case 'LIST':
                return this.commandList()

            case 'GET':
                return this.commandGet(request[1])

            case 'PARTS':
                return this.commandParts(msg)

            default:
                return Promise.reject('NOT IMPLEMENTED')
        }
    }

    /**
     * Processes GET command to broadcast data
     * @param fileId
     */
    private commandGet(fileId: string) {
        const file = this.files.find((file) => file.id === fileId)
        if (file === undefined) {
            Debug.log('Unknown file ' + fileId)
            return Promise.reject('UNKNOWN FILE')
        }

        // tslint:disable-next-line:semicolon
        let index = 0;
        // Cast to any to prevent issues with the currently incorrect
        // typescript typings for node which don't contain highWaterMark
        (<any> fs).createReadStream(file.path, {
            highWaterMark: Config.CHUNK_SIZE
        }).on('data', (data: Buffer) => {
            const buffer = Buffer.alloc(fileId.length + 4 + data.byteLength)
            buffer.fill(fileId, 0, fileId.length)
            buffer.writeUInt32BE(index, fileId.length)
            buffer.fill(data, fileId.length + 4)
            this.sendData(buffer)
            index++
        })

        return Promise.resolve('HERE YOU ARE')
    }

    /**
     * Processes PARTS command to broadcast required parts
     * @param msg
     */
    private commandParts(msg: Buffer) {
        const fileId = msg.slice(6, 14).toString()
        const file = this.files.find((f) => f.id === fileId)
        if (file === undefined) {
            Debug.log('Unknown file ' + fileId)
            return Promise.reject('UNKNOWN FILE')
        }

        const missingParts = new Set<number>()

        // 14 char. command, file id, 1 char space + 1 char space
        let offset = 15 + Config.POLITE_REQUEST_WORD.length + 1
        // While we are still able to read next index number
        while (offset + 4 <= msg.byteLength) {
            missingParts.add(msg.readUInt32BE(offset))
            offset += 4
        }

        const raf = randomAccessFile(file.path, {
            readable: true,
            writable: false
        })
        const lastChunkSize = file.size - ((file.parts - 1) * Config.CHUNK_SIZE)

        missingParts.forEach((index) => {
            const lastChunk = (file.parts - 1) === index

            raf.read(
                index * Config.CHUNK_SIZE,
                lastChunk ? lastChunkSize : Config.CHUNK_SIZE,
                (error: string, data: Buffer) => {
                    if (error) {
                        Debug.log('RAF read error', error)
                        return
                    }

                    const buffer = Buffer.alloc(fileId.length + 4 + data.byteLength)
                    buffer.write(fileId, 0, fileId.length)
                    buffer.writeUInt32BE(index, fileId.length)
                    buffer.fill(data, fileId.length + 4)
                    this.sendData(buffer)
                }
            )
        })

        return Promise.resolve('APOLOGIES, SENDING MISSING FOR ' + fileId)
    }

    /**
     * Processes LIST command to share available files
     */
    private commandList() {
        const files = this.files.map((file) => ({
            id: file.id,
            name: file.name,
            size: file.size,
            parts: file.parts,
            sum: file.sum
        }))

        return Promise.resolve(JSON.stringify(files))
    }

    /**
     * Prompts user to pick file available for sharing
     */
    public pickFile() {
        return new Promise((resolve, reject) => {
            if (this.files.length === Config.MAX_FILES) {
                reject('You can only share up to ' + Config.MAX_FILES + ' files')
                return
            }

            dialog.showOpenDialog((fileNames: string[]) => {
                // No file selected
                if (fileNames === undefined) {
                    reject('No file selected')
                    return
                }

                this.getFileInfo(fileNames[0]).then((fileInfo: File) => {
                    this.files.push(fileInfo)
                    resolve(fileInfo)
                })
            })
        })
    }

    /**
     * Finds info about the file
     * @param filePath
     */
    private getFileInfo(filePath: string) {
        return new Promise((resolve, reject) => {
            let checksum: string
            this.getFileChecksum(filePath).then((sum: string) => {
                checksum = sum

                return this.getFileSize(filePath)
            }, (e: string) => {
                reject(e)
            }).then((size: number) => {
                resolve({
                    id: checksum.substr(0, 8),
                    name: path.basename(filePath),
                    path: filePath,
                    size: size,
                    parts: Math.ceil(size / Config.CHUNK_SIZE),
                    sum: checksum
                })
            }, (e: string) => {
                reject(e)
            })
        })
    }

    /**
     * Calculates MD5 checksum of the file
     * @param filePath
     */
    private getFileChecksum(filePath: string) {
        return md5File(filePath)
    }

    /**
     * Finds File size in bytes
     * @param filePath
     */
    private getFileSize(filePath: string) {
        return new Promise((resolve, reject) => {
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(stats.size)
                }
            })
        })
    }

    /**
     * Broadcasts binary file data
     * @param data
     */
    private sendData(data: Buffer) {
        // Randomly "drop" some packets if required
        // to simulate packet loss
        if (Config.SIMULATE_PACKET_LOSS) {
            const shouldLose = Math.random() >= (1 - Config.PACKET_LOSS_PROBABILITY)
            if (shouldLose) {
                return Promise.resolve()
            }
        }

        return new Promise((resolve, reject) => {
            this.txSocket.setBroadcast(true)
            this.txSocket.send(
                data,
                0,
                data.length,
                Config.DATA_PORT,
                Config.BROADCAST_ADDRESS,
                (err, bytes) => {
                    if (err) {
                        Debug.log(err)
                        reject(err.message)
                    }
                }
            )
        })
    }
}
