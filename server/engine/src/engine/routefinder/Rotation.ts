export function rotate(angle: number, a: number, b: number): number {
    return (angle & 0x1) !== 0 ? b : a;
}

export function rotateFlags(angle: number, blockAccessFlags: number): number {
    if (angle === 0) {
        return blockAccessFlags;
    }
    return (((blockAccessFlags << angle) & 0xf) | (blockAccessFlags >>> (4 - angle))) >>> 0;
}
