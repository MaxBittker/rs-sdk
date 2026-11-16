import { delay } from '#/util/WorkerTimer.js';

// Backed by a worker clock so the main loop keeps its rate in a background tab,
// where Chrome would otherwise throttle setTimeout to one wake per second.
export const sleep = async (ms: number): Promise<void> => delay(ms);

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
    return bytes.length > 0 ? BigInt.asIntN(bytes.length * 8, result) : 0n;
}

export function bigIntToBytes(bigInt: bigint): Uint8Array {
    const bytes: number[] = [];
    while (bigInt > 0n) {
        bytes.unshift(Number(bigInt & 0xffn));
        bigInt >>= 8n;
    }

    if (bytes.length === 0 || bytes[0] & 0x80) {
        bytes.unshift(0);
    }

    return new Uint8Array(bytes);
}

export function bigIntModPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
    base = ((base % modulus) + modulus) % modulus;
    let result: bigint = 1n % modulus;
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
