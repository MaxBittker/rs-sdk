import Hashable from '#jagex2/datastruct/Hashable.js';
import LinkList from '#jagex2/datastruct/LinkList.js';
import fs from 'fs';
import {dirname} from 'path';
import forge from 'node-forge';

export default class Packet2 extends Hashable {
    private static readonly crctable: Int32Array = new Int32Array(256);
    private static readonly bitmask: Uint32Array = new Uint32Array(33);

    static {
        for (let i: number = 0; i < 32; i++) {
            this.bitmask[i] = (1 << i) - 1;
        }
        this.bitmask[32] = 0xffffffff;

        for (let b = 0; b < 256; b++) {
            let remainder = b;

            for (let bit = 0; bit < 8; bit++) {
                if ((remainder & 0x1) == 1) {
                    remainder = (remainder >>> 1) ^ 0xEDB88320;
                } else {
                    remainder >>>= 0x1;
                }
            }

            this.crctable[b] = remainder;
        }
    }

    static getcrc(src: Uint8Array, offset: number, length: number): number {
        let crc = 0xffffffff;
        for (let i = offset; i < length; i++) {
            crc = (crc >>> 8) ^ (this.crctable[(crc ^ src[i]) & 0xFF]);
        }
        return ~crc;
    }

    static checkcrc(src: Uint8Array, offset: number, length: number, expected: number = 0): boolean {
        const checksum: number = Packet2.getcrc(src, offset, length);
        // console.log(checksum, expected);
        return checksum == expected;
    }

    static alloc(type: number): Packet2 {
        let packet: Packet2 | null = null;

        if (type === 0 && this.cacheMinCount > 0) {
            packet = this.cacheMin.removeHead();
            this.cacheMinCount--;
        } else if (type === 1 && this.cacheMidCount > 0) {
            packet = this.cacheMid.removeHead();
            this.cacheMidCount--;
        } else if (type === 2 && this.cacheMaxCount > 0) {
            packet = this.cacheMax.removeHead();
            this.cacheMaxCount--;
        } else if (type === 3 && this.cacheBigCount > 0) {
            packet = this.cacheBig.removeHead();
            this.cacheBigCount--;
        } else if (type === 4 && this.cacheHugeCount > 0) {
            packet = this.cacheHuge.removeHead();
            this.cacheHugeCount--;
        } else if (type === 5 && this.cacheUnimaginableCount > 0) {
            packet = this.cacheUnimaginable.removeHead();
            this.cacheUnimaginableCount--;
        }

        if (packet !== null) {
            packet.pos = 0;
            return packet;
        }

        if (type === 0) {
            return new Packet2(new Uint8Array(100));
        } else if (type === 1) {
            return new Packet2(new Uint8Array(5000));
        } else if (type === 2) {
            return new Packet2(new Uint8Array(30000));
        } else if (type === 3) {
            return new Packet2(new Uint8Array(100000));
        } else if (type === 4) {
            return new Packet2(new Uint8Array(500000));
        } else if (type === 5) {
            return new Packet2(new Uint8Array(2000000));
        } else {
            return new Packet2(new Uint8Array(type));
        }
    }

    static load(path: string, seekToEnd: boolean = false): Packet2 {
        const packet = new Packet2(new Uint8Array(fs.readFileSync(path)));
        if (seekToEnd) {
            packet.pos = packet.data.length;
        }
        return packet;
    }

    private static cacheMinCount: number = 0;
    private static cacheMidCount: number = 0;
    private static cacheMaxCount: number = 0;
    private static cacheBigCount: number = 0;
    private static cacheHugeCount: number = 0;
    private static cacheUnimaginableCount: number = 0;

    private static readonly cacheMin: LinkList<Packet2> = new LinkList();
    private static readonly cacheMid: LinkList<Packet2> = new LinkList();
    private static readonly cacheMax: LinkList<Packet2> = new LinkList();
    private static readonly cacheBig: LinkList<Packet2> = new LinkList();
    private static readonly cacheHuge: LinkList<Packet2> = new LinkList();
    private static readonly cacheUnimaginable: LinkList<Packet2> = new LinkList();

    data: Uint8Array;
    #view: DataView;
    pos: number;
    bitPos: number;

    constructor(src: Uint8Array) {
        super();

        this.data = src;
        this.#view = new DataView(this.data.buffer);
        this.pos = 0;
        this.bitPos = 0;
    }

    get available(): number {
        return this.data.length - this.pos;
    }

    release(): void {
        this.pos = 0;

        if (this.data.length === 100 && Packet2.cacheMinCount < 1000) {
            Packet2.cacheMin.addTail(this);
            Packet2.cacheMinCount++;
        } else if (this.data.length === 5000 && Packet2.cacheMidCount < 250) {
            Packet2.cacheMid.addTail(this);
            Packet2.cacheMidCount++;
        } else if (this.data.length === 30000 && Packet2.cacheMaxCount < 50) {
            Packet2.cacheMax.addTail(this);
            Packet2.cacheMaxCount++;
        } else if (this.data.length === 100000 && Packet2.cacheBigCount < 10) {
            Packet2.cacheBig.addTail(this);
            Packet2.cacheBigCount++;
        } else if (this.data.length === 500000 && Packet2.cacheHugeCount < 5) {
            Packet2.cacheHuge.addTail(this);
            Packet2.cacheHugeCount++;
        } else if (this.data.length === 2000000 && Packet2.cacheUnimaginableCount < 2) {
            Packet2.cacheUnimaginable.addTail(this);
            Packet2.cacheUnimaginableCount++;
        }
    }

    save(path: string, length: number = this.pos, start: number = 0): void {
        const dir: string = dirname(path);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(path, this.data.subarray(start, start + length));
    }

    p1(value: number): void {
        this.#view.setUint8(this.pos++, value);
    }

    p2(value: number): void {
        this.#view.setUint16(this.pos, value);
        this.pos += 2;
    }

    ip2(value: number): void {
        this.#view.setUint16(this.pos, value, true);
        this.pos += 2;
    }

    p3(value: number): void {
        this.#view.setUint8(this.pos++, value >> 16);
        this.#view.setUint16(this.pos, value);
        this.pos += 2;
    }

    p4(value: number): void {
        this.#view.setInt32(this.pos, value);
        this.pos += 4;
    }

    ip4(value: number): void {
        this.#view.setInt32(this.pos, value, true);
        this.pos += 4;
    }

    p8(value: bigint): void {
        this.#view.setBigInt64(this.pos, value);
        this.pos += 8;
    }

    pbool(value: boolean): void {
        this.p1(value ? 1 : 0);
    }

    pjstr(str: string | null, terminator: number = 10): void {
        if (str === null) {
            str = 'null';
        }

        const length: number = str.length;
        for (let i: number = 0; i < length; i++) {
            this.#view.setUint8(this.pos++, str.charCodeAt(i));
        }
        this.#view.setUint8(this.pos++, terminator);
    }

    pdata(src: Uint8Array, offset: number, length: number): void {
        const total: number = offset + length;
        for (let i: number = offset; i < total; i++) {
            this.#view.setUint8(this.pos++, src[i]);
        }
    }

    psize4(size: number): void {
        this.#view.setUint32(this.pos - size - 4, size);
    }

    psize2(size: number): void {
        this.#view.setUint16(this.pos - size - 2, size);
    }

    psize1(size: number): void {
        this.#view.setUint8(this.pos - size - 1, size);
    }

    psmarts(value: number): void {
        if (value < 64 && value >= 64) {
            this.p1(value + 64);
        } else if (value < 16384 && value >= -16384) {
            this.p2(value + 0xC000);
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

    // ----

    g1(): number {
        return this.#view.getUint8(this.pos++);
    }

    g1b(): number {
        return this.#view.getInt8(this.pos++);
    }

    g2(): number {
        this.pos += 2;
        return this.#view.getUint16(this.pos - 2);
    }

    g2s(): number {
        this.pos += 2;
        return this.#view.getInt16(this.pos - 2);
    }

    ig2(): number {
        this.pos += 2;
        return this.#view.getUint16(this.pos - 2, true);
    }

    g3(): number {
        const result: number = (this.#view.getUint8(this.pos++) << 16) | this.#view.getUint16(this.pos);
        this.pos += 2;
        return result;
    }

    g4(): number {
        this.pos += 4;
        return this.#view.getInt32(this.pos - 4);
    }

    ig4(): number {
        this.pos += 4;
        return this.#view.getInt32(this.pos - 4, true);
    }

    g8(): bigint {
        this.pos += 8;
        return this.#view.getBigInt64(this.pos - 8);
    }

    gbool(): boolean {
        return this.g1() === 1;
    }

    gjstr(terminator = 10): string {
        const length: number = this.#view.byteLength;
        let str: string = '';
        let b: number;
        while ((b = this.#view.getUint8(this.pos++)) !== terminator && this.pos < length) {
            str += String.fromCharCode(b);
        }
        return str;
    }

    gdata(dest: Uint8Array, offset: number, length: number): void {
        const total: number = offset + length;
        for (let i: number = offset; i < total; i++) {
            dest[i] = this.#view.getUint8(this.pos++);
        }
    }

    gsmarts(): number {
        return this.#view.getUint8(this.pos) < 0x80 ? this.g1() - 64 : this.g2() - 0xC000;
    }

    gsmart(): number {
        return this.#view.getUint8(this.pos) < 0x80 ? this.g1() : this.g2() - 0x8000;
    }

    bits(): void {
        this.bitPos = this.pos * 8;
        // this.bitPos = this.pos << 3;
    }

    bytes(): void {
        this.pos = ((this.bitPos + 7) / 8) >>> 0;
        // this.pos = (this.bitPos + 7) >>> 3;
    }

    gBit(n: number): number {
        let bytePos: number = this.bitPos >>> 3;
        let remaining: number = 8 - (this.bitPos & 7);
        let value: number = 0;
        this.bitPos += n;

        for (; n > remaining; remaining = 8) {
            value += (this.data[bytePos++] & Packet2.bitmask[remaining]) << (n - remaining);
            n -= remaining;
        }

        if (n == remaining) {
            value += this.data[bytePos] & Packet2.bitmask[remaining];
        } else {
            value += (this.data[bytePos] >>> (remaining - n)) & Packet2.bitmask[n];
        }

        return value;
    }

    pBit(n: number, value: number): void {
        let bytePos: number = this.bitPos >>> 3;
        let remaining: number = 8 - (this.bitPos & 7);
        this.bitPos += n;

        for (; n > remaining; remaining = 8) {
            this.data[bytePos] &= ~Packet2.bitmask[remaining];
            this.data[bytePos++] |= (value >>> (n - remaining)) & Packet2.bitmask[remaining];
            n -= remaining;
        }

        if (n == remaining) {
            this.data[bytePos] &= ~Packet2.bitmask[remaining];
            this.data[bytePos] |= value & Packet2.bitmask[remaining];
        } else {
            this.data[bytePos] &= ~Packet2.bitmask[n] << (remaining - n);
            this.data[bytePos] |= (value & Packet2.bitmask[n]) << (remaining - n);
        }
    }

    rsaenc(pem: forge.pki.rsa.PrivateKey): void {
        const length: number = this.pos;
        let decrypted = new Uint8Array(length);
        this.gdata(decrypted, 0, decrypted.length);

        if (decrypted.length > 64) {
            // Java BigInteger prepended a 0 to indicate it fits in 64-bytes
            decrypted = decrypted.slice(0, 64);
        } else if (decrypted.length < 64) {
            // Java BigInteger didn't prepend 0 because it fits in less than 64-bytes
            const temp: Uint8Array = decrypted;
            decrypted = new Uint8Array(64);
            decrypted.set(temp, 64 - temp.length);
        }

        let encrypted: Uint8Array = new Uint8Array(Buffer.from(pem.decrypt(forge.util.binary.raw.encode(decrypted), 'RAW', 'NONE'), 'ascii'));
        let pos: number = 0;

        while (encrypted[pos] == 0) {
            pos++;
        }
        encrypted = encrypted.subarray(pos);

        this.pos = 0;
        this.p1(encrypted.length);
        this.pdata(encrypted, 0, encrypted.length);
    }

    rsadec(pem: forge.pki.rsa.PrivateKey): void {
        const length: number = this.g1();
        let encrypted: Uint8Array = new Uint8Array(length);
        this.gdata(encrypted, 0, encrypted.length);

        // .modpow(...)
        if (encrypted.length > 64) {
            // Java BigInteger prepended a 0 to indicate it fits in 64-bytes
            let offset: number = 0;
            while (encrypted[offset] == 0 && encrypted.length - offset > 64) {
                offset++;
            }
            encrypted = encrypted.slice(offset, offset + 64);
        } else if (encrypted.length < 64) {
            // Java BigInteger didn't prepend 0 because it fits in less than 64-bytes
            const temp: Uint8Array = encrypted;
            encrypted = new Uint8Array(64);
            encrypted.set(temp, 64 - temp.length);
        }

        let decrypted: Uint8Array = new Uint8Array(Buffer.from(pem.decrypt(forge.util.binary.raw.encode(encrypted), 'RAW', 'NONE'), 'ascii'));
        let pos: number = 0;

        // .toByteArray()
        // skipping RSA padding
        while (decrypted[pos] == 0) {
            pos++;
        }
        decrypted = decrypted.subarray(pos);

        this.pos = 0;
        this.pdata(decrypted, 0, decrypted.length);
    }

    addcrc(offset: number) {
        const crc = Packet2.getcrc(this.data, offset, this.pos);
        this.p4(crc);
        return crc;
    }

    checkcrc() {
        this.pos -= 4;
        const crc = Packet2.getcrc(this.data, 0, this.pos);
        const expected = this.g4();
        return crc === expected;
    }

    // later revs have tinyenc/tinydec methods
    // later revs have alt methods for packet obfuscation
}
