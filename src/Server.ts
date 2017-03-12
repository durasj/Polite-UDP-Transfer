import electron = require('electron')
const dialog = electron.remote.dialog
import fs = require('fs')
import path = require('path')
import dgram = require('dgram')
const socket = dgram.createSocket('udp4')
const md5File = require('md5-file/promise')

import { File } from './File'
import Config from './Config'

export default class Server {
    private files: File[] = []

    constructor() {
        this.createSocket()
    }

    private createSocket() {
        socket.on('error', (err) => {
            console.log(`DEBUG: server error:\n${err.stack}`)
            alert('Server socket error, closing')
            socket.close()
        })

        socket.on('message', (msg, rinfo) => {
            console.log(
                `DEBUG: server got: "${msg}" from ${rinfo.address}:${rinfo.port}`
            )
            const response = Buffer.from(this.processMessage(msg, rinfo))

            socket.send(
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

        socket.on('listening', () => {
            var address = socket.address()
            console.log(
                `DEBUG: server listening ${address.address}:${address.port}`
            )
        })

        socket.bind(Config.META_PORT)
    }

    private processMessage(msg: Buffer, rinfo: dgram.AddressInfo) {
        const command = msg
                .toString()
                .replace(' ' + Config.POLITE_REQUEST_WORD, '')
                .trim()

        switch (command) {
            case 'LIST':
                return this.commandList()

            case 'GET':
                return 'SENDING FFF'

            default:
                return Config.POLITE_ERROR_WORD + ' NOT IMPLEMENTED'
        }
    }

    private commandList() {
        const files = this.files.map((file) => ({
            id: file.id,
            name: file.name,
            size: file.size,
            sum: file.sum
        }));

        return JSON.stringify(this.files);
    }

    public pickFile() {
        return new Promise((resolve, reject) => {
            dialog.showOpenDialog((fileNames: string[]) => {
                if (fileNames === undefined) {
                    reject("No file selected")
                    return
                }

                this.getFileInfo(fileNames[0]).then((fileInfo: File) => {
                    this.files.push(fileInfo)
                    resolve(fileInfo)
                })
            })
        })
    }

    private getFileInfo(filePath: string) {
        return new Promise((resolve, reject) => {
            let checksum: string;
            this.getFileChecksum(filePath).then((sum: string) => {
                checksum = sum;

                return this.getFileSize(filePath)
            }, (e: string) => {
                reject(e)
            }).then((size: number) => {
                resolve({
                    id: checksum.substr(0, 8),
                    name: path.basename(filePath),
                    path: filePath,
                    size: size,
                    sum: checksum
                })
            }, (e: string) => {
                reject(e)
            })
        })
    }

    private getFileChecksum(filePath: string) {
        return md5File(filePath)
    }

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
}
