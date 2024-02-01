import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

export default class RandomAccessFile {
    fd: number;
    pos: number = 0;

    constructor(path: string, readOnly = false) {
        if (!fs.existsSync(path)) {
            fs.writeFileSync(path, '');
        }

        this.fd = fs.openSync(path, readOnly ? 'r' : 'r+');
    }

    get length(): number {
        return fs.fstatSync(this.fd).size;
    }

    gdata(length: number): Buffer {
        const buffer = Buffer.alloc(length);
        fs.readSync(this.fd, buffer, 0, length, this.pos);
        this.pos += length;
        return buffer;
    }

    gPacket(length: number): Packet {
        return new Packet(this.gdata(length));
    }

    pdata(buffer: Uint8Array | Buffer | Packet): void {
        if (buffer instanceof Packet) {
            buffer = buffer.data;
        }

        fs.writeSync(this.fd, buffer, 0, buffer.length, this.pos);
        this.pos += buffer.length;
    }

    close(): void {
        fs.closeSync(this.fd);
    }
}
