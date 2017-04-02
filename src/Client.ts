import dgram = require('dgram')
import electron = require('electron')
import path = require('path')

import Config from './Config'
import Debug from './Debug'
import { File } from './File'
import { ClientFile } from './ClientFile'
import { DataMessage } from './DataMessage'

type statusCallback = (fileId: string, status: string) => void;

export default class Client {
    /**
     * List of available files
     */
    private files: ClientFile[] = []

    /**
     * Socket used for sending
     */
    private txSocket: dgram.Socket

    /**
     * Socket used for receiving
     */
    private rxSocket: dgram.Socket

    /**
     * Create new Client
     * @param statusCallback Callback called with updates on the file
     */
    constructor(private statusCallback: statusCallback) {
        this.txSocket = dgram.createSocket('udp4')
        this.rxSocket = dgram.createSocket('udp4')
        this.initReceiver()
    }

    /**
     * Receiver socket init for listening
     */
    private initReceiver() {
        this.rxSocket.on('error', (err) => {
            Debug.log(`Client data error:\n${err.stack}`)
            alert('Client data socket error, closing')
            this.rxSocket.close()
        })

        this.rxSocket.on('message', (msg, rinfo) => {
            const message: DataMessage = {
                fileId: msg.slice(0, 8).toString(),
                index: msg.slice(8, 12).readUInt32BE(0),
                data: msg.slice(12)
            }

            Debug.logVerbose(
                `Client got data from ${rinfo.address}:${rinfo.port}`,
                message
            )
            this.processData(message, rinfo)
        })

        this.rxSocket.on('listening', () => {
            const address = this.rxSocket.address()
            Debug.log(
                `Client listening ${address.address}:${address.port}`
            )
            this.rxSocket.setBroadcast(true)
        })

        this.rxSocket.bind(Config.DATA_PORT)
    }

    /**
     * Process received file data over data socket
     * @param message
     * @param rinfo
     */
    private processData(message: DataMessage, rinfo: dgram.AddressInfo) {
        // We don't know such file
        const file = this.files.find((f) => f.id === message.fileId)
        if (file === undefined) return
        // Don't accept any new data for already finished file
        if (file.hasFinished()) return

        file.processData(message)
    }

    /**
     * Gets list of available files
     */
    public listFiles() {
        return new Promise((resolve, reject) => {
            const message = Buffer.from('LIST ' + Config.POLITE_REQUEST_WORD)
            this.sendMessage(message).then((response: string) => {
                const fileList = JSON.parse(response)
                this.files = fileList.map((fileObj: File) => {
                    return new ClientFile(
                        fileObj,
                        this.statusCallback,
                        this.requestParts.bind(this)
                    )
                })
                resolve(this.files)
            }, (err) => {
                reject(err)
            })
        })
    }

    /**
     * Get file data from server
     * @param file File to get
     */
    public getFile(file: File) {
        return new Promise((resolve, reject) => {
            const message = Buffer.from('GET ' + file.id + ' ' + Config.POLITE_REQUEST_WORD)
            this.sendMessage(message).then(() => {
                resolve()
            }, (err) => {
                reject(err)
            })
        })
    }

    /**
     * Open file using normal desktop app
     */
    public openFile(file: File) {
        electron.shell.openItem(path.resolve(file.path))
        return Promise.resolve()
    }

    /**
     * Requests missing parts for the file
     * @param file File which has missing parts
     */
    public requestParts(file: ClientFile) {
        const missingPartsLength = file.missingParts.size

        let promises: Promise<any>[] = []

        let requestedParts = new Set<number>()
        let requestedPartsLength = 0
        let processedPartsLength = 0
        file.missingParts.forEach(partIndex => {
            requestedParts.add(partIndex)
            requestedPartsLength++
            processedPartsLength++

            // Max 250 per request to fit into packet
            if (
                requestedPartsLength === 250
                ||
                processedPartsLength === missingPartsLength
            ) {
                promises.push(
                    this.requestPartsMessage(file.id, requestedParts)
                )
                requestedParts.clear()
                requestedPartsLength = 0
            }
        })

        return Promise.all(promises)
    }

    private requestPartsMessage(fileId: string, parts: Set<number>) {
        return new Promise((resolve, reject) => {
            // Polite request word + space
            const stringPart = 'PARTS ' + fileId + ' ' + Config.POLITE_REQUEST_WORD + ' '
            const buffer = Buffer.alloc(
                stringPart.length +
                (parts.size * 4)
            )
            buffer.write(stringPart, 0, stringPart.length)
            let i = 0
            parts.forEach(partIndex => {
                let offset = stringPart.length + (i * 4)
                buffer.writeUInt32BE(partIndex, offset)
                i++
            })
            this.sendMessage(buffer, false).then(() => {
                resolve()
            })
        })
    }

    /**
     * Sends message to server
     * @param message Message to send
     * @param requireResponse Should we process response
     */
    private sendMessage(message: Buffer, requireResponse: boolean = true) {
        return new Promise((resolve, reject) => {
            if (requireResponse) {
                this.txSocket.once('message', (message, remote) => {
                    const response = message.toString().trim()
                    Debug.log('Client got response: "' + response + '"')

                    if (response.indexOf(Config.POLITE_ERROR_WORD) === 0) {
                        reject(response)
                        return
                    }

                    resolve(response)
                })
            }

            this.txSocket.send(
                message,
                0,
                message.length,
                Config.META_PORT,
                Config.SERVER_IP,
                (err, bytes) => {
                    if (err) {
                        Debug.log(err)
                        reject(err.message)
                    }
                }
            )

            if (!requireResponse) resolve()
        })
    }

}
