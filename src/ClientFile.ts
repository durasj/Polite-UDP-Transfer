import fs = require('fs')

import { File } from './File'
import { DataMessage } from './DataMessage'
import Config from './Config'
import Debug from './Debug'

const hrFileSize = require('filesize')
const randomAccessFile = require('random-access-file')
const md5File = require('md5-file/promise')
const leftPad = require('left-pad')

type statusCallback = (fileId: string, status: string) => void
type requestPartsCallback = (file: ClientFile) => void

/**
 * File on the client side
 *
 * Abstraction to help with manipulations on the client side
 */
export class ClientFile implements File {
    /**
     * First 8 hex chars from checksum
     */
    public id: string

    /**
     * Name of the file with the extension
     */
    public name: string

    /**
     * File size in bytes
     */
    public size: number

    /**
     * Number of parts
     */
    public parts: number

    /**
     * Checksum in HEX
     */
    public sum: string

    /**
     * Path in the DOWNLOADS folder
     */
    public path: string

    /**
     * Temp path in the DOWNLOADS folder
     */
    public tempPath: string

    /**
     * Indexes of the missing parts
     */
    public missingParts: Set<number>

    /**
     * Random Access File instance
     */
    private raf: any

    /**
     * Timestamp of the last received part in ms
     */
    private lastReceived: number

    /**
     * Timestamp when the first chunk was received in ms
     */
    private transferStarted: number

    /**
     * Timestamp when the last chunk was written in ms
     */
    private transferFinished: number

    /**
     * Creates new ClientFile
     * @param fileObj File object to use properties from
     * @param statusCallback Called on status updates of this file
     * @param requestPartsCallback Called when missing parts are required
     */
    constructor(
        fileObj: File,
        private statusCallback: statusCallback,
        private requestPartsCallback: requestPartsCallback
    ) {
        this.id = fileObj.id
        this.name = fileObj.name
        this.size = fileObj.size
        this.parts = fileObj.parts
        this.sum = fileObj.sum
        this.path = Config.DOWNLOADS_FOLDER + '/' + fileObj.name
        this.tempPath = this.path + '.tmp'
    }

    /**
     * Process file data
     * @param message
     */
    public processData(message: DataMessage) {
        if (typeof this.raf === 'undefined') {
            this.prepareReceiving()
            Debug.log('Started saving ' + this.id, new Date())
            this.changeStatus('Receiving')
        }

        this.raf.write(message.index * Config.CHUNK_SIZE, message.data, () => {
            // Delete missing part after it was successfuly written
            this.missingParts.delete(message.index)
            this.lastReceived = + new Date()
            if (this.missingParts.size === 0) this.finishReceiving()
        })
    }

    /**
     * Has file receiving finished
     */
    public hasFinished() {
        return this.transferFinished !== undefined
    }

    /**
     * Prepare file for receiving
     *
     * Creates new temp file and plans transfer check
     */
    private prepareReceiving() {
        this.transferStarted = + new Date()
        this.raf = randomAccessFile(
            this.tempPath,
            { truncate: true, length: this.size }
        )
        // Create set with all the empty parts
        this.missingParts = new Set()
        for (let i = 0; i < this.parts; i++) {
            this.missingParts.add(i)
        }
        this.planTransferCheck()
    }

    /**
     * Finish receiving of the file
     *
     * Close, verify and rename file to original name
     */
    private finishReceiving() {
        this.transferFinished = + new Date()

        this.raf.end(() => {
            this.raf.close(() => {
                this.changeStatus('Verifying')

                this.checkRenameFile().then(() => {
                    this.changeStatus(
                        'Downloaded in ' + this.durationHr(this.transferTime()) +
                        ', ' + hrFileSize(this.transferSpeed()) + '/s'
                    )
                    Debug.log('File ' + this.id + ' saved', new Date())
                }, () => {
                    this.changeStatus('Corrupted')
                    Debug.log('File ' + this.id + ' checksum failed', new Date())
                })
            })
        })
    }

    /**
     * Time required for transfer in ms
     */
    private transferTime() {
        return this.transferFinished - this.transferStarted
    }

    /**
     * Speed of the transfer in human readable form
     */
    private transferSpeed() {
        const transferTimeInSeconds = this.transferTime() / 1000
        return this.size / transferTimeInSeconds
    }

    /**
     * Human readable duration in minutes:seconds form, e.g. 05:10
     * @param ms Milliseconds
     */
    private durationHr(ms: number) {
        const minutes = Math.floor(ms / 60000)
        ms -= minutes * 60000
        const seconds = Math.round(ms / 1000)
        return leftPad(minutes, 2, '0') + ':' + leftPad(seconds, 2, '0')
    }

    /**
     * Plan next transfer check
     */
    private planTransferCheck() {
        // Between 400 and 600 ms
        const randomTimeout = Math.random() * (600 - 400) + 400
        setTimeout(
            this.checkTransfer.bind(this),
            randomTimeout
        )
    }

    /**
     * Check transfer
     * 
     * Shares progress, optionally requests lost packets
     * and plans next transfer check if required
     */
    private checkTransfer() {
        if (this.missingParts.size > 0) {
            this.sendProgress()

            const lastReceivedAgo = (+ new Date()) - this.lastReceived
            Debug.logVerbose(
                'Still not done ' + this.id + '. ' +
                'Last part received ' + lastReceivedAgo + 'ms ago'
            )

            // We haven't received anything in more than 500ms
            // time to worry about dropped packets
            if (Config.ENABLE_PACKET_LOSS_RECOVERY && lastReceivedAgo > 500) {
                Debug.log('Requesting missing parts for ' + this.id)
                this.requestPartsCallback(this)
            }

            // Plan next one, we still need it
            this.planTransferCheck()
        }
    }

    /**
     * Checksum verification and .tmp renaming
     * 
     * Compares downloaded file checksum to the received one
     * and renames file from the *.tmp to original name *
     */
    private checkRenameFile() {
        return new Promise((resolve, reject) => {
            const filePath = Config.DOWNLOADS_FOLDER + '/' + this.name
            const tmpFilePath = filePath + '.tmp'
            md5File(tmpFilePath).then((checksum: string) => {
                if (checksum === this.sum) {
                    fs.rename(tmpFilePath, filePath, () => {
                        resolve()
                    })
                } else {
                    reject()
                }
            }, () => {
                reject()
            })
        })
    }

    /**
     * Calls status callback with current receiving progress
     */
    private sendProgress() {
        const downloadedParts = this.parts - this.missingParts.size
        const perc = Math.round((downloadedParts / this.parts) * 100)
        this.changeStatus(
            'Downloading: ' + perc + '% (' + downloadedParts + '/' + this.parts + ')'
        )
    }

    /**
     * Sends status via status callback
     * @param status
     */
    private changeStatus(status: string) {
        this.statusCallback(this.id, status)
    }
}