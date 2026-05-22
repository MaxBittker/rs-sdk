import { CollisionFlag } from '#/dash3d/CollisionFlag.js';
import { DirectionFlag } from '#/dash3d/DirectionFlag.js';
import { LocAngle } from '#/dash3d/LocAngle.js';
import { LocShape } from '#/dash3d/LocShape.js';

// a standard build area is 4x13x13 zones, or 4x104x104 tiles
export const enum BuildArea {
    LEVELS = 4,
    SIZE = 13 << 3
}

export default class CollisionMap {
    static index = (x: number, z: number): number => x * BuildArea.SIZE + z;

    readonly startX: number = 0;
    readonly startZ: number = 0;
    readonly sizeX: number;
    readonly sizeZ: number;
    readonly flags: Int32Array;

    constructor() {
        this.sizeX = BuildArea.SIZE;
        this.sizeZ = BuildArea.SIZE;
        this.flags = new Int32Array(this.sizeX * this.sizeZ);
        this.reset();
    }

    reset(): void {
        for (let x: number = 0; x < this.sizeX; x++) {
            for (let z: number = 0; z < this.sizeZ; z++) {
                const index: number = CollisionMap.index(x, z);
                if (x === 0 || z === 0 || x === this.sizeX - 1 || z === this.sizeZ - 1) {
                    this.flags[index] = CollisionFlag._BOUNDS;
                } else {
                    this.flags[index] = CollisionFlag._OPEN;
                }
            }
        }
    }

    blockGround(tileX: number, tileZ: number): void {
        this.flags[CollisionMap.index(tileX - this.startX, tileZ - this.startZ)] |= CollisionFlag.WR_GRND;
    }

    unblockGround(tileX: number, tileZ: number): void {
        this.flags[CollisionMap.index(tileX - this.startX, tileZ - this.startZ)] &= ~CollisionFlag.WR_GRND;
    }

    addLoc(tileX: number, tileZ: number, sizeX: number, sizeZ: number, angle: LocAngle, blockrange: boolean): void {
        let flags: number = CollisionFlag.WALK_SCENERY;
        if (blockrange) {
            flags |= CollisionFlag.VIS_SCENERY;
        }

        const x: number = tileX - this.startX;
        const z: number = tileZ - this.startZ;

        if (angle === LocAngle.NORTH || angle === LocAngle.SOUTH) {
            // north or south
            const tmp: number = sizeX;
            sizeX = sizeZ;
            sizeZ = tmp;
        }

        for (let tx: number = x; tx < x + sizeX; tx++) {
            if (!(tx >= 0 && tx < this.sizeX)) {
                continue;
            }
            for (let tz: number = z; tz < z + sizeZ; tz++) {
                if (!(tz >= 0 && tz < this.sizeZ)) {
                    continue;
                }
                this.addCMap(tx, tz, flags);
            }
        }
    }

    delLoc(tileX: number, tileZ: number, sizeX: number, sizeZ: number, angle: LocAngle, blockrange: boolean): void {
        let flags: number = CollisionFlag.WALK_SCENERY;
        if (blockrange) {
            flags |= CollisionFlag.VIS_SCENERY;
        }

        const x: number = tileX - this.startX;
        const z: number = tileZ - this.startZ;

        if (angle === LocAngle.NORTH || angle === LocAngle.SOUTH) {
            const tmp: number = sizeX;
            sizeX = sizeZ;
            sizeZ = tmp;
        }

        for (let tx: number = x; tx < x + sizeX; tx++) {
            if (!(tx >= 0 && tx < this.sizeX)) {
                continue;
            }
            for (let tz: number = z; tz < z + sizeZ; tz++) {
                if (!(tz >= 0 && tz < this.sizeZ)) {
                    continue;
                }
                this.remCMap(tx, tz, flags);
            }
        }
    }

    addWall(tileX: number, tileZ: number, shape: number, angle: LocAngle, blockrange: boolean): void {
        const x: number = tileX - this.startX;
        const z: number = tileZ - this.startZ;

        const west: number = blockrange ? CollisionFlag.V_W : CollisionFlag.W_W;
        const east: number = blockrange ? CollisionFlag.V_E : CollisionFlag.W_E;
        const north: number = blockrange ? CollisionFlag.V_N : CollisionFlag.W_N;
        const south: number = blockrange ? CollisionFlag.V_S : CollisionFlag.W_S;
        const northWest: number = blockrange ? CollisionFlag.V_NW : CollisionFlag.W_NW;
        const southEast: number = blockrange ? CollisionFlag.V_SE : CollisionFlag.W_SE;
        const northEast: number = blockrange ? CollisionFlag.V_NE : CollisionFlag.W_NE;
        const southWest: number = blockrange ? CollisionFlag.V_SW : CollisionFlag.W_SW;

        if (shape === LocShape.WALL_STRAIGHT) {
            if (angle === LocAngle.WEST) {
                this.addCMap(x, z, west);
                this.addCMap(x - 1, z, east);
            } else if (angle === LocAngle.NORTH) {
                this.addCMap(x, z, north);
                this.addCMap(x, z + 1, south);
            } else if (angle === LocAngle.EAST) {
                this.addCMap(x, z, east);
                this.addCMap(x + 1, z, west);
            } else if (angle === LocAngle.SOUTH) {
                this.addCMap(x, z, south);
                this.addCMap(x, z - 1, north);
            }
        } else if (shape === LocShape.WALL_DIAGONAL_CORNER || shape === LocShape.WALL_SQUARE_CORNER) {
            if (angle === LocAngle.WEST) {
                this.addCMap(x, z, northWest);
                this.addCMap(x - 1, z + 1, southEast);
            } else if (angle === LocAngle.NORTH) {
                this.addCMap(x, z, northEast);
                this.addCMap(x + 1, z + 1, southWest);
            } else if (angle === LocAngle.EAST) {
                this.addCMap(x, z, southEast);
                this.addCMap(x + 1, z - 1, northWest);
            } else if (angle === LocAngle.SOUTH) {
                this.addCMap(x, z, southWest);
                this.addCMap(x - 1, z - 1, northEast);
            }
        } else if (shape === LocShape.WALL_L) {
            if (angle === LocAngle.WEST) {
                this.addCMap(x, z, north | west);
                this.addCMap(x - 1, z, east);
                this.addCMap(x, z + 1, south);
            } else if (angle === LocAngle.NORTH) {
                this.addCMap(x, z, north | east);
                this.addCMap(x, z + 1, south);
                this.addCMap(x + 1, z, west);
            } else if (angle === LocAngle.EAST) {
                this.addCMap(x, z, south | east);
                this.addCMap(x + 1, z, west);
                this.addCMap(x, z - 1, north);
            } else if (angle === LocAngle.SOUTH) {
                this.addCMap(x, z, south | west);
                this.addCMap(x, z - 1, north);
                this.addCMap(x - 1, z, east);
            }
        }
        if (blockrange) {
            this.addWall(tileX, tileZ, shape, angle, false);
        }
    }

    delWall(tileX: number, tileZ: number, shape: number, angle: LocAngle, blockrange: boolean): void {
        const x: number = tileX - this.startX;
        const z: number = tileZ - this.startZ;

        const west: number = blockrange ? CollisionFlag.V_W : CollisionFlag.W_W;
        const east: number = blockrange ? CollisionFlag.V_E : CollisionFlag.W_E;
        const north: number = blockrange ? CollisionFlag.V_N : CollisionFlag.W_N;
        const south: number = blockrange ? CollisionFlag.V_S : CollisionFlag.W_S;
        const northWest: number = blockrange ? CollisionFlag.V_NW : CollisionFlag.W_NW;
        const southEast: number = blockrange ? CollisionFlag.V_SE : CollisionFlag.W_SE;
        const northEast: number = blockrange ? CollisionFlag.V_NE : CollisionFlag.W_NE;
        const southWest: number = blockrange ? CollisionFlag.V_SW : CollisionFlag.W_SW;

        if (shape === LocShape.WALL_STRAIGHT) {
            if (angle === LocAngle.WEST) {
                this.remCMap(x, z, west);
                this.remCMap(x - 1, z, east);
            } else if (angle === LocAngle.NORTH) {
                this.remCMap(x, z, north);
                this.remCMap(x, z + 1, south);
            } else if (angle === LocAngle.EAST) {
                this.remCMap(x, z, east);
                this.remCMap(x + 1, z, west);
            } else if (angle === LocAngle.SOUTH) {
                this.remCMap(x, z, south);
                this.remCMap(x, z - 1, north);
            }
        } else if (shape === LocShape.WALL_DIAGONAL_CORNER || shape === LocShape.WALL_SQUARE_CORNER) {
            if (angle === LocAngle.WEST) {
                this.remCMap(x, z, northWest);
                this.remCMap(x - 1, z + 1, southEast);
            } else if (angle === LocAngle.NORTH) {
                this.remCMap(x, z, northEast);
                this.remCMap(x + 1, z + 1, southWest);
            } else if (angle === LocAngle.EAST) {
                this.remCMap(x, z, southEast);
                this.remCMap(x + 1, z - 1, northWest);
            } else if (angle === LocAngle.SOUTH) {
                this.remCMap(x, z, southWest);
                this.remCMap(x - 1, z - 1, northEast);
            }
        } else if (shape === LocShape.WALL_L) {
            if (angle === LocAngle.WEST) {
                this.remCMap(x, z, north | west);
                this.remCMap(x - 1, z, east);
                this.remCMap(x, z + 1, south);
            } else if (angle === LocAngle.NORTH) {
                this.remCMap(x, z, north | east);
                this.remCMap(x, z + 1, south);
                this.remCMap(x + 1, z, west);
            } else if (angle === LocAngle.EAST) {
                this.remCMap(x, z, south | east);
                this.remCMap(x + 1, z, west);
                this.remCMap(x, z - 1, north);
            } else if (angle === LocAngle.SOUTH) {
                this.remCMap(x, z, south | west);
                this.remCMap(x, z - 1, north);
                this.remCMap(x - 1, z, east);
            }
        }
        if (blockrange) {
            this.delWall(tileX, tileZ, shape, angle, false);
        }
    }

    testWall(srcX: number, srcZ: number, dstX: number, dstZ: number, shape: number, angle: LocAngle): boolean {
        if (srcX === dstX && srcZ === dstZ) {
            return true;
        }

        const sx: number = srcX - this.startX;
        const sz: number = srcZ - this.startZ;
        const dx: number = dstX - this.startX;
        const dz: number = dstZ - this.startZ;
        const index: number = CollisionMap.index(sx, sz);

        if (shape === LocShape.WALL_STRAIGHT) {
            if (angle === LocAngle.WEST) {
                if (sx === dx - 1 && sz === dz) {
                    return true;
                } else if (sx === dx && sz === dz + 1 && (this.flags[index] & CollisionFlag.PL_WALK_S) === CollisionFlag._OPEN) {
                    return true;
                } else if (sx === dx && sz === dz - 1 && (this.flags[index] & CollisionFlag.PL_WALK_N) === CollisionFlag._OPEN) {
                    return true;
                }
            } else if (angle === LocAngle.NORTH) {
                if (sx === dx && sz === dz + 1) {
                    return true;
                } else if (sx === dx - 1 && sz === dz && (this.flags[index] & CollisionFlag.PL_WALK_E) === CollisionFlag._OPEN) {
                    return true;
                } else if (sx === dx + 1 && sz === dz && (this.flags[index] & CollisionFlag.PL_WALK_W) === CollisionFlag._OPEN) {
                    return true;
                }
            } else if (angle === LocAngle.EAST) {
                if (sx === dx + 1 && sz === dz) {
                    return true;
                } else if (sx === dx && sz === dz + 1 && (this.flags[index] & CollisionFlag.PL_WALK_S) === CollisionFlag._OPEN) {
                    return true;
                } else if (sx === dx && sz === dz - 1 && (this.flags[index] & CollisionFlag.PL_WALK_N) === CollisionFlag._OPEN) {
                    return true;
                }
            } else if (angle === LocAngle.SOUTH) {
                if (sx === dx && sz === dz - 1) {
                    return true;
                } else if (sx === dx - 1 && sz === dz && (this.flags[index] & CollisionFlag.PL_WALK_E) === CollisionFlag._OPEN) {
                    return true;
                } else if (sx === dx + 1 && sz === dz && (this.flags[index] & CollisionFlag.PL_WALK_W) === CollisionFlag._OPEN) {
                    return true;
                }
            }
        } else if (shape === LocShape.WALL_L) {
            if (angle === LocAngle.WEST) {
                if (sx === dx - 1 && sz === dz) {
                    return true;
                } else if (sx === dx && sz === dz + 1) {
                    return true;
                } else if (sx === dx + 1 && sz === dz && (this.flags[index] & CollisionFlag.PL_WALK_W) === CollisionFlag._OPEN) {
                    return true;
                } else if (sx === dx && sz === dz - 1 && (this.flags[index] & CollisionFlag.PL_WALK_N) === CollisionFlag._OPEN) {
                    return true;
                }
            } else if (angle === LocAngle.NORTH) {
                if (sx === dx - 1 && sz === dz && (this.flags[index] & CollisionFlag.PL_WALK_E) === CollisionFlag._OPEN) {
                    return true;
                } else if (sx === dx && sz === dz + 1) {
                    return true;
                } else if (sx === dx + 1 && sz === dz) {
                    return true;
                } else if (sx === dx && sz === dz - 1 && (this.flags[index] & CollisionFlag.PL_WALK_N) === CollisionFlag._OPEN) {
                    return true;
                }
            } else if (angle === LocAngle.EAST) {
                if (sx === dx - 1 && sz === dz && (this.flags[index] & CollisionFlag.PL_WALK_E) === CollisionFlag._OPEN) {
                    return true;
                } else if (sx === dx && sz === dz + 1 && (this.flags[index] & CollisionFlag.PL_WALK_S) === CollisionFlag._OPEN) {
                    return true;
                } else if (sx === dx + 1 && sz === dz) {
                    return true;
                } else if (sx === dx && sz === dz - 1) {
                    return true;
                }
            } else if (angle === LocAngle.SOUTH) {
                if (sx === dx - 1 && sz === dz) {
                    return true;
                } else if (sx === dx && sz === dz + 1 && (this.flags[index] & CollisionFlag.PL_WALK_S) === CollisionFlag._OPEN) {
                    return true;
                } else if (sx === dx + 1 && sz === dz && (this.flags[index] & CollisionFlag.PL_WALK_W) === CollisionFlag._OPEN) {
                    return true;
                } else if (sx === dx && sz === dz - 1) {
                    return true;
                }
            }
        } else if (shape === LocShape.WALL_DIAGONAL) {
            if (sx === dx && sz === dz + 1 && (this.flags[index] & CollisionFlag.W_S) === CollisionFlag._OPEN) {
                return true;
            } else if (sx === dx && sz === dz - 1 && (this.flags[index] & CollisionFlag.W_N) === CollisionFlag._OPEN) {
                return true;
            } else if (sx === dx - 1 && sz === dz && (this.flags[index] & CollisionFlag.W_E) === CollisionFlag._OPEN) {
                return true;
            } else if (sx === dx + 1 && sz === dz && (this.flags[index] & CollisionFlag.W_W) === CollisionFlag._OPEN) {
                return true;
            }
        }
        return false;
    }

    testWDecor(srcX: number, srcZ: number, dstX: number, dstZ: number, shape: number, angle: number): boolean {
        if (srcX === dstX && srcZ === dstZ) {
            return true;
        }

        const sx: number = srcX - this.startX;
        const sz: number = srcZ - this.startZ;
        const dx: number = dstX - this.startX;
        const dz: number = dstZ - this.startZ;
        const index: number = CollisionMap.index(sx, sz);

        if (shape === LocShape.WALLDECOR_DIAGONAL_OFFSET || shape === LocShape.WALLDECOR_DIAGONAL_NOOFFSET) {
            if (shape === LocShape.WALLDECOR_DIAGONAL_NOOFFSET) {
                angle = (angle + 2) & 0x3;
            }

            if (angle === LocAngle.WEST) {
                if (sx === dx + 1 && sz === dz && (this.flags[index] & CollisionFlag.W_W) === CollisionFlag._OPEN) {
                    return true;
                } else if (sx === dx && sz === dz - 1 && (this.flags[index] & CollisionFlag.W_N) === CollisionFlag._OPEN) {
                    return true;
                }
            } else if (angle === LocAngle.NORTH) {
                if (sx === dx - 1 && sz === dz && (this.flags[index] & CollisionFlag.W_E) === CollisionFlag._OPEN) {
                    return true;
                } else if (sx === dx && sz === dz - 1 && (this.flags[index] & CollisionFlag.W_N) === CollisionFlag._OPEN) {
                    return true;
                }
            } else if (angle === LocAngle.EAST) {
                if (sx === dx - 1 && sz === dz && (this.flags[index] & CollisionFlag.W_E) === CollisionFlag._OPEN) {
                    return true;
                } else if (sx === dx && sz === dz + 1 && (this.flags[index] & CollisionFlag.W_S) === CollisionFlag._OPEN) {
                    return true;
                }
            } else if (angle === LocAngle.SOUTH) {
                if (sx === dx + 1 && sz === dz && (this.flags[index] & CollisionFlag.W_W) === CollisionFlag._OPEN) {
                    return true;
                } else if (sx === dx && sz === dz + 1 && (this.flags[index] & CollisionFlag.W_S) === CollisionFlag._OPEN) {
                    return true;
                }
            }
        } else if (shape === LocShape.WALLDECOR_DIAGONAL_BOTH) {
            if (sx === dx && sz === dz + 1 && (this.flags[index] & CollisionFlag.W_S) === CollisionFlag._OPEN) {
                return true;
            } else if (sx === dx && sz === dz - 1 && (this.flags[index] & CollisionFlag.W_N) === CollisionFlag._OPEN) {
                return true;
            } else if (sx === dx - 1 && sz === dz && (this.flags[index] & CollisionFlag.W_E) === CollisionFlag._OPEN) {
                return true;
            } else if (sx === dx + 1 && sz === dz && (this.flags[index] & CollisionFlag.W_W) === CollisionFlag._OPEN) {
                return true;
            }
        }
        return false;
    }

    testLoc(srcX: number, srcZ: number, dstX: number, dstZ: number, dstSizeX: number, dstSizeZ: number, forceapproach: number): boolean {
        const maxX: number = dstX + dstSizeX - 1;
        const maxZ: number = dstZ + dstSizeZ - 1;
        const index: number = CollisionMap.index(srcX - this.startX, srcZ - this.startZ);

        if (srcX >= dstX && srcX <= maxX && srcZ >= dstZ && srcZ <= maxZ) {
            return true;
        } else if (srcX === dstX - 1 && srcZ >= dstZ && srcZ <= maxZ && (this.flags[index] & CollisionFlag.W_E) === CollisionFlag._OPEN && (forceapproach & DirectionFlag.WEST) === CollisionFlag._OPEN) {
            return true;
        } else if (srcX === maxX + 1 && srcZ >= dstZ && srcZ <= maxZ && (this.flags[index] & CollisionFlag.W_W) === CollisionFlag._OPEN && (forceapproach & DirectionFlag.EAST) === CollisionFlag._OPEN) {
            return true;
        } else if (srcZ === dstZ - 1 && srcX >= dstX && srcX <= maxX && (this.flags[index] & CollisionFlag.W_N) === CollisionFlag._OPEN && (forceapproach & DirectionFlag.SOUTH) === CollisionFlag._OPEN) {
            return true;
        } else if (srcZ === maxZ + 1 && srcX >= dstX && srcX <= maxX && (this.flags[index] & CollisionFlag.W_S) === CollisionFlag._OPEN && (forceapproach & DirectionFlag.NORTH) === CollisionFlag._OPEN) {
            return true;
        }
        return false;
    }

    private addCMap(x: number, z: number, flags: number): void {
        this.flags[CollisionMap.index(x, z)] |= flags;
    }

    private remCMap(x: number, z: number, flags: number): void {
        this.flags[CollisionMap.index(x, z)] &= CollisionFlag._BOUNDS - flags;
    }
}
