import CollisionEngine from '#/engine/routefinder/CollisionEngine.js';
import { BlockAccessFlag, CollisionFlag } from '#/engine/routefinder/flags.js';

export function collides(srcX: number, srcZ: number, destX: number, destZ: number, srcWidth: number, srcHeight: number, destWidth: number, destHeight: number): boolean {
    if (srcX >= destX + destWidth || srcX + srcWidth <= destX) {
        return false;
    }
    return srcZ < destZ + destHeight && destZ < srcHeight + srcZ;
}

export function reachRectangle1(flags: CollisionEngine, y: number, srcX: number, srcZ: number, destX: number, destZ: number, destWidth: number, destHeight: number, blockAccessFlags: number): boolean {
    const east = destX + destWidth - 1;
    const north = destZ + destHeight - 1;

    if (srcX === destX - 1 && srcZ >= destZ && srcZ <= north && (flags.get(srcX, srcZ, y) & CollisionFlag.WALL_EAST) === CollisionFlag.OPEN && (blockAccessFlags & BlockAccessFlag.BLOCK_WEST) === 0) {
        return true;
    }

    if (srcX === east + 1 && srcZ >= destZ && srcZ <= north && (flags.get(srcX, srcZ, y) & CollisionFlag.WALL_WEST) === CollisionFlag.OPEN && (blockAccessFlags & BlockAccessFlag.BLOCK_EAST) === 0) {
        return true;
    }

    if (srcZ + 1 === destZ && srcX >= destX && srcX <= east && (flags.get(srcX, srcZ, y) & CollisionFlag.WALL_NORTH) === CollisionFlag.OPEN && (blockAccessFlags & BlockAccessFlag.BLOCK_SOUTH) === 0) {
        return true;
    }

    return srcZ === north + 1 && srcX >= destX && srcX <= east && (flags.get(srcX, srcZ, y) & CollisionFlag.WALL_SOUTH) === CollisionFlag.OPEN && (blockAccessFlags & BlockAccessFlag.BLOCK_NORTH) === 0;
}

export function reachRectangleN(flags: CollisionEngine, y: number, srcX: number, srcZ: number, destX: number, destZ: number, srcWidth: number, srcHeight: number, destWidth: number, destHeight: number, blockAccessFlags: number): boolean {
    const srcEast = srcX + srcWidth;
    const srcNorth = srcZ + srcHeight;
    const destEast = destX + destWidth;
    const destNorth = destZ + destHeight;

    if (destEast === srcX && (blockAccessFlags & BlockAccessFlag.BLOCK_EAST) === 0) {
        const fromZ = Math.max(srcZ, destZ);
        const toZ = Math.min(srcNorth, destNorth);
        for (let sideZ = fromZ; sideZ < toZ; sideZ++) {
            if ((flags.get(destEast - 1, sideZ, y) & CollisionFlag.WALL_EAST) === CollisionFlag.OPEN) {
                return true;
            }
        }
    } else if (srcEast === destX && (blockAccessFlags & BlockAccessFlag.BLOCK_WEST) === 0) {
        const fromZ = Math.max(srcZ, destZ);
        const toZ = Math.min(srcNorth, destNorth);
        for (let sideZ = fromZ; sideZ < toZ; sideZ++) {
            if ((flags.get(destX, sideZ, y) & CollisionFlag.WALL_WEST) === CollisionFlag.OPEN) {
                return true;
            }
        }
    } else if (srcZ === destNorth && (blockAccessFlags & BlockAccessFlag.BLOCK_NORTH) === 0) {
        const fromX = Math.max(srcX, destX);
        const toX = Math.min(srcEast, destEast);
        for (let sideX = fromX; sideX < toX; sideX++) {
            if ((flags.get(sideX, destNorth - 1, y) & CollisionFlag.WALL_NORTH) === CollisionFlag.OPEN) {
                return true;
            }
        }
    } else if (destZ === srcNorth && (blockAccessFlags & BlockAccessFlag.BLOCK_SOUTH) === 0) {
        const fromX = Math.max(srcX, destX);
        const toX = Math.min(srcEast, destEast);
        for (let sideX = fromX; sideX < toX; sideX++) {
            if ((flags.get(sideX, destZ, y) & CollisionFlag.WALL_SOUTH) === CollisionFlag.OPEN) {
                return true;
            }
        }
    }
    return false;
}
