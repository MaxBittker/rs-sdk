import CollisionFlag from "#rsmod/flag/CollisionFlag.js";

// we don't need to alloc space for instancing (now), so just the bounds of the map
const LEFT = 29 << 6;
const BOTTOM = 44 << 6;
const RIGHT = (53 << 6) + 63;
const TOP = (161 << 6) + 63;

export default class CollisionFlagMap {
    flags: Int32Array = new Int32Array((RIGHT - LEFT) * (TOP - BOTTOM) * 4);

    get(x: number, z: number, level: number): number {
        x -= LEFT;
        z -= BOTTOM;
        if (x < 0 || z < 0 || x >= RIGHT - LEFT || z >= TOP - BOTTOM) return CollisionFlag.NULL;
        return this.flags[(x & 0x3FFF) + ((z & 0x3FFF) << 14) + ((level & 0x3) << 28)];
    }

    set(x: number, z: number, level: number, mask: number): void {
        x -= LEFT;
        z -= BOTTOM;
        this.flags[(x & 0x3FFF) + ((z & 0x3FFF) << 14) + ((level & 0x3) << 28)] = mask;
    }

    add(x: number, z: number, level: number, mask: number): void {
        x -= LEFT;
        z -= BOTTOM;
        this.flags[(x & 0x3FFF) + ((z & 0x3FFF) << 14) + ((level & 0x3) << 28)] |= mask;
    }

    remove(x: number, z: number, level: number, mask: number): void {
        x -= LEFT;
        z -= BOTTOM;
        this.flags[(x & 0x3FFF) + ((z & 0x3FFF) << 14) + ((level & 0x3) << 28)] &= ~mask;
    }

    isFlagged(x: number, z: number, level: number, flags: number): boolean {
        return (this.get(x, z, level) & flags) != CollisionFlag.OPEN;
    }
}
