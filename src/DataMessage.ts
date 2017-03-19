/**
 * Data message passed when data are received
 */
export interface DataMessage {
    /**
     * Id of the file
     */
    fileId: string,
    /**
     * Index of the data
     */
    index: number,
    /**
     * Binary data
     */
    data: Buffer
}