export const Direction = {
    NORTH_WEST: 0,
    NORTH: 1,
    NORTH_EAST: 2,
    WEST: 3,
    EAST: 4,
    SOUTH_WEST: 5,
    SOUTH: 6,
    SOUTH_EAST: 7
};
// TODO (jkm) consider making this an enum
type Direction = (typeof Direction)[keyof typeof Direction];

export type Position = {level: number, x: number, z: number};

// TODO (jkm) consider making this a class
export const Position = {
    zone: (pos: number) => pos >> 3,
    zoneCenter: (pos: number) => Position.zone(pos) - 6,
    zoneOrigin: (pos: number) => Position.zoneCenter(pos) << 3,
    mapsquare: (pos: number) => pos >> 6,
    local: (pos: number) => pos - (Position.zoneCenter(pos) << 3),
    localOrigin: (pos: number) => pos - (Position.mapsquare(pos) << 6),
    zoneUpdate: (pos: number) => pos - ((pos >> 3) << 3),

    face: (srcX: number, srcZ: number, dstX: number, dstZ: number) => {
        if (srcX == dstX) {
            if (srcZ > dstZ) {
                return Direction.SOUTH;
            } else if (srcZ < dstZ) {
                return Direction.NORTH;
            }
        } else if (srcX > dstX) {
            if (srcZ > dstZ) {
                return Direction.SOUTH_WEST;
            } else if (srcZ < dstZ) {
                return Direction.NORTH_WEST;
            } else {
                return Direction.WEST;
            }
        } else {
            if (srcZ > dstZ) {
                return Direction.SOUTH_EAST;
            } else if (srcZ < dstZ) {
                return Direction.NORTH_EAST;
            } else {
                return Direction.EAST;
            }
        }

        return -1;
    },

    moveX: (pos: number, dir: Direction) => {
        return pos + Position.deltaX(dir);
    },

    moveZ: (pos: number, dir: Direction) => {
        return pos + Position.deltaZ(dir);
    },

    distanceTo(pos: { x: number; z: number; width: number; length: number }, other: { x: number; z: number; width: number; length: number }) {
        const p1 = Position.closest(pos, other);
        const p2 = Position.closest(other, pos);
        return Math.max(Math.abs(p1.x - p2.x), Math.abs(p1.z - p2.z));
    },

    closest(pos: { x: number; z: number; width: number; length: number }, other: { x: number; z: number; width: number; length: number }) {
        const occupiedX = pos.x + pos.width - 1;
        const occupiedZ = pos.z + pos.length - 1;
        return {
            x: other.x <= pos.x ? pos.x : other.x >= occupiedX ? occupiedX : other.x,
            z: other.z <= pos.z ? pos.z : other.z >= occupiedZ ? occupiedZ : other.z
        };
    },

    distanceToSW(pos: { x: number, z: number }, other: { x: number, z: number }) {
        const deltaX = Math.abs(pos.x - other.x);
        const deltaZ = Math.abs(pos.z - other.z);

        return Math.max(deltaX, deltaZ);
    },

    isWithinDistance(pos: { x: number, z: number }, other: { x: number, z: number }, distance: number) {
        const dx = Math.abs(pos.x - other.x);
        const dz = Math.abs(pos.z - other.z);
        return dz < distance && dx < distance;
    },

    deltaX(dir: Direction): number {
        switch (dir) {
            case Direction.SOUTH_EAST:
            case Direction.NORTH_EAST:
            case Direction.EAST:
                return 1;
            case Direction.SOUTH_WEST:
            case Direction.NORTH_WEST:
            case Direction.WEST:
                return -1;
        }
        return 0;
    },

    deltaZ(dir: Direction): number {
        switch (dir) {
            case Direction.NORTH_WEST:
            case Direction.NORTH_EAST:
            case Direction.NORTH:
                return 1;
            case Direction.SOUTH_WEST:
            case Direction.SOUTH_EAST:
            case Direction.SOUTH:
                return -1;
        }
        return 0;
    },

    unpackCoord(coord: number): Position {
        const level: number = (coord >> 28) & 0x3;
        const x: number = (coord >> 14) & 0x3fff;
        const z: number = coord & 0x3fff;
        return { level, x, z };
    },

    packCoord(level: number, x: number, z: number): number {
        return (z & 0x3fff) | ((x & 0x3fff) << 14) | ((level & 0x3) << 28);
    },

    packZoneCoord(x: number, z: number): number {
        return ((x & 0x7) << 4) | (z & 0x7);
    },

    intersects(srcX: number, srcZ: number, srcWidth: number, srcHeight: number, destX: number, destZ: number, destWidth: number, destHeight: number): boolean {
        const srcHorizontal: number = srcX + srcWidth;
        const srcVertical: number = srcZ + srcHeight;
        const destHorizontal: number = destX + destWidth;
        const destVertical: number = destZ + destHeight;
        return !(destX >= srcHorizontal || destHorizontal <= srcX || destZ >= srcVertical || destVertical <= srcZ);
    },

    formatString(level: number, x: number, z: number, separator = '_'): string {
        const mx = x >> 6;
        const mz = z >> 6;
        const lx = x & 0x3f;
        const lz = z & 0x3f;
        return level + separator + mx + separator + mz + separator + lx + separator + lz;
    }
} as const;
