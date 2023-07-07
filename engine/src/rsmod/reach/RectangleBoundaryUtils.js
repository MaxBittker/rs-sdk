import BlockAccessFlag from '../flag/BlockAccessFlag.js';
import CollisionFlag from '../flag/CollisionFlag.js';

export default class RectangleBoundaryUtils {
    static collides(srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight) {
        if (srcX >= destX + destWidth || srcX + srcWidth <= destX) {
            return false;
        } else {
            return srcZ < destZ + destHeight && destZ < srcHeight + srcZ;
        }
    }

    static reachRectangle1(flags, level, srcX, srcZ, destX, destZ, destWidth, destHeight, blockAccessFlags) {
        let east = destX + destWidth - 1;
        let north = destZ + destHeight - 1;

        if (srcX == destX - 1 && srcZ >= destZ && srcZ <= north &&
            (flags.get(srcX, srcZ, level) & CollisionFlag.WALL_EAST) == 0 &&
            (blockAccessFlags & BlockAccessFlag.BLOCK_WEST) == 0
        ) {
            return true;
        }

        if (srcX == east + 1 && srcZ >= destZ && srcZ <= north &&
            (flags.get(srcX, srcZ, level) & CollisionFlag.WALL_WEST) == 0 &&
            (blockAccessFlags & BlockAccessFlag.BLOCK_EAST) == 0
        ) {
            return true;
        }

        if (srcZ + 1 == destZ && srcX >= destX && srcX <= east &&
            (flags.get(srcX, srcZ, level) & CollisionFlag.WALL_NORTH) == 0 &&
            (blockAccessFlags & BlockAccessFlag.BLOCK_SOUTH) == 0
        ) {
            return true;
        }

        if (srcZ == north + 1 && srcX >= destX && srcX <= east &&
            (flags.get(srcX, srcZ, level) & CollisionFlag.WALL_SOUTH) == 0 &&
            (blockAccessFlags & BlockAccessFlag.BLOCK_NORTH) == 0
        ) {
            return true;
        }

        return false;
    }

    static reachRectangleN(flags, level, srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight, blockAccessFlags) {
        let srcEast = srcX + srcWidth;
        let srcNorth = srcHeight + srcZ;
        let destEast = destWidth + destX;
        let destNorth = destHeight + destZ;

        if (destEast == srcX && (blockAccessFlags & BlockAccessFlag.BLOCK_EAST) == 0) {
            let fromZ = max(srcZ, destZ);
            let toZ = min(srcNorth, destNorth);

            // for (sideZ in fromZ until toZ) {
            //     if (flags[destEast - 1, sideZ, level] & CollisionFlag.WALL_EAST == 0) {
            //         return true
            //     }
            // }
        } else if (srcEast == destX && (blockAccessFlags & BlockAccessFlag.BLOCK_WEST) == 0) {
            let fromZ = max(srcZ, destZ);
            let toZ = min(srcNorth, destNorth);

            // for (sideZ in fromZ until toZ) {
            //     if (flags[destX, sideZ, level] & CollisionFlag.WALL_WEST == 0) {
            //         return true
            //     }
            // }
        } else if (srcZ == destNorth && (blockAccessFlags & BlockAccessFlag.BLOCK_NORTH) == 0) {
            let fromX = max(srcX, destX);
            let toX = min(srcEast, destEast);

            // for (sideX in fromX until toX) {
            //     if (flags[sideX, destNorth - 1, level] & CollisionFlag.WALL_NORTH == 0) {
            //         return true
            //     }
            // }
        } else if (destZ == srcNorth && (blockAccessFlags & BlockAccessFlag.BLOCK_SOUTH) == 0) {
            let fromX = max(srcX, destX);
            let toX = min(srcEast, destEast);

            // for (sideX in fromX until toX) {
            //     if (flags[sideX, destZ, level] & CollisionFlag.WALL_SOUTH == 0) {
            //         return true
            //     }
            // }
        }

        return false;
    }
}
