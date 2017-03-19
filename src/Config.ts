export default class Config {
    [key: string]: any

    /**
     * Enable server part
     */
    static ENABLE_SERVER = true

    /**
     * Enable client part
     */
    static ENABLE_CLIENT = true

    /**
     * Size of the file chunk sent over the network
     */
    static CHUNK_SIZE = 1000

    /**
     * Server IP adress
     */
    static SERVER_IP = 'localhost'

    /**
     * IP address used for data broadcasting
     */
    static BROADCAST_ADDRESS = '192.168.1.255'

    /**
     * Port used for meta (plaintext) communication
     */
    static META_PORT = 10000

    /**
     * Port used for data (binary) communication
     */
    static DATA_PORT = 10001

    /**
     * Word used in the end of requests
     */
    static POLITE_REQUEST_WORD = 'PLS'

    /**
     * Word used at the beginning of error messages
     */
    static POLITE_ERROR_WORD = 'SRY'

    /**
     * Maximum number of files that can be picked via Server
     */
    static MAX_FILES = 5

    /**
     * Folder used for downloads
     */
    static DOWNLOADS_FOLDER = 'downloads'

    /**
     * Simulate random packet loss
     */
    static SIMULATE_PACKET_LOSS = true

    /**
     * Probability that some packets will be lost
     *
     * 0.001 = 0.1% packets will be lost
     * 1 = 100% of packets will be lost
     * No more than 0.001 is recommended
     */
    static PACKET_LOSS_PROBABILITY = 0.001

    /**
     * Enable recovery of lost packets
     *
     * Lost packets will be requested at the end of receiving
     */
    static ENABLE_PACKET_LOSS_RECOVERY = true

    /**
     * Enable debuging
     *
     * Developer tools can be opened using Ctrl+Shift+I
     */
    static ENABLE_DEBUG = false

    /**
     * Enable logging to console
     */
    static ENABLE_DEBUG_LOGGING = true

    /**
     * Enable verbose logging
     *
     * WARNING: Can lead to great number of
     * logged info if large files are used
     * since a lot of repeating messages are logged
     * and all received data objects are logged
     */
    static ENABLE_DEBUG_VERBOSE = false

    /**
     * Load custom config.json
     *
     * Uses json object properties from the config.json
     * in the root dir and replaces the default options
     */
    public static loadCustom() {
        const customConfig = require('../config.json')
        for (const option in customConfig) {
            if (typeof this[option] !== 'undefined') {
                this[option] = customConfig[option]
            }
        }
    }
}
