import RotationUtils from '../utils/RotationUtils.js';
import RectangleBoundaryUtils from './RectangleBoundaryUtils.js';

export default class ReachStrategy {
    static WALL_STRATEGY = 0;
    static WALL_DECO_STRATEGY = 1;
    static RECTANGLE_STRATEGY = 2;
    static NO_STRATEGY = 3;
    static RECTANGLE_EXCLUSIVE_STRATEGY = 4;

    static exitStrategy(locShape) {
        if (locShape == -2) {
            return ReachStrategy.RECTANGLE_EXCLUSIVE_STRATEGY;
        } else if (locShape == -1) {
            return ReachStrategy.NO_STRATEGY;
        } else if ((locShape >= 0 && locShape <= 3) || locShape == 9) {
            return ReachStrategy.WALL_STRATEGY;
        } else if (locShape < 9) {
            return ReachStrategy.WALL_DECO_STRATEGY;
        } else if ((locShape >= 10 && locShape <= 11) || locShape == 22) {
            return ReachStrategy.RECTANGLE_STRATEGY;
        } else {
            return ReachStrategy.NO_STRATEGY;
        }
    }

    static alteredRotation(rotation, shape) {
        return shape == 7 ? ((rotation + 2) & 0x3) : rotation;
    }

    static reached(flags, level, srcX, srcZ, destX, destZ, destWidth, destHeight, srcSize, locRot = 0, locShape = -1, blockAccessFlags = 0) {
        let exitStrategy = ReachStrategy.exitStrategy(locShape);
        if (exitStrategy != ReachStrategy.RECTANGLE_EXCLUSIVE_STRATEGY && srcX == destX && srcZ == destZ) {
            return true;
        }

        if (exitStrategy === ReachStrategy.WALL_STRATEGY) {
            return ReachStrategy.reachWall(flags, level, srcX, srcZ, destX, destZ, srcSize, locShape, locRot);
        } else if (exitStrategy === ReachStrategy.WALL_DECO_STRATEGY) {
            return ReachStrategy.reachWallDeco(flags, level, srcX, srcZ, destX, destZ, srcSize, locShape, locRot);
        } else if (exitStrategy === ReachStrategy.RECTANGLE_STRATEGY) {
            return ReachStrategy.reachRectangle(flags, level, srcX, srcZ, destX, destZ, srcSize, destWidth, destHeight, locRot, blockAccessFlags);
        } else if (exitStrategy === ReachStrategy.RECTANGLE_EXCLUSIVE_STRATEGY) {
            return ReachStrategy.reachExclusiveRectangle(flags, level, srcX, srcZ, destX, destZ, srcSize, destWidth, destHeight, locRot, blockAccessFlags);
        } else {
            return false;
        }
    }

    static reachRectangle(flags, level, srcX, srcZ, destX, destZ, srcSize, destWidth, destHeight, locRot, blockAccessFlags) {
        let rotatedWidth = RotationUtils.rotate(locRot, destWidth, destHeight);
        let rotatedHeight = RotationUtils.rotate(locRot, destHeight, destWidth);
        let rotatedBlockAccess = RotationUtils.rotateFlags(locRot, blockAccessFlags);

        if (srcSize > 1) {
            return RectangleBoundaryUtils.collides(srcX, srcZ, destX, destZ, srcSize, srcSize, rotatedWidth, rotatedHeight) ||
                RectangleBoundaryUtils.reachRectangleN(flags, level, srcX, srcZ, destX, destZ, srcSize, srcSize, destWidth, destHeight, rotatedBlockAccess);
        } else {
            return RectangleBoundaryUtils.collides(srcX, srcZ, destX, destZ, srcSize, srcSize, rotatedWidth, rotatedHeight) ||
                RectangleBoundaryUtils.reachRectangle1(flags, level, srcX, srcZ, destX, destZ, destWidth, destHeight, rotatedBlockAccess);
        }
    }

    static reachExclusiveRectangle(flags, level, srcX, srcZ, destX, destZ, srcSize, destWidth, destHeight, locRot, blockAccessFlags) {
        let rotatedWidth = RotationUtils.rotate(locRot, destWidth, destHeight);
        let rotatedHeight = RotationUtils.rotate(locRot, destHeight, destWidth);
        let rotatedBlockAccess = RotationUtils.rotateFlags(locRot, blockAccessFlags);

        if (srcSize > 1) {
            return !RectangleBoundaryUtils.collides(srcX, srcZ, destX, destZ, srcSize, srcSize, rotatedWidth, rotatedHeight) &&
                RectangleBoundaryUtils.reachRectangleN(flags, level, srcX, srcZ, destX, destZ, srcSize, srcSize, destWidth, destHeight, rotatedBlockAccess);
        } else {
            return !RectangleBoundaryUtils.collides(srcX, srcZ, destX, destZ, srcSize, srcSize, rotatedWidth, rotatedHeight) &&
                RectangleBoundaryUtils.reachRectangle1(flags, level, srcX, srcZ, destX, destZ, destWidth, destHeight, rotatedBlockAccess);
        }
    }

    static reachWall(flags, level, srcX, srcZ, destX, destZ, srcSize, locShape, locRot) {
        if (srcSize == 1 && srcX == destX && srcZ == destZ) {
            return true;
        } else if (srcSize != 1 && destX >= srcX && srcSize + srcX - 1 >= destX && destZ >= srcZ && srcSize + srcZ - 1 >= destZ) {
            return true;
        } else if (srcSize == 1) {
            return ReachStrategy.reachWall1(flags, level, srcX, srcZ, destX, destZ, locShape, locRot);
        } else {
            return ReachStrategy.reachWallN(flags, level, srcX, srcZ, destX, destZ, srcSize, locShape, locRot);
        }
    }

    static reachWallDeco(flags, level, srcX, srcZ, destX, destZ, srcSize, locShape, locRot) {
        if (srcSize == 1 && srcX == destX && srcZ == destZ) {
            return true;
        } else if (srcSize != 1 && destX >= srcX && srcSize + srcX - 1 >= destX && destZ >= srcZ && srcSize + srcZ - 1 >= destZ) {
            return true;
        } else if (srcSize == 1) {
            return ReachStrategy.reachWallDeco1(flags, level, srcX, srcZ, destX, destZ, locShape, locRot);
        } else {
            return ReachStrategy.reachWallDecoN(flags, level, srcX, srcZ, destX, destZ, srcSize, locShape, locRot);
        }
    }

    // ----

    static reachWall1(flags, level, srcX, srcZ, destX, destZ, locShape, locRot) {
    }

    static reachWallN(flags, level, srcX, srcZ, destX, destZ, srcSize, locShape, locRot) {
    }

    static reachWallDeco1(flags, level, srcX, srcZ, destX, destZ, locShape, locRot) {
    }

    static reachWallDecoN(flags, level, srcX, srcZ, destX, destZ, srcSize, locShape, locRot) {
    }
}
