export class CoordGrid {
    readonly packed: number;

    constructor(packed: number) {
        this.packed = packed >>> 0;
    }

    static from(x: number, y: number, z: number): CoordGrid {
        return new CoordGrid(((z & 0x3fff) | ((x & 0x3fff) << 14) | ((y & 0x3) << 28)) >>> 0);
    }

    x(): number {
        return (this.packed >>> 14) & 0x3fff;
    }

    y(): number {
        return (this.packed >>> 28) & 0x3;
    }

    z(): number {
        return this.packed & 0x3fff;
    }

    static withinDistanceSw(self: CoordGrid, other: CoordGrid, distance: number): boolean {
        return !(Math.abs(self.x() - other.x()) > distance || Math.abs(self.z() - other.z()) > distance);
    }

    static fine(pos: number, size: number): number {
        return pos * 2 + size;
    }

    static zone(pos: number): number {
        return pos >> 3;
    }
}
