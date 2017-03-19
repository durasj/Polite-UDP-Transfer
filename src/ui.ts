const Vue = require('vue/dist/vue')
const hrFileSize = require('filesize')

import Config from './Config'
import Client from './Client'
import Server from './Server'
import { File } from './File'
import { ClientFile } from './ClientFile'

// Disables devtools and productionTip notices in console
Vue.config.devtools = false
Vue.config.productionTip = false

// Creat client if required
let client: Client = null
if (Config.ENABLE_CLIENT) {
    // Callback called from client to update file status
    client = new Client((fileId: string, status: string) => {
        ui.updateStatus(fileId, status)
    })
}
// Create server if required
let server: Server = null
if (Config.ENABLE_SERVER) {
    server = new Server()
}

// Create new Vue js instance
const ui = new Vue({
    el: '#ui',
    data: {
        /**
         * Currently enabled UI mode
         *
         * In the beginning one that is available
         */
        mode: Config.ENABLE_CLIENT ? 'client' : Config.ENABLE_SERVER ? 'server' : undefined,

        /**
         * Indicate loading
         */
        loading: false,

        /**
         * Is server enabled
         */
        serverEnabled: Config.ENABLE_SERVER,

        /**
         * Is client enabled
         */
        clientEnabled: Config.ENABLE_CLIENT,

        /**
         * Files added to server
         */
        serverFiles: <File[]>[],

        /**
         * Files available on the client
         */
        clientFiles: <ClientFile[]>[]
    },
    methods: {
        /**
         * Populates file list from the server
         */
        fetchFileList: function () {
            this.loading = true
            client.listFiles().then((fileList) => {
                this.clientFiles = fileList
                this.loading = false
            }, (err) => {
                this.showError(err)
                this.loading = false
            })
        },

        /**
         * Asks for a file data
         */
        askFile: function (file: ClientFile) {
            this.loading = true
            client.getFile(file).then(() => {
                this.loading = false
            }, (e) => {
                this.showError(e)
                this.loading = false
            })
        },

        /**
         * Opens file on the desktop
         */
        openFile: function (file: ClientFile) {
            this.loading = true
            client.openFile(file).then(() => {
                this.loading = false
            }, (e) => {
                this.showError(e)
                this.loading = false
            })
        },

        /**
         * Updates status of the file
         */
        updateStatus: function(fileId: string, status: string) {
            const fileI = this.clientFiles.findIndex((f: File) => f.id === fileId)
            if (fileI !== undefined) {
                const files = this.clientFiles.slice()
                files[fileI].status = status
                this.clientFiles = files
            }
        },

        /**
         * Opens picking for the sharing
         */
        pickForServer: function () {
            this.loading = true
            server.pickFile().then((file: File) => {
                this.serverFiles.push(file)
                this.loading = false
            }, (e) => {
                this.showError(e)
                this.loading = false
            })
        },

        /**
         * Provides file size in the human readable form
         */
        hrFileSize: function (bytes: number) {
            return hrFileSize(bytes)
        },

        /**
         * Show error message
         */
        showError: function (message: string) {
            alert(message)
        }
    }
})
