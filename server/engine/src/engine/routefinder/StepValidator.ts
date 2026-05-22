import { canMove } from '#/engine/routefinder/CollisionStrategy.js';
import CollisionEngine from '#/engine/routefinder/CollisionEngine.js';
import { CollisionFlag, CollisionType } from '#/engine/routefinder/flags.js';

export function canTravel(flags: CollisionEngine, y: number, x: number, z: number, offsetX: number, offsetZ: number, size: number, extraFlag: number, collision: CollisionType): boolean {
    if (offsetX === 0 && offsetZ === -1) {
        return !isBlockedSouth(flags, y, x, z, size, extraFlag, collision);
    }
    if (offsetX === 0 && offsetZ === 1) {
        return !isBlockedNorth(flags, y, x, z, size, extraFlag, collision);
    }
    if (offsetX === -1 && offsetZ === 0) {
        return !isBlockedWest(flags, y, x, z, size, extraFlag, collision);
    }
    if (offsetX === 1 && offsetZ === 0) {
        return !isBlockedEast(flags, y, x, z, size, extraFlag, collision);
    }
    if (offsetX === -1 && offsetZ === -1) {
        return !isBlockedSouthWest(flags, y, x, z, size, extraFlag, collision);
    }
    if (offsetX === -1 && offsetZ === 1) {
        return !isBlockedNorthWest(flags, y, x, z, size, extraFlag, collision);
    }
    if (offsetX === 1 && offsetZ === -1) {
        return !isBlockedSouthEast(flags, y, x, z, size, extraFlag, collision);
    }
    if (offsetX === 1 && offsetZ === 1) {
        return !isBlockedNorthEast(flags, y, x, z, size, extraFlag, collision);
    }
    return false;
}

function isBlockedSouth(flags: CollisionEngine, y: number, x: number, z: number, size: number, extraFlag: number, collision: CollisionType): boolean {
    switch (size) {
        case 1:
            return !canMove(collision, flags.get(x, z - 1, y), CollisionFlag.BLOCK_SOUTH | extraFlag);
        case 2:
            return !canMove(collision, flags.get(x, z - 1, y), CollisionFlag.BLOCK_SOUTH_WEST | extraFlag) || !canMove(collision, flags.get(x + 1, z - 1, y), CollisionFlag.BLOCK_SOUTH_EAST | extraFlag);
        default:
            if (!canMove(collision, flags.get(x, z - 1, y), CollisionFlag.BLOCK_SOUTH_WEST | extraFlag)) {
                return true;
            }
            if (!canMove(collision, flags.get(x + size - 1, z - 1, y), CollisionFlag.BLOCK_SOUTH_EAST | extraFlag)) {
                return true;
            }
            for (let midX = x + 1; midX < x + size - 1; midX++) {
                if (!canMove(collision, flags.get(midX, z - 1, y), CollisionFlag.BLOCK_NORTH_EAST_AND_WEST | extraFlag)) {
                    return true;
                }
            }
            return false;
    }
}

function isBlockedNorth(flags: CollisionEngine, y: number, x: number, z: number, size: number, extraFlag: number, collision: CollisionType): boolean {
    switch (size) {
        case 1:
            return !canMove(collision, flags.get(x, z + 1, y), CollisionFlag.BLOCK_NORTH | extraFlag);
        case 2:
            return !canMove(collision, flags.get(x, z + 2, y), CollisionFlag.BLOCK_NORTH_WEST | extraFlag) || !canMove(collision, flags.get(x + 1, z + 2, y), CollisionFlag.BLOCK_NORTH_EAST | extraFlag);
        default:
            if (!canMove(collision, flags.get(x, z + size, y), CollisionFlag.BLOCK_NORTH_WEST | extraFlag)) {
                return true;
            }
            if (!canMove(collision, flags.get(x + size - 1, z + size, y), CollisionFlag.BLOCK_NORTH_EAST | extraFlag)) {
                return true;
            }
            for (let midX = x + 1; midX < x + size - 1; midX++) {
                if (!canMove(collision, flags.get(midX, z + size, y), CollisionFlag.BLOCK_SOUTH_EAST_AND_WEST | extraFlag)) {
                    return true;
                }
            }
            return false;
    }
}

function isBlockedWest(flags: CollisionEngine, y: number, x: number, z: number, size: number, extraFlag: number, collision: CollisionType): boolean {
    switch (size) {
        case 1:
            return !canMove(collision, flags.get(x - 1, z, y), CollisionFlag.BLOCK_WEST | extraFlag);
        case 2:
            return !canMove(collision, flags.get(x - 1, z, y), CollisionFlag.BLOCK_SOUTH_WEST | extraFlag) || !canMove(collision, flags.get(x - 1, z + 1, y), CollisionFlag.BLOCK_NORTH_WEST | extraFlag);
        default:
            if (!canMove(collision, flags.get(x - 1, z, y), CollisionFlag.BLOCK_SOUTH_WEST | extraFlag)) {
                return true;
            }
            if (!canMove(collision, flags.get(x - 1, z + size - 1, y), CollisionFlag.BLOCK_NORTH_WEST | extraFlag)) {
                return true;
            }
            for (let midZ = z + 1; midZ < z + size - 1; midZ++) {
                if (!canMove(collision, flags.get(x - 1, midZ, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_EAST | extraFlag)) {
                    return true;
                }
            }
            return false;
    }
}

function isBlockedEast(flags: CollisionEngine, y: number, x: number, z: number, size: number, extraFlag: number, collision: CollisionType): boolean {
    switch (size) {
        case 1:
            return !canMove(collision, flags.get(x + 1, z, y), CollisionFlag.BLOCK_EAST | extraFlag);
        case 2:
            return !canMove(collision, flags.get(x + 2, z, y), CollisionFlag.BLOCK_SOUTH_EAST | extraFlag) || !canMove(collision, flags.get(x + 2, z + 1, y), CollisionFlag.BLOCK_NORTH_EAST | extraFlag);
        default:
            if (!canMove(collision, flags.get(x + size, z, y), CollisionFlag.BLOCK_SOUTH_EAST | extraFlag)) {
                return true;
            }
            if (!canMove(collision, flags.get(x + size, z + size - 1, y), CollisionFlag.BLOCK_NORTH_EAST | extraFlag)) {
                return true;
            }
            for (let midZ = z + 1; midZ < z + size - 1; midZ++) {
                if (!canMove(collision, flags.get(x + size, midZ, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_WEST | extraFlag)) {
                    return true;
                }
            }
            return false;
    }
}

function isBlockedSouthWest(flags: CollisionEngine, y: number, x: number, z: number, size: number, extraFlag: number, collision: CollisionType): boolean {
    switch (size) {
        case 1:
            return (
                !canMove(collision, flags.get(x - 1, z - 1, y), CollisionFlag.BLOCK_SOUTH_WEST | extraFlag) ||
                !canMove(collision, flags.get(x - 1, z, y), CollisionFlag.BLOCK_WEST | extraFlag) ||
                !canMove(collision, flags.get(x, z - 1, y), CollisionFlag.BLOCK_SOUTH | extraFlag)
            );
        case 2:
            return (
                !canMove(collision, flags.get(x - 1, z, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_EAST | extraFlag) ||
                !canMove(collision, flags.get(x - 1, z - 1, y), CollisionFlag.BLOCK_SOUTH_WEST | extraFlag) ||
                !canMove(collision, flags.get(x, z - 1, y), CollisionFlag.BLOCK_NORTH_EAST_AND_WEST | extraFlag)
            );
        default:
            if (!canMove(collision, flags.get(x - 1, z - 1, y), CollisionFlag.BLOCK_SOUTH_WEST | extraFlag)) {
                return true;
            }
            for (let mid = 1; mid < size; mid++) {
                if (!canMove(collision, flags.get(x - 1, z + mid - 1, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_EAST | extraFlag)) {
                    return true;
                }
                if (!canMove(collision, flags.get(x + mid - 1, z - 1, y), CollisionFlag.BLOCK_NORTH_EAST_AND_WEST | extraFlag)) {
                    return true;
                }
            }
            return false;
    }
}

function isBlockedNorthWest(flags: CollisionEngine, y: number, x: number, z: number, size: number, extraFlag: number, collision: CollisionType): boolean {
    switch (size) {
        case 1:
            return (
                !canMove(collision, flags.get(x - 1, z + 1, y), CollisionFlag.BLOCK_NORTH_WEST | extraFlag) ||
                !canMove(collision, flags.get(x - 1, z, y), CollisionFlag.BLOCK_WEST | extraFlag) ||
                !canMove(collision, flags.get(x, z + 1, y), CollisionFlag.BLOCK_NORTH | extraFlag)
            );
        case 2:
            return (
                !canMove(collision, flags.get(x - 1, z + 1, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_EAST | extraFlag) ||
                !canMove(collision, flags.get(x - 1, z + 2, y), CollisionFlag.BLOCK_NORTH_WEST | extraFlag) ||
                !canMove(collision, flags.get(x, z + 2, y), CollisionFlag.BLOCK_SOUTH_EAST_AND_WEST | extraFlag)
            );
        default:
            if (!canMove(collision, flags.get(x - 1, z + size, y), CollisionFlag.BLOCK_NORTH_WEST | extraFlag)) {
                return true;
            }
            for (let mid = 1; mid < size; mid++) {
                if (!canMove(collision, flags.get(x - 1, z + mid, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_EAST | extraFlag)) {
                    return true;
                }
                if (!canMove(collision, flags.get(x + mid - 1, z + size, y), CollisionFlag.BLOCK_SOUTH_EAST_AND_WEST | extraFlag)) {
                    return true;
                }
            }
            return false;
    }
}

function isBlockedSouthEast(flags: CollisionEngine, y: number, x: number, z: number, size: number, extraFlag: number, collision: CollisionType): boolean {
    switch (size) {
        case 1:
            return (
                !canMove(collision, flags.get(x + 1, z - 1, y), CollisionFlag.BLOCK_SOUTH_EAST | extraFlag) ||
                !canMove(collision, flags.get(x + 1, z, y), CollisionFlag.BLOCK_EAST | extraFlag) ||
                !canMove(collision, flags.get(x, z - 1, y), CollisionFlag.BLOCK_SOUTH | extraFlag)
            );
        case 2:
            return (
                !canMove(collision, flags.get(x + 1, z - 1, y), CollisionFlag.BLOCK_NORTH_EAST_AND_WEST | extraFlag) ||
                !canMove(collision, flags.get(x + 2, z - 1, y), CollisionFlag.BLOCK_SOUTH_EAST | extraFlag) ||
                !canMove(collision, flags.get(x + 2, z, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_WEST | extraFlag)
            );
        default:
            if (!canMove(collision, flags.get(x + size, z - 1, y), CollisionFlag.BLOCK_SOUTH_EAST | extraFlag)) {
                return true;
            }
            for (let mid = 1; mid < size; mid++) {
                if (!canMove(collision, flags.get(x + size, z + mid - 1, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_WEST | extraFlag)) {
                    return true;
                }
                if (!canMove(collision, flags.get(x + mid, z - 1, y), CollisionFlag.BLOCK_NORTH_EAST_AND_WEST | extraFlag)) {
                    return true;
                }
            }
            return false;
    }
}

function isBlockedNorthEast(flags: CollisionEngine, y: number, x: number, z: number, size: number, extraFlag: number, collision: CollisionType): boolean {
    switch (size) {
        case 1:
            return (
                !canMove(collision, flags.get(x + 1, z + 1, y), CollisionFlag.BLOCK_NORTH_EAST | extraFlag) ||
                !canMove(collision, flags.get(x + 1, z, y), CollisionFlag.BLOCK_EAST | extraFlag) ||
                !canMove(collision, flags.get(x, z + 1, y), CollisionFlag.BLOCK_NORTH | extraFlag)
            );
        case 2:
            return (
                !canMove(collision, flags.get(x + 1, z + 2, y), CollisionFlag.BLOCK_SOUTH_EAST_AND_WEST | extraFlag) ||
                !canMove(collision, flags.get(x + 2, z + 2, y), CollisionFlag.BLOCK_NORTH_EAST | extraFlag) ||
                !canMove(collision, flags.get(x + 2, z + 1, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_WEST | extraFlag)
            );
        default:
            if (!canMove(collision, flags.get(x + size, z + size, y), CollisionFlag.BLOCK_NORTH_EAST | extraFlag)) {
                return true;
            }
            for (let mid = 1; mid < size; mid++) {
                if (!canMove(collision, flags.get(x + mid, z + size, y), CollisionFlag.BLOCK_SOUTH_EAST_AND_WEST | extraFlag)) {
                    return true;
                }
                if (!canMove(collision, flags.get(x + size, z + mid, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_WEST | extraFlag)) {
                    return true;
                }
            }
            return false;
    }
}
