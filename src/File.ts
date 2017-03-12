export interface File {
    // First 8 hex chars
    id: string,
    name: string,
    path: string,
    size: number,
    // Checksum in HEX
    sum: string
}
