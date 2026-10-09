import { CollisionFlag, LocAngle, LocShape } from '#/engine/routefinder/flags.js';

export default class CollisionEngine {
    private static readonly ZONE_SIZE = 8;
    private static readonly ZONE_TILE_COUNT = CollisionEngine.ZONE_SIZE * CollisionEngine.ZONE_SIZE;

    private readonly zones = new Map<number, Uint32Array>();

    static zoneIndex(x: number, z: number, y: number): number {
        return ((x >> 3) & 0x7ff) | (((z >> 3) & 0x7ff) << 11) | ((y & 0x3) << 22);
    }

    private static tileIndex(x: number, z: number): number {
        return (x & 0x7) | ((z & 0x7) << 3);
    }

    private allocateIfAbsentByIndex(zoneIndex: number): Uint32Array {
        let zone = this.zones.get(zoneIndex);
        if (!zone) {
            zone = new Uint32Array(CollisionEngine.ZONE_TILE_COUNT);
            this.zones.set(zoneIndex, zone);
        }
        return zone;
    }

    allocateIfAbsent(x: number, z: number, y: number): void {
        this.allocateIfAbsentByIndex(CollisionEngine.zoneIndex(x, z, y));
    }

    deallocateIfPresent(x: number, z: number, y: number): void {
        this.zones.delete(CollisionEngine.zoneIndex(x, z, y));
    }

    isZoneAllocated(x: number, z: number, y: number): boolean {
        return this.zones.has(CollisionEngine.zoneIndex(x, z, y));
    }

    get(x: number, z: number, y: number): number {
        const zone = this.zones.get(CollisionEngine.zoneIndex(x, z, y));
        return zone ? zone[CollisionEngine.tileIndex(x, z)] : CollisionFlag.NULL;
    }

    isFlagged(x: number, z: number, y: number, masks: number): boolean {
        const zone = this.zones.get(CollisionEngine.zoneIndex(x, z, y));
        return !!zone && (zone[CollisionEngine.tileIndex(x, z)] & masks) !== CollisionFlag.OPEN;
    }

    set(x: number, z: number, y: number, mask: number): void {
        const zone = this.allocateIfAbsentByIndex(CollisionEngine.zoneIndex(x, z, y));
        zone[CollisionEngine.tileIndex(x, z)] = mask >>> 0;
    }

    add(x: number, z: number, y: number, mask: number): void {
        const zone = this.allocateIfAbsentByIndex(CollisionEngine.zoneIndex(x, z, y));
        const tile = CollisionEngine.tileIndex(x, z);
        zone[tile] = (zone[tile] | mask) >>> 0;
    }

    remove(x: number, z: number, y: number, mask: number): void {
        const zone = this.allocateIfAbsentByIndex(CollisionEngine.zoneIndex(x, z, y));
        const tile = CollisionEngine.tileIndex(x, z);
        zone[tile] = (zone[tile] & ~mask) >>> 0;
    }

    changeFloor(x: number, z: number, y: number, add: boolean): void {
        if (add) {
            this.add(x, z, y, CollisionFlag.FLOOR);
        } else {
            this.remove(x, z, y, CollisionFlag.FLOOR);
        }
    }

    changeRoof(x: number, z: number, y: number, add: boolean): void {
        if (add) {
            this.add(x, z, y, CollisionFlag.ROOF);
        } else {
            this.remove(x, z, y, CollisionFlag.ROOF);
        }
    }

    changeNpc(x: number, z: number, y: number, size: number, add: boolean): void {
        this.changeSquare(x, z, y, size, CollisionFlag.NPC_OCC, add);
    }

    changeBlock(x: number, z: number, y: number, size: number, add: boolean): void {
        this.changeSquare(x, z, y, size, CollisionFlag.BLOCK_NPC_AND_PLAYERS, add);
    }

    changePlayerOcc(x: number, z: number, y: number, size: number, add: boolean): void {
        this.changeSquare(x, z, y, size, CollisionFlag.PLAYER_OCC, add);
    }

    changeLoc(x: number, z: number, y: number, width: number, length: number, blockrange: boolean, add: boolean): void {
        let mask = CollisionFlag.LOC;
        if (blockrange) {
            mask |= CollisionFlag.LOC_PROJ_BLOCKER;
        }

        const area = width * length;
        for (let index = 0; index < area; index++) {
            const dx = x + (index % width);
            const dz = z + ((index / width) | 0);
            if (add) {
                this.add(dx, dz, y, mask);
            } else {
                this.remove(dx, dz, y, mask);
            }
        }
    }

    changeWall(x: number, z: number, y: number, angle: number, shape: number, blockrange: boolean, add: boolean): void {
        if (shape === LocShape.WALL_STRAIGHT) {
            this.changeWallStraight(x, z, y, angle, blockrange, add);
        } else if (shape === LocShape.WALL_DIAGONAL_CORNER || shape === LocShape.WALL_SQUARE_CORNER) {
            this.changeWallCorner(x, z, y, angle, blockrange, add);
        } else if (shape === LocShape.WALL_L) {
            this.changeWallL(x, z, y, angle, blockrange, add);
        }
    }

    zoneCount(): number {
        return this.zones.size;
    }

    private changeSquare(x: number, z: number, y: number, size: number, mask: number, add: boolean): void {
        const area = size * size;
        for (let index = 0; index < area; index++) {
            const dx = x + (index % size);
            const dz = z + ((index / size) | 0);
            if (add) {
                this.add(dx, dz, y, mask);
            } else {
                this.remove(dx, dz, y, mask);
            }
        }
    }

    private changeWallStraight(x: number, z: number, y: number, angle: number, blockrange: boolean, add: boolean): void {
        const west = this.wallMask(CollisionFlag.WALL_WEST, CollisionFlag.WALL_WEST_PROJ_BLOCKER, blockrange);
        const east = this.wallMask(CollisionFlag.WALL_EAST, CollisionFlag.WALL_EAST_PROJ_BLOCKER, blockrange);
        const north = this.wallMask(CollisionFlag.WALL_NORTH, CollisionFlag.WALL_NORTH_PROJ_BLOCKER, blockrange);
        const south = this.wallMask(CollisionFlag.WALL_SOUTH, CollisionFlag.WALL_SOUTH_PROJ_BLOCKER, blockrange);

        if (angle === LocAngle.WEST) {
            this.applyWallPair(x, z, y, west, x - 1, z, y, east, add);
        } else if (angle === LocAngle.NORTH) {
            this.applyWallPair(x, z, y, north, x, z + 1, y, south, add);
        } else if (angle === LocAngle.EAST) {
            this.applyWallPair(x, z, y, east, x + 1, z, y, west, add);
        } else if (angle === LocAngle.SOUTH) {
            this.applyWallPair(x, z, y, south, x, z - 1, y, north, add);
        }

        if (blockrange) {
            this.changeWallStraight(x, z, y, angle, false, add);
        }
    }

    private changeWallCorner(x: number, z: number, y: number, angle: number, blockrange: boolean, add: boolean): void {
        const northWest = this.wallMask(CollisionFlag.WALL_NORTH_WEST, CollisionFlag.WALL_NORTH_WEST_PROJ_BLOCKER, blockrange);
        const southEast = this.wallMask(CollisionFlag.WALL_SOUTH_EAST, CollisionFlag.WALL_SOUTH_EAST_PROJ_BLOCKER, blockrange);
        const northEast = this.wallMask(CollisionFlag.WALL_NORTH_EAST, CollisionFlag.WALL_NORTH_EAST_PROJ_BLOCKER, blockrange);
        const southWest = this.wallMask(CollisionFlag.WALL_SOUTH_WEST, CollisionFlag.WALL_SOUTH_WEST_PROJ_BLOCKER, blockrange);

        if (angle === LocAngle.WEST) {
            this.applyWallPair(x, z, y, northWest, x - 1, z + 1, y, southEast, add);
        } else if (angle === LocAngle.NORTH) {
            this.applyWallPair(x, z, y, northEast, x + 1, z + 1, y, southWest, add);
        } else if (angle === LocAngle.EAST) {
            this.applyWallPair(x, z, y, southEast, x + 1, z - 1, y, northWest, add);
        } else if (angle === LocAngle.SOUTH) {
            this.applyWallPair(x, z, y, southWest, x - 1, z - 1, y, northEast, add);
        }

        if (blockrange) {
            this.changeWallCorner(x, z, y, angle, false, add);
        }
    }

    private changeWallL(x: number, z: number, y: number, angle: number, blockrange: boolean, add: boolean): void {
        const west = this.wallMask(CollisionFlag.WALL_WEST, CollisionFlag.WALL_WEST_PROJ_BLOCKER, blockrange);
        const east = this.wallMask(CollisionFlag.WALL_EAST, CollisionFlag.WALL_EAST_PROJ_BLOCKER, blockrange);
        const north = this.wallMask(CollisionFlag.WALL_NORTH, CollisionFlag.WALL_NORTH_PROJ_BLOCKER, blockrange);
        const south = this.wallMask(CollisionFlag.WALL_SOUTH, CollisionFlag.WALL_SOUTH_PROJ_BLOCKER, blockrange);

        if (angle === LocAngle.WEST) {
            this.applyWallSingle(x, z, y, north | west, add);
            this.applyWallSingle(x - 1, z, y, east, add);
            this.applyWallSingle(x, z + 1, y, south, add);
        } else if (angle === LocAngle.NORTH) {
            this.applyWallSingle(x, z, y, north | east, add);
            this.applyWallSingle(x, z + 1, y, south, add);
            this.applyWallSingle(x + 1, z, y, west, add);
        } else if (angle === LocAngle.EAST) {
            this.applyWallSingle(x, z, y, south | east, add);
            this.applyWallSingle(x + 1, z, y, west, add);
            this.applyWallSingle(x, z - 1, y, north, add);
        } else if (angle === LocAngle.SOUTH) {
            this.applyWallSingle(x, z, y, south | west, add);
            this.applyWallSingle(x, z - 1, y, north, add);
            this.applyWallSingle(x - 1, z, y, east, add);
        }

        if (blockrange) {
            this.changeWallL(x, z, y, angle, false, add);
        }
    }

    private wallMask(normal: number, projectile: number, blockrange: boolean): number {
        if (blockrange) {
            return projectile;
        }
        return normal;
    }

    private applyWallPair(srcX: number, srcZ: number, srcY: number, srcMask: number, dstX: number, dstZ: number, dstY: number, dstMask: number, add: boolean): void {
        this.applyWallSingle(srcX, srcZ, srcY, srcMask, add);
        this.applyWallSingle(dstX, dstZ, dstY, dstMask, add);
    }

    private applyWallSingle(x: number, z: number, y: number, mask: number, add: boolean): void {
        if (add) {
            this.add(x, z, y, mask);
        } else {
            this.remove(x, z, y, mask);
        }
    }
}
