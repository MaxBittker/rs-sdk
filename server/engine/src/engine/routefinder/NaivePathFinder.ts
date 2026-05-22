import CollisionEngine from '#/engine/routefinder/CollisionEngine.js';
import PackedCoord from '#/engine/routefinder/PackedCoord.js';
import { CollisionType } from '#/engine/routefinder/flags.js';
import { canTravel } from '#/engine/routefinder/StepValidator.js';

const DIRECTIONS = [
    [-1, 0],
    [1, 0],
    [0, 1],
    [0, -1]
] as const;

export function findNaivePath(
    flags: CollisionEngine,
    y: number,
    srcX: number,
    srcZ: number,
    destX: number,
    destZ: number,
    srcWidth: number,
    srcHeight: number,
    destWidth: number,
    destHeight: number,
    extraFlag: number,
    collision: CollisionType
): Uint32Array {
    if (intersects(srcX, srcZ, srcWidth, srcHeight, destX, destZ, destWidth, destHeight)) {
        return cardinalDestination(y, srcX, srcZ);
    }

    const dest = naiveDestination(y, srcX, srcZ, srcWidth, srcHeight, destX, destZ, 1, 1);
    const coord = PackedCoord.from(dest[0]);
    const dx = coord.x;
    const dz = coord.z;

    if (isDiagonal(dx, dz, srcWidth, srcHeight, destX, destZ, destWidth, destHeight)) {
        return dest;
    }

    if (intersects(dx, dz, srcWidth, srcHeight, destX, destZ, destWidth, destHeight)) {
        return dest;
    }

    let currX = dx;
    let currZ = dz;
    while (currX !== destX && currZ !== destZ) {
        const stepX = Math.sign(destX - currX);
        const stepZ = Math.sign(destZ - currZ);
        if (canTravel(flags, y, currX, currZ, stepX, stepZ, srcWidth, extraFlag, collision)) {
            currX += stepX;
            currZ += stepZ;
        } else if (stepX !== 0 && canTravel(flags, y, currX, currZ, stepX, 0, srcWidth, extraFlag, collision)) {
            currX += stepX;
        } else if (stepZ !== 0 && canTravel(flags, y, currX, currZ, 0, stepZ, srcWidth, extraFlag, collision)) {
            currZ += stepZ;
        } else {
            break;
        }
    }

    return new Uint32Array([new PackedCoord(y, currX, currZ).packed]);
}

function intersects(srcX: number, srcZ: number, srcWidth: number, srcHeight: number, destX: number, destZ: number, destWidth: number, destHeight: number): boolean {
    const srcHorizontal = srcX + srcWidth;
    const srcVertical = srcZ + srcHeight;
    const destHorizontal = destX + destWidth;
    const destVertical = destZ + destHeight;
    return !(destX >= srcHorizontal || destHorizontal <= srcX || destZ >= srcVertical || destVertical <= srcZ);
}

function isDiagonal(srcX: number, srcZ: number, srcWidth: number, srcHeight: number, destX: number, destZ: number, destWidth: number, destHeight: number): boolean {
    if (srcX + srcWidth === destX && srcZ + srcHeight === destZ) {
        return true;
    }
    if (srcX - 1 === destX + destWidth - 1 && srcZ - 1 === destZ + destHeight - 1) {
        return true;
    }
    if (srcX + srcWidth === destX && srcZ - 1 === destZ + destHeight - 1) {
        return true;
    }
    return srcX - 1 === destX + destWidth - 1 && srcZ + srcHeight === destZ;
}

function cardinalDestination(y: number, srcX: number, srcZ: number): Uint32Array {
    const direction = DIRECTIONS[(Math.random() * DIRECTIONS.length) | 0];
    return new Uint32Array([new PackedCoord(y, srcX + direction[0], srcZ + direction[1]).packed]);
}

function naiveDestination(y: number, srcX: number, srcZ: number, srcWidth: number, srcHeight: number, destX: number, destZ: number, destWidth: number, destHeight: number): Uint32Array {
    const diagonal = srcX - destX + (srcZ - destZ);
    const anti = srcX - destX - (srcZ - destZ);
    const southWestClockwise = anti < 0;
    const northWestClockwise = diagonal >= destHeight - 1 - (srcWidth - 1);
    const northEastClockwise = anti > srcWidth - srcHeight;
    const southEastClockwise = diagonal <= destWidth - 1 - (srcHeight - 1);

    if (southWestClockwise && !northWestClockwise) {
        let offZ = 0;
        if (diagonal >= -srcWidth) {
            offZ = coerceAtMost(diagonal + srcWidth, destHeight - 1);
        } else if (anti > -srcWidth) {
            offZ = -(srcWidth + anti);
        }
        return new Uint32Array([new PackedCoord(y, -srcWidth + destX, offZ + destZ).packed]);
    }

    if (northWestClockwise && !northEastClockwise) {
        let offX = 0;
        if (anti >= -destHeight) {
            offX = coerceAtMost(anti + destHeight, destWidth - 1);
        } else if (diagonal < destHeight) {
            offX = coerceAtLeast(diagonal - destHeight, -(srcWidth - 1));
        }
        return new Uint32Array([new PackedCoord(y, offX + destX, destHeight + destZ).packed]);
    }

    if (northEastClockwise && !southEastClockwise) {
        let offZ = 0;
        if (anti <= destWidth) {
            offZ = destHeight - anti;
        } else if (diagonal < destWidth) {
            offZ = coerceAtLeast(diagonal - destWidth, -(srcHeight - 1));
        }
        return new Uint32Array([new PackedCoord(y, destWidth + destX, offZ + destZ).packed]);
    }

    if (!(southEastClockwise && !southWestClockwise)) {
        return new Uint32Array();
    }

    let offX = 0;
    if (diagonal > -srcHeight) {
        offX = coerceAtMost(diagonal + srcHeight, destWidth - 1);
    } else if (anti < srcHeight) {
        offX = coerceAtLeast(anti - srcHeight, -(srcHeight - 1));
    }
    return new Uint32Array([new PackedCoord(y, offX + destX, -srcHeight + destZ).packed]);
}

function coerceAtMost(value: number, max: number): number {
    return value > max ? max : value;
}

function coerceAtLeast(value: number, min: number): number {
    return value < min ? min : value;
}
