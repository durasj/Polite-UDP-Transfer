export interface File {
    /**
     * First 8 hex chars from checksum
     */
    id: string

    /**
     * Name of the file with the extension
     */
    name: string

    /**
     * File size in bytes
     */
    size: number

    /**
     * Path to the file
     */
    path: string,

    /**
     * Number of parts (chunks)
     */
    parts: number,

    /**
     * Checksum in HEX
     */
    sum: string
}
