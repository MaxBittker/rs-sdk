export const MASK = initMaskArray();

/**
 * Returns `num` "cast" to a signed 32-bit integer.
 * @param num The number to cast.
 */
export function toInt32(num: number): number {
    return num | 0;
}

/**
 * Returns `num` "cast" to an unsigned 32-bit integer.
 * @param num The number to cast.
 */
export function toUInt32(num: number): number {
    return num >>> 0;
}

/**
 * Returns the number of `1` bits in `num`.
 * @param num The number to check.
 */
export function bitcount(num: number): number {
    num = num - ((num >> 1) & 0x55555555);
    num = (num & 0x33333333) + ((num >> 2) & 0x33333333);
    return (((num + (num >> 4)) & 0xf0f0f0f) * 0x1010101) >> 24;
}

export function setBitRange(num: number, startBit: number, endBit: number): number {
    const mask = MASK[endBit - startBit + 1];
    return num | (mask << startBit);
}

export function clearBitRange(num: number, startBit: number, endBit: number): number {
    const mask = MASK[endBit - startBit + 1];
    return num & ~(mask << startBit);
}

function initMaskArray(): number[] {
    const data = [0];
    let incrementor = 2;
    for (let i = 1; i < 33; ++i) {
        data[i] = toInt32(incrementor - 1);
        incrementor += incrementor;
    }
    return data;
}
