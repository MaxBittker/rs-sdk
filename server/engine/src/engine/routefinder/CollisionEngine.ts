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
        this.changeSquare(x, z, y, size, CollisionFlag.NPC, add);
    }

    changePlayer(x: number, z: number, y: number, size: number, add: boolean): void {
        this.changeSquare(x, z, y, size, CollisionFlag.PLAYER, add);
    }

    changeLoc(x: number, z: number, y: number, width: number, length: number, blockrange: boolean, breakroutefinding: boolean, add: boolean): void {
        let mask = CollisionFlag.LOC;
        if (blockrange) {
            mask |= CollisionFlag.LOC_PROJ_BLOCKER;
        }
        if (breakroutefinding) {
            mask |= CollisionFlag.LOC_ROUTE_BLOCKER;
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

    changeWall(x: number, z: number, y: number, angle: number, shape: number, blockrange: boolean, breakroutefinding: boolean, add: boolean): void {
        if (shape === LocShape.WALL_STRAIGHT) {
            this.changeWallStraight(x, z, y, angle, blockrange, breakroutefinding, add);
        } else if (shape === LocShape.WALL_DIAGONAL_CORNER || shape === LocShape.WALL_SQUARE_CORNER) {
            this.changeWallCorner(x, z, y, angle, blockrange, breakroutefinding, add);
        } else if (shape === LocShape.WALL_L) {
            this.changeWallL(x, z, y, angle, blockrange, breakroutefinding, add);
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

    private changeWallStraight(x: number, z: number, y: number, angle: number, blockrange: boolean, breakroutefinding: boolean, add: boolean): void {
        const west = this.wallMask(CollisionFlag.WALL_WEST, CollisionFlag.WALL_WEST_PROJ_BLOCKER, CollisionFlag.WALL_WEST_ROUTE_BLOCKER, blockrange, breakroutefinding);
        const east = this.wallMask(CollisionFlag.WALL_EAST, CollisionFlag.WALL_EAST_PROJ_BLOCKER, CollisionFlag.WALL_EAST_ROUTE_BLOCKER, blockrange, breakroutefinding);
        const north = this.wallMask(CollisionFlag.WALL_NORTH, CollisionFlag.WALL_NORTH_PROJ_BLOCKER, CollisionFlag.WALL_NORTH_ROUTE_BLOCKER, blockrange, breakroutefinding);
        const south = this.wallMask(CollisionFlag.WALL_SOUTH, CollisionFlag.WALL_SOUTH_PROJ_BLOCKER, CollisionFlag.WALL_SOUTH_ROUTE_BLOCKER, blockrange, breakroutefinding);

        if (angle === LocAngle.WEST) {
            this.applyWallPair(x, z, y, west, x - 1, z, y, east, add);
        } else if (angle === LocAngle.NORTH) {
            this.applyWallPair(x, z, y, north, x, z + 1, y, south, add);
        } else if (angle === LocAngle.EAST) {
            this.applyWallPair(x, z, y, east, x + 1, z, y, west, add);
        } else if (angle === LocAngle.SOUTH) {
            this.applyWallPair(x, z, y, south, x, z - 1, y, north, add);
        }

        if (breakroutefinding) {
            this.changeWallStraight(x, z, y, angle, blockrange, false, add);
        } else if (blockrange) {
            this.changeWallStraight(x, z, y, angle, false, false, add);
        }
    }

    private changeWallCorner(x: number, z: number, y: number, angle: number, blockrange: boolean, breakroutefinding: boolean, add: boolean): void {
        const northWest = this.wallMask(CollisionFlag.WALL_NORTH_WEST, CollisionFlag.WALL_NORTH_WEST_PROJ_BLOCKER, CollisionFlag.WALL_NORTH_WEST_ROUTE_BLOCKER, blockrange, breakroutefinding);
        const southEast = this.wallMask(CollisionFlag.WALL_SOUTH_EAST, CollisionFlag.WALL_SOUTH_EAST_PROJ_BLOCKER, CollisionFlag.WALL_SOUTH_EAST_ROUTE_BLOCKER, blockrange, breakroutefinding);
        const northEast = this.wallMask(CollisionFlag.WALL_NORTH_EAST, CollisionFlag.WALL_NORTH_EAST_PROJ_BLOCKER, CollisionFlag.WALL_NORTH_EAST_ROUTE_BLOCKER, blockrange, breakroutefinding);
        const southWest = this.wallMask(CollisionFlag.WALL_SOUTH_WEST, CollisionFlag.WALL_SOUTH_WEST_PROJ_BLOCKER, CollisionFlag.WALL_SOUTH_WEST_ROUTE_BLOCKER, blockrange, breakroutefinding);

        if (angle === LocAngle.WEST) {
            this.applyWallPair(x, z, y, northWest, x - 1, z + 1, y, southEast, add);
        } else if (angle === LocAngle.NORTH) {
            this.applyWallPair(x, z, y, northEast, x + 1, z + 1, y, southWest, add);
        } else if (angle === LocAngle.EAST) {
            this.applyWallPair(x, z, y, southEast, x + 1, z - 1, y, northWest, add);
        } else if (angle === LocAngle.SOUTH) {
            this.applyWallPair(x, z, y, southWest, x - 1, z - 1, y, northEast, add);
        }

        if (breakroutefinding) {
            this.changeWallCorner(x, z, y, angle, blockrange, false, add);
        } else if (blockrange) {
            this.changeWallCorner(x, z, y, angle, false, false, add);
        }
    }

    private changeWallL(x: number, z: number, y: number, angle: number, blockrange: boolean, breakroutefinding: boolean, add: boolean): void {
        const west = this.wallMask(CollisionFlag.WALL_WEST, CollisionFlag.WALL_WEST_PROJ_BLOCKER, CollisionFlag.WALL_WEST_ROUTE_BLOCKER, blockrange, breakroutefinding);
        const east = this.wallMask(CollisionFlag.WALL_EAST, CollisionFlag.WALL_EAST_PROJ_BLOCKER, CollisionFlag.WALL_EAST_ROUTE_BLOCKER, blockrange, breakroutefinding);
        const north = this.wallMask(CollisionFlag.WALL_NORTH, CollisionFlag.WALL_NORTH_PROJ_BLOCKER, CollisionFlag.WALL_NORTH_ROUTE_BLOCKER, blockrange, breakroutefinding);
        const south = this.wallMask(CollisionFlag.WALL_SOUTH, CollisionFlag.WALL_SOUTH_PROJ_BLOCKER, CollisionFlag.WALL_SOUTH_ROUTE_BLOCKER, blockrange, breakroutefinding);

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

        if (breakroutefinding) {
            this.changeWallL(x, z, y, angle, blockrange, false, add);
        } else if (blockrange) {
            this.changeWallL(x, z, y, angle, false, false, add);
        }
    }

    private wallMask(normal: number, projectile: number, route: number, blockrange: boolean, breakroutefinding: boolean): number {
        if (breakroutefinding) {
            return route;
        }
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
