import fs from 'fs';
import forge from 'node-forge';
import { dirname } from 'path';

export default class Packet {
    static crctable: Int32Array = new Int32Array(256);
    static CRC32_POLYNOMIAL: number = 0xEDB88320;

    static bitmask: Uint32Array = new Uint32Array(33);

    static {
        for (let i = 0; i < 32; i++) {
            Packet.bitmask[i] = (1 << i) - 1;
        }
        Packet.bitmask[32] = 0xFFFFFFFF;

        for (let i = 0; i < 256; i++) {
            let remainder = i;

            for (let bit = 0; bit < 8; bit++) {
                if ((remainder & 1) == 1) {
                    remainder = (remainder >>> 1) ^ Packet.CRC32_POLYNOMIAL;
                } else {
                    remainder >>>= 1;
                }
            }

            Packet.crctable[i] = remainder;
        }
    }

    data: Uint8Array;
    pos: number = 0;
    bitPos: number = 0;

    constructor(src?: Uint8Array | Buffer | Packet) {
        if (src instanceof Packet) {
            this.data = new Uint8Array(src.data);
        } else if (src) {
            this.data = new Uint8Array(src);
        } else {
            this.data = new Uint8Array();
        }

        this.pos = 0;
        this.bitPos = 0;
    }

    static alloc(size: number): Packet {
        return new Packet(new Uint8Array(size));
    }

    get length() {
        return this.data.length;
    }

    get available() {
        return this.data.length - this.pos;
    }

    resize(size: number) {
        if (this.data.length < size) {
            const temp = new Uint8Array(size);
            temp.set(this.data);
            this.data = temp;
        }
    }

    ensure(size: number) {
        if (this.available < size) {
            this.resize(this.pos + size);
        }
    }

    // ----

    static crc32(src: Packet | Uint8Array | Buffer, length = src.length, offset = 0) {
        if (src instanceof Packet) {
            src = src.data;
        }

        let crc = 0xFFFFFFFF;

        for (let i = offset; i < offset + length; i++) {
            crc = crc >>> 8 ^ Packet.crctable[(crc ^ src[i]) & 0xFF];
        }

        return ~crc;
    }

    static load(path: string): Packet {
        return new Packet(fs.readFileSync(path));
    }

    save(path: string, length = this.pos, start = 0) {
        const dir = dirname(path);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(path, this.data.subarray(start, start + length));
    }

    // ----

    p1(value: number) {
        this.ensure(1);
        this.data[this.pos++] = value;
    }

    pbool(value: boolean) {
        this.ensure(1);
        this.data[this.pos++] = value ? 1 : 0;
    }

    p2(value: number) {
        this.ensure(2);
        this.data[this.pos++] = value >>> 8;
        this.data[this.pos++] = value;
    }

    ip2(value: number) {
        this.ensure(2);
        this.data[this.pos++] = value;
        this.data[this.pos++] = value >>> 8;
    }

    p3(value: number) {
        this.ensure(3);
        this.data[this.pos++] = value >>> 16;
        this.data[this.pos++] = value >>> 8;
        this.data[this.pos++] = value;
    }

    p4(value: number) {
        this.ensure(4);
        this.data[this.pos++] = value >>> 24;
        this.data[this.pos++] = value >>> 16;
        this.data[this.pos++] = value >>> 8;
        this.data[this.pos++] = value;
    }

    ip4(value: number) {
        this.ensure(4);
        this.data[this.pos++] = value;
        this.data[this.pos++] = value >>> 8;
        this.data[this.pos++] = value >>> 16;
        this.data[this.pos++] = value >>> 24;
    }

    p8(value: bigint) {
        this.ensure(8);
        this.p4(Number(value >> 32n));
        this.p4(Number(value & 0xFFFFFFFFn));
    }

    pjstr(str: string | null) {
        if (str === null) {
            str = 'null';
        }
        this.ensure(str.length + 1);
        for (let i = 0; i < str.length; i++) {
            this.data[this.pos++] = str.charCodeAt(i);
        }
        this.data[this.pos++] = 10;
    }

    pjnstr(str: string) {
        this.ensure(str.length + 1);
        for (let i = 0; i < str.length; i++) {
            this.data[this.pos++] = str.charCodeAt(i);
        }
        this.data[this.pos++] = 0;
    }

    pdata(src: Uint8Array | Buffer | Packet, advance: boolean = true) {
        if (src instanceof Packet) {
            src = src.data;
        }

        if (!src.length) {
            return;
        }

        this.ensure(src.length);
        this.data.set(src, this.pos);

        if (advance) {
            this.pos += src.length;
        }
    }

    psize4(size: number) {
        this.data[this.pos - size - 4] = size >>> 24;
        this.data[this.pos - size - 3] = size >>> 16;
        this.data[this.pos - size - 2] = size >>> 8;
        this.data[this.pos - size - 1] = size;
    }

    psize2(size: number) {
        this.data[this.pos - size - 2] = size >>> 8;
        this.data[this.pos - size - 1] = size;
    }

    psize1(size: number) {
        this.data[this.pos - size - 1] = size;
    }

    psmart(value: number) {
        if (value < 0x80) {
            this.p1(value);
        } else if (value < 0x8000) {
            this.p2(value + 0x8000);
        } else {
            console.trace(`Error psmart out of range: ${value}`);
        }
    }

    psmarts(value: number) {
        if (value < 0x40 && value >= -0x40) {
            this.p1(value + 0x40);
        } else if (value < 0x4000 && value >= -0x4000) {
            this.p2(value + 0xC000);
        } else {
            console.trace(`Error psmarts out of range: ${value}`);
        }
    }

    // ----

    g1(): number {
        return this.data[this.pos++];
    }

    gbool(): boolean {
        return this.g1() === 1;
    }

    g1s(): number {
        let value = this.g1();
        if (value > 0x7F) {
            value -= 0x100;
        }
        return value;
    }

    g2(): number {
        return ((this.data[this.pos++] << 8) | this.data[this.pos++]) >>> 0;
    }

    ig2(): number {
        return (this.data[this.pos++] >>> 0 | (this.data[this.pos++]) << 8);
    }

    g2s(): number {
        let value = this.g2();
        if (value > 0x7FFF) {
            value -= 0x10000;
        }
        return value;
    }

    g3(): number {
        return ((this.data[this.pos++] << 16) | (this.data[this.pos++] << 8) | this.data[this.pos++]) >>> 0;
    }

    g4(): number {
        return ((this.data[this.pos++] << 24) | (this.data[this.pos++] << 16) | (this.data[this.pos++] << 8) | this.data[this.pos++]) >>> 0;
    }

    ig4(): number {
        return (this.data[this.pos++] >>> 0 | (this.data[this.pos++] << 8) | (this.data[this.pos++] << 16) | (this.data[this.pos++] << 24));
    }

    g4s(): number {
        let value = this.g4();
        if (value > 0x7FFFFFFF) {
            value -= 0x100000000;
        }
        return value;
    }

    g8(): bigint {
        return (BigInt(this.g4()) << 32n) | BigInt(this.g4());
    }

    gjstr(): string {
        let str = '';
        while (this.data[this.pos] != 10 && this.pos < this.data.length) {
            str += String.fromCharCode(this.data[this.pos++]);
        }
        this.pos++;
        return str;
    }

    gjnstr(): string {
        let str = '';
        while (this.data[this.pos] != 0) {
            str += String.fromCharCode(this.data[this.pos++]);
        }
        this.pos++;
        return str;
    }

    gdata(length: number = this.available, offset: number = this.pos, advance: boolean = true): Uint8Array {
        const temp = this.data.subarray(offset, offset + length);
        if (advance) {
            this.pos += length;
        }
        return temp;
    }

    gPacket(length: number = this.available, offset: number = this.pos, advance: boolean = true): Packet {
        return new Packet(this.gdata(length, offset, advance));
    }

    gsmart(): number {
        return (this.data[this.pos] & 0xFF) < 0x80 ? this.g1() : this.g2() - 0x8000;
    }

    gsmarts(): number {
        return (this.data[this.pos] & 0xFF) < 0x80 ? this.g1() - 0x40 : this.g2() - 0xC000;
    }

    // ----

    bits() {
        this.bitPos = this.pos * 8;
        // this.bitPos = this.pos << 3;
    }

    bytes() {
        this.pos = ((this.bitPos + 7) / 8) >>> 0;
        // this.pos = (this.bitPos + 7) >>> 3;
    }

    gBit(n: number) {
        let bytePos = this.bitPos >>> 3;
        let remaining = 8 - (this.bitPos & 7);
        let value = 0;
        this.bitPos += n;

        for (; n > remaining; remaining = 8) {
            value += (this.data[bytePos++] & Packet.bitmask[remaining]) << (n - remaining);
            n -= remaining;
        }

        if (n == remaining) {
            value += this.data[bytePos] & Packet.bitmask[remaining];
        } else {
            value += (this.data[bytePos] >>> (remaining - n)) & Packet.bitmask[n];
        }

        return value;
    }

    pBit(n: number, value: number) {
        let bytePos = this.bitPos >>> 3;
        let remaining = 8 - (this.bitPos & 7);
        this.bitPos += n;

        // grow if necessary
        if (bytePos + 1 > this.length) {
            this.resize(bytePos + 1);
        }

        for (; n > remaining; remaining = 8) {
            this.data[bytePos] &= ~Packet.bitmask[remaining];
            this.data[bytePos++] |= (value >>> (n - remaining)) & Packet.bitmask[remaining];
            n -= remaining;

            // grow if necessary
            if (bytePos + 1 > this.length) {
                this.resize(bytePos + 1);
            }
        }

        if (n == remaining) {
            this.data[bytePos] &= ~Packet.bitmask[remaining];
            this.data[bytePos] |= value & Packet.bitmask[remaining];
        } else {
            this.data[bytePos] &= ~Packet.bitmask[n] << (remaining - n);
            this.data[bytePos] |= (value & Packet.bitmask[n]) << (remaining - n);
        }
    }

    // ----

    rsadec(pem: forge.pki.rsa.PrivateKey) {
        const length = this.g1();
        let encrypted = this.gdata(length);

        // .modpow(...)
        if (encrypted.length > 64) {
            // Java BigInteger prepended a 0 to indicate it fits in 64-bytes
            let offset = 0;
            while (encrypted[offset] == 0 && encrypted.length - offset > 64) {
                offset++;
            }
            encrypted = encrypted.slice(offset, offset + 64);
        } else if (encrypted.length < 64) {
            // Java BigInteger didn't prepend 0 because it fits in less than 64-bytes
            const temp = encrypted;
            encrypted = new Uint8Array(64);
            encrypted.set(temp, 64 - temp.length);
        }

        let decrypted = new Uint8Array(Buffer.from(pem.decrypt(forge.util.binary.raw.encode(encrypted), 'RAW', 'NONE'), 'ascii'));
        let pos = 0;

        // .toByteArray()
        // skipping RSA padding
        while (decrypted[pos] == 0) {
            pos++;
        }
        decrypted = decrypted.subarray(pos);

        this.pos = 0;
        this.pdata(decrypted, false);
    }

    rsaenc(pem: forge.pki.rsa.PrivateKey) {
        const length = this.pos;
        let decrypted = this.gdata(length);

        if (decrypted.length > 64) {
            // Java BigInteger prepended a 0 to indicate it fits in 64-bytes
            decrypted = decrypted.slice(0, 64);
        } else if (decrypted.length < 64) {
            // Java BigInteger didn't prepend 0 because it fits in less than 64-bytes
            const temp = decrypted;
            decrypted = new Uint8Array(64);
            decrypted.set(temp, 64 - temp.length);
        }

        let encrypted = new Uint8Array(Buffer.from(pem.decrypt(forge.util.binary.raw.encode(decrypted), 'RAW', 'NONE'), 'ascii'));
        let pos = 0;

        while (encrypted[pos] == 0) {
            pos++;
        }
        encrypted = encrypted.subarray(pos);

        this.pos = 0;
        this.p1(encrypted.length);
        this.pdata(encrypted, false);
    }
}
