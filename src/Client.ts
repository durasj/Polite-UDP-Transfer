import dgram = require('dgram')
const socket = dgram.createSocket('udp4')

import Config from './Config'

export default class Client {
    constructor() { }

    public listFiles() {
        return new Promise((resolve, reject) => {
            const message = Buffer.from('LIST ' + Config.POLITE_REQUEST_WORD)
            this.sendMessage(message).then((response: string) => {
                const fileList = JSON.parse(response)
                resolve(fileList)
            }, (err) => {
                reject(err)
            })
        })
    }

    private sendMessage(message: Buffer) {
        return new Promise((resolve, reject) => {
            socket.once('message', (message, remote) => {
                const response = message.toString().trim()
                console.log('DEBUG: client got response:: "' + response + '"')

                if (response.indexOf(Config.POLITE_ERROR_WORD) === 0) {
                    reject(response)
                    return
                }

                resolve(response)
            })

            socket.send(
                message,
                0,
                message.length,
                Config.META_PORT,
                Config.SERVER_IP,
                (err, bytes) => {
                    if (err) {
                        console.log('DEBUG:', err)
                        reject(err.message)
                    }
                }
            )
        })
    }

}
