import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

import forge from 'node-forge';

import DoublyLinkable from '#/datastruct/DoublyLinkable.js';
import LinkList from '#/datastruct/LinkList.js';

import PrivateKey = forge.pki.rsa.PrivateKey;
import BigInteger = forge.jsbn.BigInteger;

export default class Packet extends DoublyLinkable {
    private static readonly CRC32_POLYNOMIAL: number = 0xedb88320;

    private static readonly crctable: Int32Array = new Int32Array(256);
    static readonly bitmask: Uint32Array = new Uint32Array(33);

    private static readonly cacheMin: LinkList<Packet> = new LinkList();
    private static readonly cacheMid: LinkList<Packet> = new LinkList();
    private static readonly cacheMax: LinkList<Packet> = new LinkList();
    private static readonly cacheBig: LinkList<Packet> = new LinkList();
    private static readonly cacheHuge: LinkList<Packet> = new LinkList();
    private static readonly cacheUnimaginable: LinkList<Packet> = new LinkList();

    private static cacheMinCount: number = 0;
    private static cacheMidCount: number = 0;
    private static cacheMaxCount: number = 0;
    private static cacheBigCount: number = 0;
    private static cacheHugeCount: number = 0;
    private static cacheUnimaginableCount: number = 0;

    static {
        for (let i: number = 0; i < 32; i++) {
            Packet.bitmask[i] = (1 << i) - 1;
        }
        Packet.bitmask[32] = 0xffffffff;

        for (let i: number = 0; i < 256; i++) {
            let remainder: number = i;

            for (let bit: number = 0; bit < 8; bit++) {
                if ((remainder & 1) === 1) {
                    remainder = (remainder >>> 1) ^ Packet.CRC32_POLYNOMIAL;
                } else {
                    remainder >>>= 1;
                }
            }

            Packet.crctable[i] = remainder;
        }
    }

    static getcrc(src: Uint8Array, offset: number, length: number): number {
        let crc = 0xffffffff;
        for (let i = offset; i < length; i++) {
            crc = (crc >>> 8) ^ this.crctable[(crc ^ src[i]) & 0xff];
        }
        return ~crc;
    }

    static checkcrc(src: Uint8Array, offset: number, length: number, expected: number = 0): boolean {
        return Packet.getcrc(src, offset, length) == expected;
    }

    // constructor
    private readonly view: DataView;
    readonly data: Uint8Array;

    // runtime
    pos: number = 0;
    bitPos: number = 0;

    constructor(src: Uint8Array | null) {
        if (!src) {
            throw new Error();
        }

        super();

        if (src instanceof Int8Array) {
            this.data = new Uint8Array(src);
        } else {
            this.data = src;
        }

        this.view = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
    }

    get length(): number {
        return this.view.byteLength;
    }

    get available(): number {
        return this.view.byteLength - this.pos;
    }

    static alloc(type: number): Packet {
        let cached: Packet | null = null;
        if (type === 0 && this.cacheMinCount > 0) {
            cached = this.cacheMin.removeHead();
            this.cacheMinCount--;
        } else if (type === 1 && this.cacheMidCount > 0) {
            cached = this.cacheMid.removeHead();
            this.cacheMidCount--;
        } else if (type === 2 && this.cacheMaxCount > 0) {
            cached = this.cacheMax.removeHead();
            this.cacheMaxCount--;
        } else if (type === 3 && this.cacheBigCount > 0) {
            cached = this.cacheBig.removeHead();
            this.cacheBigCount--;
        } else if (type === 4 && this.cacheHugeCount > 0) {
            cached = this.cacheHuge.removeHead();
            this.cacheHugeCount--;
        } else if (type === 5 && this.cacheUnimaginableCount > 0) {
            cached = this.cacheUnimaginable.removeHead();
            this.cacheUnimaginableCount--;
        }

        if (cached) {
            cached.pos = 0;
            return cached;
        }

        if (type === 0) {
            return new Packet(new Uint8Array(100));
        } else if (type === 1) {
            return new Packet(new Uint8Array(5000));
        } else if (type === 2) {
            return new Packet(new Uint8Array(30000));
        } else if (type === 3) {
            return new Packet(new Uint8Array(100000));
        } else if (type === 4) {
            return new Packet(new Uint8Array(500000));
        } else if (type === 5) {
            return new Packet(new Uint8Array(2000000));
        } else {
            return new Packet(new Uint8Array(type));
        }
    }

    release(): void {
        this.pos = 0;

        if (this.length === 100 && Packet.cacheMinCount < 1000) {
            Packet.cacheMin.addTail(this);
            Packet.cacheMinCount++;
        } else if (this.length === 5000 && Packet.cacheMidCount < 250) {
            Packet.cacheMid.addTail(this);
            Packet.cacheMidCount++;
        } else if (this.length === 30000 && Packet.cacheMaxCount < 50) {
            Packet.cacheMax.addTail(this);
            Packet.cacheMaxCount++;
        } else if (this.length === 100000 && Packet.cacheBigCount < 10) {
            Packet.cacheBig.addTail(this);
            Packet.cacheBigCount++;
        } else if (this.length === 500000 && Packet.cacheHugeCount < 5) {
            Packet.cacheHuge.addTail(this);
            Packet.cacheHugeCount++;
        } else if (this.length === 2000000 && Packet.cacheUnimaginableCount < 2) {
            Packet.cacheUnimaginable.addTail(this);
            Packet.cacheUnimaginableCount++;
        }
    }

    static load(path: string, seekToEnd: boolean = false): Packet {
        const packet = new Packet(new Uint8Array(fs.readFileSync(path)));
        if (seekToEnd) {
            packet.pos = packet.data.length;
        }
        return packet;
    }

    static async fetch(url: string, seekToEnd: boolean = false): Promise<Packet> {
        const packet = new Packet(new Uint8Array(await (await fetch(url)).arrayBuffer()));
        if (seekToEnd) {
            packet.pos = packet.data.length;
        }
        return packet;
    }

    save(filePath: string, length: number = this.pos, start: number = 0): void {
        const dir: string = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, this.data.subarray(start, start + length));
    }

    saveGz(filePath: string, length: number = this.pos, start: number = 0): void {
        const dir: string = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const compressed = zlib.gzipSync(this.data.subarray(start, start + length));
        compressed[9] = 0;
        fs.writeFileSync(filePath, compressed);
    }

    // ----

    g1(): number {
        return this.view.getUint8(this.pos++);
    }

    g1b(): number {
        return this.view.getInt8(this.pos++);
    }

    g2(): number {
        const result: number = this.view.getUint16(this.pos);
        this.pos += 2;
        return result;
    }

    g2s(): number {
        const result: number = this.view.getInt16(this.pos);
        this.pos += 2;
        return result;
    }

    ig2(): number {
        const result: number = this.view.getUint16(this.pos, true);
        this.pos += 2;
        return result;
    }

    g3(): number {
        this.pos += 3;
        return (this.data[this.pos - 3] << 16) +
            (this.data[this.pos - 2] << 8) +
            this.data[this.pos - 1];
    }

    g3s() {
        this.pos += 3;
        const v = (this.data[this.pos - 3] << 16) +
            (this.data[this.pos - 2] << 8) +
            this.data[this.pos - 1];
        return v > 0xFFFFFF ? v - 0x1000000 : v;
    }

    g4(): number {
        const result: number = this.view.getUint32(this.pos);
        this.pos += 4;
        return result;
    }

    g4s(): number {
        const result: number = this.view.getInt32(this.pos);
        this.pos += 4;
        return result;
    }

    g8(): bigint {
        const result: bigint = this.view.getBigInt64(this.pos);
        this.pos += 8;
        return result;
    }

    gbool(): boolean {
        return this.g1() === 1;
    }

    gjstr(terminator: number = 10): string {
        const view: DataView = this.view;
        const length: number = view.byteLength;
        let str: string = '';
        let b: number;
        while ((b = view.getUint8(this.pos++)) !== terminator && this.pos < length) {
            str += String.fromCharCode(b);
        }
        return str;
    }

    gsmart(): number {
        return this.view.getUint8(this.pos) < 0x80 ? this.g1() - 0x40 : this.g2() - 0xc000;
    }

    gsmarts(): number {
        return this.view.getUint8(this.pos) < 0x80 ? this.g1() : this.g2() - 0x8000;
    }

    gdata(dest: Uint8Array, offset: number, length: number): void {
        dest.set(this.data.subarray(this.pos, this.pos + length), offset);
        this.pos += length;
    }

    gVarInt(): number {
        let byte = this.view.getUint8(this.pos++);
        let result = 0;

        while ((byte & 0x80) !== 0) {
            result = (result | (byte & 0x7F)) << 7;
            byte = this.view.getUint8(this.pos++);
        }

        return (result | byte) >>> 0;
    }

    p1(value: number): void {
        this.view.setUint8(this.pos++, value);
    }

    p2(value: number): void {
        this.view.setUint16(this.pos, value);
        this.pos += 2;
    }

    ip2(value: number): void {
        this.view.setUint16(this.pos, value, true);
        this.pos += 2;
    }

    p3(value: number): void {
        this.view.setUint8(this.pos++, value >> 16);
        this.view.setUint16(this.pos, value);
        this.pos += 2;
    }

    p4(value: number): void {
        this.view.setInt32(this.pos, value);
        this.pos += 4;
    }

    ip4(value: number): void {
        this.view.setInt32(this.pos, value, true);
        this.pos += 4;
    }

    p8(value: bigint): void {
        this.view.setBigInt64(this.pos, value);
        this.pos += 8;
    }

    pbool(value: boolean): void {
        this.p1(value ? 1 : 0);
    }

    pjstr(str: string): void {
        const view: DataView = this.view;
        const length: number = str.length;
        for (let i: number = 0; i < length; i++) {
            view.setUint8(this.pos++, str.charCodeAt(i));
        }
        view.setUint8(this.pos++, 10);
    }

    pdata(src: Uint8Array, offset: number, length: number): void {
        this.data.set(src.subarray(offset, offset + length), this.pos);
        this.pos += length - offset;
    }

    psize4(size: number): void {
        this.view.setUint32(this.pos - size - 4, size);
    }

    psize2(size: number): void {
        this.view.setUint16(this.pos - size - 2, size);
    }

    psize1(size: number): void {
        this.view.setUint8(this.pos - size - 1, size);
    }

    psmarts(value: number): void {
        if (value < 64 && value >= -64) {
            this.p1(value + 64);
        } else if (value < 16384 && value >= -16384) {
            this.p2(value + 0xc000);
        } else {
            throw new Error('Error psmarts out of range: ' + value);
        }
    }

    psmart(value: number): void {
        if (value >= 0 && value < 128) {
            this.p1(value);
        } else if (value >= 0 && value < 32768) {
            this.p2(value + 0x8000);
        } else {
            throw new Error('Error psmart out of range: ' + value);
        }
    }

    pVarInt(value: number) {
        if ((value & 0xFFFFFF80) != 0) {
            if ((value & 0xFFFFC000) != 0) {
                if ((value & 0xFFE00000) != 0) {
                    if ((value & 0xF0000000) != 0) {
                        this.view.setUint8(this.pos++, (value >>> 28) | 0x80);
                    }

                    this.view.setUint8(this.pos++, (value >>> 21) | 0x80);
                }

                this.view.setUint8(this.pos++, (value >>> 14) | 0x80);
            }

            this.view.setUint8(this.pos++, (value >>> 7) | 0x80);
        }

        this.view.setUint8(this.pos++, value & 0x7F);
    }

    bitStart(): void {
        this.bitPos = this.pos << 3;
    }

    bitEnd(): void {
        this.pos = (this.bitPos + 7) >>> 3;
    }

    gBit(n: number): number {
        let bytePos: number = this.bitPos >>> 3;
        let remaining: number = 8 - (this.bitPos & 7);
        let value: number = 0;
        this.bitPos += n;

        for (; n > remaining; remaining = 8) {
            value += (this.view.getUint8(bytePos++) & Packet.bitmask[remaining]) << (n - remaining);
            n -= remaining;
        }

        if (n === remaining) {
            value += this.view.getUint8(bytePos) & Packet.bitmask[remaining];
        } else {
            value += (this.view.getUint8(bytePos) >>> (remaining - n)) & Packet.bitmask[n];
        }

        return value;
    }

    pBit(n: number, value: number): void {
        const pos: number = this.bitPos;
        this.bitPos += n;
        let bytePos: number = pos >>> 3;
        let remaining: number = 8 - (pos & 7);

        for (; n > remaining; remaining = 8) {
            const shift: number = (1 << remaining) - 1;
            const byte: number = this.data[bytePos];
            this.data[bytePos++] = (byte & ~shift) | ((value >>> (n - remaining)) & shift);
            n -= remaining;
        }

        const r: number = remaining - n;
        const shift: number = (1 << n) - 1;
        const byte: number = this.data[bytePos];
        this.data[bytePos] = (byte & (~shift << r)) | ((value & shift) << r);
    }

    rsaenc(pem: PrivateKey): void {
        const length: number = this.pos;
        this.pos = 0;

        const dec: Uint8Array = new Uint8Array(length);
        this.gdata(dec, 0, dec.length);

        const bigRaw: BigInteger = new BigInteger(Array.from(dec));
        const rawEnc: Uint8Array = Uint8Array.from(bigRaw.modPow(pem.e, pem.n).toByteArray());

        this.pos = 0;
        this.p1(rawEnc.length);
        this.pdata(rawEnc, 0, rawEnc.length);
    }

    rsadec(pem: PrivateKey): void {
        const enc: Uint8Array = new Uint8Array(this.g1());
        this.gdata(enc, 0, enc.length);

        const cipher: BigInteger = new BigInteger(Array.from(enc));

        // decrypt using the Chinese Remainder Theorem
        const p: BigInteger = pem.p;
        const q: BigInteger = pem.q;
        const dP: BigInteger = pem.dP;
        const dQ: BigInteger = pem.dQ;
        const qInv: BigInteger = pem.qInv;

        const mP: BigInteger = cipher.modPow(dP, p);
        const mQ: BigInteger = cipher.modPow(dQ, q);

        const h: BigInteger = qInv.multiply(mP.subtract(mQ)).mod(p);

        const plain: Uint8Array = Uint8Array.from(mQ.add(h.multiply(q)).toByteArray());

        this.pos = 0;
        this.pdata(plain, 0, plain.length);
        this.pos = 0;
    }

    // later revs have tinyenc/tinydec methods
    // later revs have alt methods for packet obfuscation
}
