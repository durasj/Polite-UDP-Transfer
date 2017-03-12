const Vue = require('vue/dist/vue')
const hrFileSize = require('filesize');

import Client from './Client'
import Server from './Server'
import { File } from './File'

// Disables devtools and productionTip notices in console
Vue.config.devtools = false
Vue.config.productionTip = false

const client = new Client()
const server = new Server()

const ui = new Vue({
    el: '#ui',
    data: {
        mode: 'client',
        loading: false,
        serverFiles: <File[]>[],
        clientFiles: <File[]>[]
    },
    methods: {
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
        hrFileSize: function (bytes: number) {
            return hrFileSize(bytes)
        },
        showError: function (message: string) {
            alert(message)
        }
    }
})
