export const sleep = async (ms: number): Promise<void> => new Promise((resolve): NodeJS.Timeout => setTimeout(resolve, ms));

export const downloadUrl = async (url: string): Promise<Uint8Array> => new Uint8Array(await (await fetch(url)).arrayBuffer());

export const downloadText = async (url: string): Promise<string> => (await fetch(url)).text();

export function arraycopy(src: Int32Array | Uint8Array, srcPos: number, dst: Int32Array | Uint8Array, dstPos: number, length: number): void {
    while (length--) dst[dstPos++] = src[srcPos++];
}

export function bytesToBigInt(bytes: Uint8Array): bigint {
    let result: bigint = 0n;
    for (let index: number = 0; index < bytes.length; index++) {
        result = (result << 8n) | BigInt(bytes[index]);
    }
    return result;
}

export function bigIntToBytes(bigInt: bigint): Uint8Array {
    const bytes: number[] = [];
    while (bigInt > 0n) {
        bytes.unshift(Number(bigInt & 0xffn));
        bigInt >>= 8n;
    }

    if (bytes[0] & 0x80) {
        bytes.unshift(0);
    }

    return new Uint8Array(bytes);
}

export function bigIntModPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
    let result: bigint = 1n;
    while (exponent > 0n) {
        if (exponent % 2n === 1n) {
            result = (result * base) % modulus;
        }
        base = (base * base) % modulus;
        exponent >>= 1n;
    }
    return result;
}

export function mulShift16(a: number, b: number): number {
    // (int) (((long) a * (long) b) >> 16);
    return Number(BigInt.asIntN(32, (BigInt(a) * BigInt(b)) >> 16n));
}
