import fs from 'fs';
import zlib from 'zlib';

import Packet from '#/io/Packet.js';
import RandomAccessFile from '#/util/RandomAccessFile.js';

export default class FileStream {
    dat: RandomAccessFile;
    idx: RandomAccessFile[] = [];

    discardPacked: boolean = false;
    packed: Uint8Array[][] = [];

    constructor(dir: string, createNew: boolean = false, readOnly: boolean = false) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        if (createNew || !fs.existsSync(`${dir}/main_file_cache.dat`)) {
            fs.writeFileSync(`${dir}/main_file_cache.dat`, '');

            for (let i: number = 0; i <= 4; i++) {
                fs.writeFileSync(`${dir}/main_file_cache.idx${i}`, '');
            }
        }

        this.dat = new RandomAccessFile(`${dir}/main_file_cache.dat`, readOnly);

        for (let i: number = 0; i <= 4; i++) {
            this.idx[i] = new RandomAccessFile(`${dir}/main_file_cache.idx${i}`, readOnly);
            this.packed[i] = [];
        }
    }

    private normalizeWriteData(data: Uint8Array | Packet, version: number): Uint8Array {
        if (data instanceof Packet) {
            data = data.data;
        }

        if (version === 0) {
            return data;
        }

        const temp = new Uint8Array(data.length + 2);
        temp.set(data, 0);
        temp[temp.length - 2] = version >> 8;
        temp[temp.length - 1] = version;
        return temp;
    }

    private static equalsData(a: Uint8Array, b: Uint8Array): boolean {
        if (a.length !== b.length) {
            return false;
        }

        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) {
                return false;
            }
        }

        return true;
    }

    count(index: number): number {
        if (index < 0 || index > this.idx.length || !this.idx[index]) {
            return 0;
        }

        return this.idx[index].length / 6;
    }

    read(archive: number, file: number, decompress: boolean = false): Uint8Array | null {
        if (!this.dat) {
            return null;
        }

        if (archive < 0 || archive >= this.idx.length || !this.idx[archive]) {
            return null;
        }

        if (file < 0 || file >= this.count(archive)) {
            return null;
        }

        if (this.packed[archive][file]) {
            return this.packed[archive][file];
        }

        const idx: RandomAccessFile = this.idx[archive];
        idx.pos = file * 6;
        const idxHeader: Packet = idx.gPacket(6);

        const size: number = idxHeader.g3();
        let sector: number = idxHeader.g3();

        if (size > 2000000) {
            return null;
        }

        if (sector <= 0 || sector > this.dat.length / 520) {
            return null;
        }

        const data: Packet = new Packet(new Uint8Array(size));
        for (let part: number = 0; data.pos < size; part++) {
            if (sector === 0) {
                break;
            }

            this.dat.pos = sector * 520;

            let available: number = size - data.pos;
            if (available > 512) {
                available = 512;
            }

            const header: Packet = this.dat.gPacket(available + 8);
            const sectorFile: number = header.g2();
            const sectorPart: number = header.g2();
            const nextSector: number = header.g3();
            const sectorIndex: number = header.g1();

            if (file !== sectorFile || part !== sectorPart || archive !== sectorIndex - 1) {
                return null;
            }

            if (nextSector < 0 || nextSector > this.dat.length / 520) {
                return null;
            }

            data.pdata(header.data, header.pos, header.data.length);

            sector = nextSector;
        }

        if (!decompress) {
            if (!this.discardPacked) {
                this.packed[archive][file] = data.data;
            }

            return data.data;
        }

        if (archive === 0) {
            return data.data;
        } else {
            return new Uint8Array(zlib.gunzipSync(data.data));
        }
    }

    write(archive: number, file: number, data: Uint8Array, version: number = 0): boolean {
        if (!this.dat) {
            return false;
        }

        if (archive < 0 || archive > this.idx.length || !this.idx[archive] || file < 0) {
            return false;
        }

        data = this.normalizeWriteData(data, version);

        const existing = this.read(archive, file);
        if (existing && FileStream.equalsData(existing, data)) {
            this.packed[archive][file] = data;
            return true;
        }

        const idx: RandomAccessFile = this.idx[archive];
        let sector = Math.trunc((this.dat.length + 519) / 520);
        if (sector === 0) {
            sector = 1;
        }

        idx.pos = file * 6;
        const idxHeader: Packet = new Packet(new Uint8Array(6));
        idxHeader.p3(data.length);
        idxHeader.p3(sector);
        idx.pdata(idxHeader);

        let written: number = 0;
        for (let part: number = 0; written < data.length; part++) {
            let nextSector = Math.trunc((this.dat.length + 519) / 520);
            if (nextSector === 0) {
                nextSector++;
            }

            if (nextSector === sector) {
                nextSector++;
            }

            if (data.length - written <= 512) {
                nextSector = 0;
            }

            this.dat.pos = sector * 520;
            const header: Packet = new Packet(new Uint8Array(8));
            header.p2(file);
            header.p2(part);
            header.p3(nextSector);
            header.p1(archive + 1);
            this.dat.pdata(header);

            let available: number = data.length - written;
            if (available > 512) {
                available = 512;
            }

            this.dat.pdata(data.subarray(written, written + available));
            written += available;
            sector = nextSector;
        }

        return true;
    }

    clearArchive(archive: number): void {
        if (archive < 0 || archive >= this.idx.length || !this.idx[archive]) {
            return;
        }

        this.idx[archive].truncate(0);
        this.packed[archive] = [];
    }

    close(): void {
        this.dat.close();

        for (const idx of this.idx) {
            idx.close();
        }
    }

    has(archive: number, file: number): boolean {
        if (!this.dat) {
            return false;
        }

        if (archive < 0 || archive >= this.idx.length || !this.idx[archive]) {
            return false;
        }

        if (file < 0 || file >= this.count(archive)) {
            return false;
        }

        if (this.packed[archive][file]) {
            return true;
        }

        const idx: RandomAccessFile = this.idx[archive];
        idx.pos = file * 6;
        const idxHeader: Packet = idx.gPacket(6);

        const size: number = idxHeader.g3();
        const sector: number = idxHeader.g3();

        if (size > 2000000) {
            return false;
        }

        if (sector <= 0 || sector > this.dat.length / 520) {
            return false;
        }

        return true;
    }
}
