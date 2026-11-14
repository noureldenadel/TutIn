import fs from 'fs'

/**
 * Helper to find the first or last PCR in a buffer containing MPEG-TS packets.
 * MPEG-TS packets are 188 bytes long and start with sync byte 0x47.
 */
function findPCRInBuf(buf, searchBackward = false) {
    const packetSize = 188
    const len = buf.length
    
    if (searchBackward) {
        // Search backwards by packet offsets
        for (let offset = Math.floor(len / packetSize) * packetSize - packetSize; offset >= 0; offset -= packetSize) {
            if (buf[offset] !== 0x47) continue
            
            // Check adaptation field control bits (bits 4 and 5 of byte 3)
            const adaptControl = (buf[offset + 3] & 0x30) >> 4
            if (adaptControl === 2 || adaptControl === 3) {
                const adaptLen = buf[offset + 4]
                if (adaptLen > 0) {
                    const pcrFlag = buf[offset + 5] & 0x10
                    if (pcrFlag) {
                        const b6 = buf[offset + 6]
                        const b7 = buf[offset + 7]
                        const b8 = buf[offset + 8]
                        const b9 = buf[offset + 9]
                        const b10 = buf[offset + 10]
                        
                        // Parse 33-bit PCR base
                        const pcrBase = (b6 * 33554432) + (b7 * 131072) + (b8 * 512) + (b9 * 2) + (b10 >> 7)
                        return pcrBase
                    }
                }
            }
        }
    } else {
        // Search forwards by packet offsets
        for (let offset = 0; offset <= len - packetSize; offset += packetSize) {
            if (buf[offset] !== 0x47) continue
            
            const adaptControl = (buf[offset + 3] & 0x30) >> 4
            if (adaptControl === 2 || adaptControl === 3) {
                const adaptLen = buf[offset + 4]
                if (adaptLen > 0) {
                    const pcrFlag = buf[offset + 5] & 0x10
                    if (pcrFlag) {
                        const b6 = buf[offset + 6]
                        const b7 = buf[offset + 7]
                        const b8 = buf[offset + 8]
                        const b9 = buf[offset + 9]
                        const b10 = buf[offset + 10]
                        
                        const pcrBase = (b6 * 33554432) + (b7 * 131072) + (b8 * 512) + (b9 * 2) + (b10 >> 7)
                        return pcrBase
                    }
                }
            }
        }
    }
    return null
}

/**
 * Parses the duration of an MPEG-TS (.ts) file by reading the first and last
 * PCR (Program Clock Reference) timestamps and calculating the difference.
 * 
 * @param {string} filePath - Absolute path to the .ts video file
 * @returns {Promise<number>} Duration in seconds (0 if it cannot be parsed)
 */
export function parseTsDuration(filePath) {
    return new Promise((resolve) => {
        try {
            const fd = fs.openSync(filePath, 'r')
            const stat = fs.fstatSync(fd)
            const fileSize = stat.size
            
            // Read up to ~1.8MB (10,000 packets) for search buffers
            const bufferSize = Math.min(fileSize, 188 * 10000) 
            if (bufferSize < 376) {
                // Too small to contain valid packets
                fs.closeSync(fd)
                resolve(0)
                return
            }
            
            const startBuf = Buffer.alloc(bufferSize)
            fs.readSync(fd, startBuf, 0, bufferSize, 0)
            
            // Find packet alignment sync offset (first 0x47 aligned with next 0x47 at 188 bytes)
            let startAlign = -1
            for (let i = 0; i < Math.min(startBuf.length - 376, 1000); i++) {
                if (startBuf[i] === 0x47 && startBuf[i + 188] === 0x47) {
                    startAlign = i
                    break
                }
            }
            
            if (startAlign === -1) {
                fs.closeSync(fd)
                resolve(0)
                return
            }
            
            const firstPcr = findPCRInBuf(startBuf.subarray(startAlign), false)
            
            let lastPcr = null
            if (firstPcr !== null) {
                if (fileSize > bufferSize) {
                    const endBuf = Buffer.alloc(bufferSize)
                    const endOffset = fileSize - bufferSize
                    fs.readSync(fd, endBuf, 0, bufferSize, endOffset)
                    
                    // Align end offset
                    let endAlign = -1
                    for (let i = 0; i < Math.min(endBuf.length - 376, 1000); i++) {
                        if (endBuf[i] === 0x47 && endBuf[i + 188] === 0x47) {
                            endAlign = i
                            break
                        }
                    }
                    
                    if (endAlign !== -1) {
                        lastPcr = findPCRInBuf(endBuf.subarray(endAlign), true)
                    }
                } else {
                    lastPcr = findPCRInBuf(startBuf.subarray(startAlign), true)
                }
            }
            
            fs.closeSync(fd)
            
            if (firstPcr !== null && lastPcr !== null) {
                const diff = lastPcr - firstPcr
                if (diff > 0) {
                    resolve(Math.floor(diff / 90000))
                    return
                }
            }
            resolve(0)
        } catch (e) {
            console.error('[tsParser] Error:', e)
            resolve(0)
        }
    })
}
