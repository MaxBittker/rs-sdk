export class Packet {
    readonly data: Uint8Array;
    private readonly view: DataView;

    pos = 0;
    bitPos = 0;

    constructor(length: number) {
        this.data = new Uint8Array(length);
        this.view = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
    }

    get len(): number {
        return this.data.length;
    }

    p1(value: number): void {
        this.data[this.pos++] = value & 0xff;
    }

    p2(value: number): void {
        this.view.setUint16(this.pos, value & 0xffff);
        this.pos += 2;
    }

    ip2(value: number): void {
        this.view.setUint16(this.pos, value & 0xffff, true);
        this.pos += 2;
    }

    p4(value: number): void {
        this.view.setInt32(this.pos, value | 0);
        this.pos += 4;
    }

    pjstr(value: string, terminator: number): void {
        for (let index = 0; index < value.length; index++) {
            this.data[this.pos++] = value.charCodeAt(index) & 0xff;
        }
        this.data[this.pos++] = terminator & 0xff;
    }

    pdata(src: Uint8Array, offset: number, length: number): void {
        this.data.set(src.subarray(offset, offset + length), this.pos);
        this.pos += length;
    }

    bits(): void {
        this.bitPos = this.pos << 3;
    }

    bytes(): void {
        this.pos = (this.bitPos + 7) >> 3;
    }

    pbit(n: number, value: number): void {
        const pos = this.bitPos;
        this.bitPos += n;

        let bytePos = pos >> 3;
        let remaining = 8 - (pos & 7);

        while (n > remaining) {
            const shift = (1 << remaining) - 1;
            const byte = this.data[bytePos];
            this.data[bytePos++] = ((byte & ~shift) | ((value >> (n - remaining)) & shift)) & 0xff;
            n -= remaining;
            remaining = 8;
        }

        const r = remaining - n;
        const shift = (1 << n) - 1;
        const byte = this.data[bytePos];
        this.data[bytePos] = ((byte & (~shift << r)) | ((value & shift) << r)) & 0xff;
    }
}
