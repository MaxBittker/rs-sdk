export default class PackedCoord {
    packed: number;

    constructor(level: number, x: number, z: number) {
        this.packed = ((z & 0x3fff) | ((x & 0x3fff) << 14) | ((level & 0x3) << 28)) >>> 0;
    }

    static from(packed: number): PackedCoord {
        const coord = Object.create(PackedCoord.prototype) as PackedCoord;
        coord.packed = packed >>> 0;
        return coord;
    }

    get level(): number {
        return (this.packed >>> 28) & 0x3;
    }

    get x(): number {
        return (this.packed >>> 14) & 0x3fff;
    }

    get z(): number {
        return this.packed & 0x3fff;
    }
}
