import CollisionEngine from '#/engine/routefinder/CollisionEngine.js';
import { CollisionFlag, LocAngle, LocShape } from '#/engine/routefinder/flags.js';
import { collides, reachRectangle1, reachRectangleN } from '#/engine/routefinder/RectangleBoundary.js';
import { rotate, rotateFlags } from '#/engine/routefinder/Rotation.js';

export default class ReachStrategy {
    private static readonly WALL_STRATEGY = 0;
    private static readonly WALL_DECOR_STRATEGY = 1;
    private static readonly RECTANGLE_STRATEGY = 2;
    private static readonly NO_STRATEGY = 3;
    private static readonly RECTANGLE_EXCLUSIVE_STRATEGY = 4;

    static alteredRotation(angle: number, shape: number): number {
        return shape === 7 ? (angle + 2) & 0x3 : angle;
    }

    static reached(flags: CollisionEngine, y: number, srcX: number, srcZ: number, destX: number, destZ: number, destWidth: number, destHeight: number, srcSize: number, angle: number, shape: number, blockAccessFlags: number): boolean {
        const exitStrategy = ReachStrategy.exitStrategy(shape);
        if (exitStrategy !== ReachStrategy.RECTANGLE_EXCLUSIVE_STRATEGY && srcX === destX && srcZ === destZ) {
            return true;
        }

        switch (exitStrategy) {
            case ReachStrategy.WALL_STRATEGY:
                return ReachStrategy.reachWall(flags, y, srcX, srcZ, destX, destZ, srcSize, shape, angle);
            case ReachStrategy.WALL_DECOR_STRATEGY:
                return ReachStrategy.reachWallDecor(flags, y, srcX, srcZ, destX, destZ, srcSize, shape, angle);
            case ReachStrategy.RECTANGLE_STRATEGY:
                return ReachStrategy.reachRectangle(flags, y, srcX, srcZ, destX, destZ, srcSize, destWidth, destHeight, angle, blockAccessFlags);
            case ReachStrategy.RECTANGLE_EXCLUSIVE_STRATEGY:
                return ReachStrategy.reachExclusiveRectangle(flags, y, srcX, srcZ, destX, destZ, srcSize, destWidth, destHeight, angle, blockAccessFlags);
            default:
                return false;
        }
    }

    static reachRectangle(flags: CollisionEngine, y: number, srcX: number, srcZ: number, destX: number, destZ: number, srcSize: number, destWidth: number, destHeight: number, angle: number, blockAccessFlags: number): boolean {
        const rotatedWidth = rotate(angle, destWidth, destHeight);
        const rotatedHeight = rotate(angle, destHeight, destWidth);
        const rotatedBlockAccess = rotateFlags(angle, blockAccessFlags);
        const intersects = collides(srcX, srcZ, destX, destZ, srcSize, srcSize, rotatedWidth, rotatedHeight);

        return srcSize === 1
            ? intersects || reachRectangle1(flags, y, srcX, srcZ, destX, destZ, rotatedWidth, rotatedHeight, rotatedBlockAccess)
            : intersects || reachRectangleN(flags, y, srcX, srcZ, destX, destZ, srcSize, srcSize, rotatedWidth, rotatedHeight, rotatedBlockAccess);
    }

    static reachExclusiveRectangle(flags: CollisionEngine, y: number, srcX: number, srcZ: number, destX: number, destZ: number, srcSize: number, destWidth: number, destHeight: number, angle: number, blockAccessFlags: number): boolean {
        const rotatedWidth = rotate(angle, destWidth, destHeight);
        const rotatedHeight = rotate(angle, destHeight, destWidth);
        const rotatedBlockAccess = rotateFlags(angle, blockAccessFlags);
        const intersects = collides(srcX, srcZ, destX, destZ, srcSize, srcSize, rotatedWidth, rotatedHeight);

        return srcSize === 1
            ? !intersects && reachRectangle1(flags, y, srcX, srcZ, destX, destZ, rotatedWidth, rotatedHeight, rotatedBlockAccess)
            : !intersects && reachRectangleN(flags, y, srcX, srcZ, destX, destZ, srcSize, srcSize, rotatedWidth, rotatedHeight, rotatedBlockAccess);
    }

    private static exitStrategy(shape: number): number {
        if (shape === -2) {
            return ReachStrategy.RECTANGLE_EXCLUSIVE_STRATEGY;
        }
        if (shape === -1) {
            return ReachStrategy.NO_STRATEGY;
        }
        if ((shape >= 0 && shape <= 3) || shape === 9) {
            return ReachStrategy.WALL_STRATEGY;
        }
        if (shape < 9) {
            return ReachStrategy.WALL_DECOR_STRATEGY;
        }
        if ((shape >= 10 && shape <= 11) || shape === 22) {
            return ReachStrategy.RECTANGLE_STRATEGY;
        }
        return ReachStrategy.NO_STRATEGY;
    }

    private static reachWall(flags: CollisionEngine, y: number, srcX: number, srcZ: number, destX: number, destZ: number, srcSize: number, shape: number, angle: number): boolean {
        if (srcSize === 1 && srcX === destX && srcZ === destZ) {
            return true;
        }
        if (srcSize !== 1 && destX >= srcX && srcX + srcSize - 1 >= destX && destZ >= srcZ && srcZ + srcSize - 1 >= destZ) {
            return true;
        }
        return srcSize === 1 ? ReachStrategy.reachWall1(flags, y, srcX, srcZ, destX, destZ, shape, angle) : ReachStrategy.reachWallN(flags, y, srcX, srcZ, destX, destZ, srcSize, shape, angle);
    }

    private static reachWallDecor(flags: CollisionEngine, y: number, srcX: number, srcZ: number, destX: number, destZ: number, srcSize: number, shape: number, angle: number): boolean {
        if (srcSize === 1 && srcX === destX && srcZ === destZ) {
            return true;
        }
        if (srcSize !== 1 && destX >= srcX && srcX + srcSize - 1 >= destX && destZ >= srcZ && srcZ + srcSize - 1 >= destZ) {
            return true;
        }
        return srcSize === 1 ? ReachStrategy.reachWallDecor1(flags, y, srcX, srcZ, destX, destZ, shape, angle) : ReachStrategy.reachWallDecorN(flags, y, srcX, srcZ, destX, destZ, srcSize, shape, angle);
    }

    private static reachWall1(flags: CollisionEngine, y: number, srcX: number, srcZ: number, destX: number, destZ: number, shape: number, angle: number): boolean {
        const collisionFlags = flags.get(srcX, srcZ, y);

        if (shape === LocShape.WALL_STRAIGHT) {
            if (angle === LocAngle.WEST) {
                return (
                    (srcX === destX - 1 && srcZ === destZ) ||
                    (srcX === destX && srcZ === destZ + 1 && (collisionFlags & CollisionFlag.BLOCK_NORTH) === CollisionFlag.OPEN) ||
                    (srcX === destX && srcZ === destZ - 1 && (collisionFlags & CollisionFlag.BLOCK_SOUTH) === CollisionFlag.OPEN)
                );
            }
            if (angle === LocAngle.NORTH) {
                return (
                    (srcX === destX && srcZ === destZ + 1) ||
                    (srcX === destX - 1 && srcZ === destZ && (collisionFlags & CollisionFlag.BLOCK_WEST) === CollisionFlag.OPEN) ||
                    (srcX === destX + 1 && srcZ === destZ && (collisionFlags & CollisionFlag.BLOCK_EAST) === CollisionFlag.OPEN)
                );
            }
            if (angle === LocAngle.EAST) {
                return (
                    (srcX === destX + 1 && srcZ === destZ) ||
                    (srcX === destX && srcZ === destZ + 1 && (collisionFlags & CollisionFlag.BLOCK_NORTH) === CollisionFlag.OPEN) ||
                    (srcX === destX && srcZ === destZ - 1 && (collisionFlags & CollisionFlag.BLOCK_SOUTH) === CollisionFlag.OPEN)
                );
            }
            return (
                (srcX === destX && srcZ === destZ - 1) ||
                (srcX === destX - 1 && srcZ === destZ && (collisionFlags & CollisionFlag.BLOCK_WEST) === CollisionFlag.OPEN) ||
                (srcX === destX + 1 && srcZ === destZ && (collisionFlags & CollisionFlag.BLOCK_EAST) === CollisionFlag.OPEN)
            );
        }

        if (shape === LocShape.WALL_L) {
            if (angle === LocAngle.WEST) {
                return (
                    (srcX === destX - 1 && srcZ === destZ) ||
                    (srcX === destX && srcZ === destZ + 1) ||
                    (srcX === destX + 1 && srcZ === destZ && (collisionFlags & CollisionFlag.BLOCK_EAST) === CollisionFlag.OPEN) ||
                    (srcX === destX && srcZ === destZ - 1 && (collisionFlags & CollisionFlag.BLOCK_SOUTH) === CollisionFlag.OPEN)
                );
            }
            if (angle === LocAngle.NORTH) {
                return (
                    (srcX === destX - 1 && srcZ === destZ && (collisionFlags & CollisionFlag.BLOCK_WEST) === CollisionFlag.OPEN) ||
                    (srcX === destX && srcZ === destZ + 1) ||
                    (srcX === destX + 1 && srcZ === destZ) ||
                    (srcX === destX && srcZ === destZ - 1 && (collisionFlags & CollisionFlag.BLOCK_SOUTH) === CollisionFlag.OPEN)
                );
            }
            if (angle === LocAngle.EAST) {
                return (
                    (srcX === destX - 1 && srcZ === destZ && (collisionFlags & CollisionFlag.BLOCK_WEST) === CollisionFlag.OPEN) ||
                    (srcX === destX && srcZ === destZ + 1 && (collisionFlags & CollisionFlag.BLOCK_NORTH) === CollisionFlag.OPEN) ||
                    (srcX === destX + 1 && srcZ === destZ) ||
                    (srcX === destX && srcZ === destZ - 1)
                );
            }
            return (
                (srcX === destX - 1 && srcZ === destZ) ||
                (srcX === destX && srcZ === destZ + 1 && (collisionFlags & CollisionFlag.BLOCK_NORTH) === CollisionFlag.OPEN) ||
                (srcX === destX + 1 && srcZ === destZ && (collisionFlags & CollisionFlag.BLOCK_EAST) === CollisionFlag.OPEN) ||
                (srcX === destX && srcZ === destZ - 1)
            );
        }

        if (shape === LocShape.WALL_DIAGONAL) {
            return (
                (srcX === destX && srcZ === destZ + 1 && (collisionFlags & CollisionFlag.WALL_SOUTH) === CollisionFlag.OPEN) ||
                (srcX === destX && srcZ === destZ - 1 && (collisionFlags & CollisionFlag.WALL_NORTH) === CollisionFlag.OPEN) ||
                (srcX === destX - 1 && srcZ === destZ && (collisionFlags & CollisionFlag.WALL_EAST) === CollisionFlag.OPEN) ||
                (srcX === destX + 1 && srcZ === destZ && (collisionFlags & CollisionFlag.WALL_WEST) === CollisionFlag.OPEN)
            );
        }

        return false;
    }

    private static reachWallN(flags: CollisionEngine, y: number, srcX: number, srcZ: number, destX: number, destZ: number, srcSize: number, shape: number, angle: number): boolean {
        const collisionFlags = flags.get(srcX, srcZ, y);
        const east = srcX + srcSize - 1;
        const north = srcZ + srcSize - 1;

        if (shape === LocShape.WALL_STRAIGHT) {
            if (angle === LocAngle.WEST) {
                return (
                    (srcX === destX - srcSize && srcZ <= destZ && north >= destZ) ||
                    (destX >= srcX && destX <= east && srcZ === destZ + 1 && (collisionFlags & CollisionFlag.BLOCK_NORTH) === CollisionFlag.OPEN) ||
                    (destX >= srcX && destX <= east && srcZ === destZ - srcSize && (collisionFlags & CollisionFlag.BLOCK_SOUTH) === CollisionFlag.OPEN)
                );
            }
            if (angle === LocAngle.NORTH) {
                return (
                    (destX >= srcX && destX <= east && srcZ === destZ + 1) ||
                    (srcX === destX - srcSize && srcZ <= destZ && north >= destZ && (collisionFlags & CollisionFlag.BLOCK_WEST) === CollisionFlag.OPEN) ||
                    (srcX === destX + 1 && srcZ <= destZ && north >= destZ && (collisionFlags & CollisionFlag.BLOCK_EAST) === CollisionFlag.OPEN)
                );
            }
            if (angle === LocAngle.EAST) {
                return (
                    (srcX === destX + 1 && srcZ <= destZ && north >= destZ) ||
                    (destX >= srcX && destX <= east && srcZ === destZ + 1 && (collisionFlags & CollisionFlag.BLOCK_NORTH) === CollisionFlag.OPEN) ||
                    (destX >= srcX && destX <= east && srcZ === destZ - srcSize && (collisionFlags & CollisionFlag.BLOCK_SOUTH) === CollisionFlag.OPEN)
                );
            }
            return (
                (destX >= srcX && destX <= east && srcZ === destZ - srcSize) ||
                (srcX === destX - srcSize && srcZ <= destZ && north >= destZ && (collisionFlags & CollisionFlag.BLOCK_WEST) === CollisionFlag.OPEN) ||
                (srcX === destX + 1 && srcZ <= destZ && north >= destZ && (collisionFlags & CollisionFlag.BLOCK_EAST) === CollisionFlag.OPEN)
            );
        }

        if (shape === LocShape.WALL_L) {
            if (angle === LocAngle.WEST) {
                return (
                    (srcX === destX - srcSize && srcZ <= destZ && north >= destZ) ||
                    (destX >= srcX && destX <= east && srcZ === destZ + 1) ||
                    (srcX === destX + 1 && srcZ <= destZ && north >= destZ && (collisionFlags & CollisionFlag.BLOCK_EAST) === CollisionFlag.OPEN) ||
                    (destX >= srcX && destX <= east && srcZ === destZ - srcSize && (collisionFlags & CollisionFlag.BLOCK_SOUTH) === CollisionFlag.OPEN)
                );
            }
            if (angle === LocAngle.NORTH) {
                return (
                    (srcX === destX - srcSize && srcZ <= destZ && north >= destZ && (collisionFlags & CollisionFlag.BLOCK_WEST) === CollisionFlag.OPEN) ||
                    (destX >= srcX && destX <= east && srcZ === destZ + 1) ||
                    (srcX === destX + 1 && srcZ <= destZ && north >= destZ) ||
                    (destX >= srcX && destX <= east && srcZ === destZ - srcSize && (collisionFlags & CollisionFlag.BLOCK_SOUTH) === CollisionFlag.OPEN)
                );
            }
            if (angle === LocAngle.EAST) {
                return (
                    (srcX === destX - srcSize && srcZ <= destZ && north >= destZ && (collisionFlags & CollisionFlag.BLOCK_WEST) === CollisionFlag.OPEN) ||
                    (destX >= srcX && destX <= east && srcZ === destZ + 1 && (collisionFlags & CollisionFlag.BLOCK_NORTH) === CollisionFlag.OPEN) ||
                    (srcX === destX + 1 && srcZ <= destZ && north >= destZ) ||
                    (destX >= srcX && destX <= east && srcZ === destZ - srcSize)
                );
            }
            return (
                (srcX === destX - srcSize && srcZ <= destZ && north >= destZ) ||
                (destX >= srcX && destX <= east && srcZ === destZ + 1 && (collisionFlags & CollisionFlag.BLOCK_NORTH) === CollisionFlag.OPEN) ||
                (srcX === destX + 1 && srcZ <= destZ && north >= destZ && (collisionFlags & CollisionFlag.BLOCK_EAST) === CollisionFlag.OPEN) ||
                (destX >= srcX && destX <= east && srcZ === destZ - srcSize)
            );
        }

        if (shape === LocShape.WALL_DIAGONAL) {
            return (
                (destX >= srcX && destX <= east && srcZ === destZ + 1 && (collisionFlags & CollisionFlag.BLOCK_NORTH) === CollisionFlag.OPEN) ||
                (destX >= srcX && destX <= east && srcZ === destZ - srcSize && (collisionFlags & CollisionFlag.BLOCK_SOUTH) === CollisionFlag.OPEN) ||
                (srcX === destX - srcSize && srcZ <= destZ && north >= destZ && (collisionFlags & CollisionFlag.BLOCK_WEST) === CollisionFlag.OPEN) ||
                (srcX === destX + 1 && srcZ <= destZ && north >= destZ && (collisionFlags & CollisionFlag.BLOCK_EAST) === CollisionFlag.OPEN)
            );
        }

        return false;
    }

    private static reachWallDecor1(flags: CollisionEngine, y: number, srcX: number, srcZ: number, destX: number, destZ: number, shape: number, angle: number): boolean {
        const collisionFlags = flags.get(srcX, srcZ, y);
        if (shape === LocShape.WALLDECOR_DIAGONAL_OFFSET || shape === LocShape.WALLDECOR_DIAGONAL_NOOFFSET) {
            const rotation = ReachStrategy.alteredRotation(angle, shape);
            if (rotation === LocAngle.WEST) {
                return (srcX === destX + 1 && srcZ === destZ && (collisionFlags & CollisionFlag.WALL_WEST) === CollisionFlag.OPEN) || (srcX === destX && srcZ === destZ - 1 && (collisionFlags & CollisionFlag.WALL_NORTH) === CollisionFlag.OPEN);
            }
            if (rotation === LocAngle.NORTH) {
                return (srcX === destX - 1 && srcZ === destZ && (collisionFlags & CollisionFlag.WALL_EAST) === CollisionFlag.OPEN) || (srcX === destX && srcZ === destZ - 1 && (collisionFlags & CollisionFlag.WALL_NORTH) === CollisionFlag.OPEN);
            }
            if (rotation === LocAngle.EAST) {
                return (srcX === destX - 1 && srcZ === destZ && (collisionFlags & CollisionFlag.WALL_EAST) === CollisionFlag.OPEN) || (srcX === destX && srcZ === destZ + 1 && (collisionFlags & CollisionFlag.WALL_SOUTH) === CollisionFlag.OPEN);
            }
            return (srcX === destX + 1 && srcZ === destZ && (collisionFlags & CollisionFlag.WALL_WEST) === CollisionFlag.OPEN) || (srcX === destX && srcZ === destZ + 1 && (collisionFlags & CollisionFlag.WALL_SOUTH) === CollisionFlag.OPEN);
        }

        if (shape === LocShape.WALLDECOR_DIAGONAL_BOTH) {
            return (
                (srcX === destX && srcZ === destZ + 1 && (collisionFlags & CollisionFlag.WALL_SOUTH) === CollisionFlag.OPEN) ||
                (srcX === destX && srcZ === destZ - 1 && (collisionFlags & CollisionFlag.WALL_NORTH) === CollisionFlag.OPEN) ||
                (srcX === destX - 1 && srcZ === destZ && (collisionFlags & CollisionFlag.WALL_EAST) === CollisionFlag.OPEN) ||
                (srcX === destX + 1 && srcZ === destZ && (collisionFlags & CollisionFlag.WALL_WEST) === CollisionFlag.OPEN)
            );
        }

        return false;
    }

    private static reachWallDecorN(flags: CollisionEngine, y: number, srcX: number, srcZ: number, destX: number, destZ: number, srcSize: number, shape: number, angle: number): boolean {
        const collisionFlags = flags.get(srcX, srcZ, y);
        const east = srcX + srcSize - 1;
        const north = srcZ + srcSize - 1;

        if (shape === LocShape.WALLDECOR_DIAGONAL_OFFSET || shape === LocShape.WALLDECOR_DIAGONAL_NOOFFSET) {
            const rotation = ReachStrategy.alteredRotation(angle, shape);
            if (rotation === LocAngle.WEST) {
                return (
                    (srcX === destX + 1 && srcZ <= destZ && north >= destZ && (collisionFlags & CollisionFlag.WALL_WEST) === CollisionFlag.OPEN) ||
                    (srcX <= destX && srcZ === destZ - srcSize && east >= destX && (collisionFlags & CollisionFlag.WALL_NORTH) === CollisionFlag.OPEN)
                );
            }
            if (rotation === LocAngle.NORTH) {
                return (
                    (srcX === destX - srcSize && srcZ <= destZ && north >= destZ && (collisionFlags & CollisionFlag.WALL_EAST) === CollisionFlag.OPEN) ||
                    (srcX <= destX && srcZ === destZ - srcSize && east >= destX && (collisionFlags & CollisionFlag.WALL_NORTH) === CollisionFlag.OPEN)
                );
            }
            if (rotation === LocAngle.EAST) {
                return (
                    (srcX === destX - srcSize && srcZ <= destZ && north >= destZ && (collisionFlags & CollisionFlag.WALL_EAST) === CollisionFlag.OPEN) ||
                    (srcX <= destX && srcZ === destZ + 1 && east >= destX && (collisionFlags & CollisionFlag.WALL_SOUTH) === CollisionFlag.OPEN)
                );
            }
            return (
                (srcX === destX + 1 && srcZ <= destZ && north >= destZ && (collisionFlags & CollisionFlag.WALL_WEST) === CollisionFlag.OPEN) ||
                (srcX <= destX && srcZ === destZ + 1 && east >= destX && (collisionFlags & CollisionFlag.WALL_SOUTH) === CollisionFlag.OPEN)
            );
        }

        if (shape === LocShape.WALLDECOR_DIAGONAL_BOTH) {
            return (
                (srcX <= destX && srcZ === destZ + 1 && east >= destX && (collisionFlags & CollisionFlag.WALL_SOUTH) === CollisionFlag.OPEN) ||
                (srcX <= destX && srcZ === destZ - srcSize && east >= destX && (collisionFlags & CollisionFlag.WALL_NORTH) === CollisionFlag.OPEN) ||
                (srcX === destX - srcSize && srcZ <= destZ && north >= destZ && (collisionFlags & CollisionFlag.WALL_EAST) === CollisionFlag.OPEN) ||
                (srcX === destX + 1 && srcZ <= destZ && north >= destZ && (collisionFlags & CollisionFlag.WALL_WEST) === CollisionFlag.OPEN)
            );
        }

        return false;
    }
}
