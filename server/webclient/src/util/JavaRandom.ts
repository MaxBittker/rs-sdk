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
const p2_48 = 0x1000000000000;
const p2_53 = Math.pow(2, 53);	// NB: exceeds Number.MAX_SAFE_INTEGER

const m2_16 = 0xffff;

//
// multiplicative term for the PRNG
//
const [c2, c1, c0] = [0x0005, 0xdeec, 0xe66d];

export default class JavaRandom {
    // 48-bit seed
    private s2: number = 0;
    private s1: number = 0;
    private s0: number = 0;

    constructor(seedval?: number) {
        if (typeof seedval === 'undefined') {
            seedval = Math.floor(Math.random() * p2_48);
        }

        this.setSeed(seedval);
    }

    //
    // seed = (seed ^ 0x5DEECE66DL) & ((1L << 48) - 1)
    //
    setSeed(n: number) {
        const seed: bigint = BigInt.asUintN(48, BigInt(Math.trunc(n)));
        this.s0 = Number(seed & 0xffffn) ^ c0;
        this.s1 = Number((seed >> 16n) & 0xffffn) ^ c1;
        this.s2 = Number((seed >> 32n) & 0xffffn) ^ c2;
    }

    //
    // 53-bit safe version of
    // seed = (seed * 0x5DEECE66DL + 0xBL) & ((1L << 48) - 1)
    //
    private advance(): number {
        const s0 = this.s0;
        const s1 = this.s1;
        const s2 = this.s2;
        let carry = 0xb;

        let r0 = (s0 * c0) + carry;
        carry = r0 >>> 16;
        r0 &= m2_16;

        let r1 = (s1 * c0 + s0 * c1) + carry;
        carry = r1 >>> 16;
        r1 &= m2_16;

        let r2 = (s2 * c0 + s1 * c1 + s0 * c2) + carry;
        r2 &= m2_16;

        this.s2 = r2;
        this.s1 = r1;
        this.s0 = r0;

        return r2 * p2_16 + r1;
    }

    private nextSigned(bits: number): number {
        return this.advance() >> (32 - bits);
    }

    private next(bits: number): number {
        return this.advance() >>> (32 - bits);
    }

    // generate exclusive random number within bound
    nextInt(bound?: number) {
        if (bound === undefined) {
            return this.nextSigned(32);
        }

        if (bound <= 0 || bound > 0x7fffffff) {
            throw RangeError();
        }

        // special case if bound is a power of two
        if ((bound & -bound) === bound) {
            const r = this.next(31) / p2_31;
            return ~~(bound * r);
        }

        let bits, val;
        do {
            bits = this.next(31);
            val = bits % bound;
        } while (((bits - val + (bound - 1)) | 0) < 0);
        return val;
    }

    nextLong() {
        const msb = BigInt(this.nextSigned(32));
        const lsb = BigInt(this.nextSigned(32));
        return BigInt.asIntN(64, (msb << 32n) + lsb);
    }

    nextBoolean() {
        return this.next(1) != 0;
    }

    nextFloat() {
        return this.next(24) / p2_24;
    }

    nextDouble() {
        return (p2_27 * this.next(26) + this.next(27)) / p2_53;
    }
}
