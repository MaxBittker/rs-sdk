// based on: https://github.com/raybellis/java-random + TS support

//
// An almost complete implementation in JS of the `java.util.Random`
// class from J2SE, designed to so far as possible produce the same
// output sequences as the Java original when supplied with the same
// seed.
//

const p2_16 = 0x0000000010000;
const p2_24 = 0x0000001000000;
const p2_27 = 0x0000008000000;
const p2_31 = 0x0000080000000;
const p2_32 = 0x0000100000000;
const p2_48 = 0x1000000000000;
const p2_53 = Math.pow(2, 53);	// NB: exceeds Number.MAX_SAFE_INTEGER

const m2_16 = 0xffff;

//
// multiplicative term for the PRNG
//
const [c2, c1, c0] = [0x0005, 0xdeec, 0xe66d];

let s2 = 0, s1 = 0, s0 = 0;

//
// 53-bit safe version of
// seed = (seed * 0x5DEECE66DL + 0xBL) & ((1L << 48) - 1)
//
function _next() {
    let carry = 0xb;

    let r0 = (s0 * c0) + carry;
    carry = r0 >>> 16;
    r0 &= m2_16;

    let r1 = (s1 * c0 + s0 * c1) + carry;
    carry = r1 >>> 16;
    r1 &= m2_16;

    let r2 = (s2 * c0 + s1 * c1 + s0 * c2) + carry;
    r2 &= m2_16;

    [s2, s1, s0] = [r2, r1, r0];

    return s2 * p2_16 + s1;
}

function next_signed(bits: number) {
    return _next() >> (32 - bits);
}

function next(bits: number) {
    return _next() >>> (32 - bits);
}

function checkIsPositiveInt(n: number, r = Number.MAX_SAFE_INTEGER) {
    if (n < 0 || n > r) {
        throw RangeError('number must be > 0');
    }
}

export default class JavaRandom {
    constructor(seedval?: number) {
        if (typeof seedval === 'undefined') {
            seedval = Math.floor(Math.random() * p2_48);
        }

        this.setSeed(seedval);
    }

    //
    // 53-bit safe version of
    // seed = (seed ^ 0x5DEECE66DL) & ((1L << 48) - 1)
    //
    setSeed(n: number) {
        checkIsPositiveInt(n);
        s0 = ((n) & m2_16) ^ c0;
        s1 = ((n / p2_16) & m2_16) ^ c1;
        s2 = ((n / p2_32) & m2_16) ^ c2;
    }

    // generate exclusive random number within bound
    nextInt(bound?: number) {
        if (bound === undefined) {
            return next_signed(32);
        }

        checkIsPositiveInt(bound, 0x7fffffff);

        // special case if bound is a power of two
        if ((bound & -bound) === bound) {
            const r = next(31) / p2_31;
            return ~~(bound * r);
        }

        let bits, val;
        do {
            bits = next(31);
            val = bits % bound;
        } while (bits - val + (bound - 1) < 0);
        return val;
    }

    nextLong() {
        const msb = BigInt(next_signed(32));
        const lsb = BigInt(next_signed(32));
        const p2_32n = BigInt(p2_32);
        return msb * p2_32n + lsb;
    }

    nextBoolean() {
        return next(1) != 0;
    }

    nextFloat() {
        return next(24) / p2_24;
    }

    nextDouble() {
        return (p2_27 * next(26) + next(27)) / p2_53;
    }
}
