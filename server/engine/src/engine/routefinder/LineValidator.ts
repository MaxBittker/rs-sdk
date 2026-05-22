import CollisionEngine from '#/engine/routefinder/CollisionEngine.js';
import { CollisionFlag } from '#/engine/routefinder/flags.js';
import Line from '#/engine/routefinder/Line.js';

export function hasLineOfSight(flags: CollisionEngine, y: number, srcX: number, srcZ: number, destX: number, destZ: number, srcWidth: number, srcHeight: number, destWidth: number, destHeight: number, extraFlag: number): boolean {
    return rayCastLine(
        flags,
        y,
        srcX,
        srcZ,
        destX,
        destZ,
        srcWidth,
        srcHeight,
        destWidth,
        destHeight,
        Line.SIGHT_BLOCKED_WEST | extraFlag,
        Line.SIGHT_BLOCKED_EAST | extraFlag,
        Line.SIGHT_BLOCKED_SOUTH | extraFlag,
        Line.SIGHT_BLOCKED_NORTH | extraFlag,
        CollisionFlag.LOC | extraFlag,
        CollisionFlag.LOC_PROJ_BLOCKER | extraFlag,
        true
    );
}

export function hasLineOfWalk(flags: CollisionEngine, y: number, srcX: number, srcZ: number, destX: number, destZ: number, srcWidth: number, srcHeight: number, destWidth: number, destHeight: number, extraFlag: number): boolean {
    return rayCastLine(
        flags,
        y,
        srcX,
        srcZ,
        destX,
        destZ,
        srcWidth,
        srcHeight,
        destWidth,
        destHeight,
        Line.WALK_BLOCKED_WEST | extraFlag,
        Line.WALK_BLOCKED_EAST | extraFlag,
        Line.WALK_BLOCKED_SOUTH | extraFlag,
        Line.WALK_BLOCKED_NORTH | extraFlag,
        CollisionFlag.LOC | extraFlag,
        CollisionFlag.LOC_PROJ_BLOCKER | extraFlag,
        false
    );
}

function rayCastLine(
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
    flagWest: number,
    flagEast: number,
    flagSouth: number,
    flagNorth: number,
    flagLoc: number,
    flagProj: number,
    los: boolean
): boolean {
    const startX = Line.coordinate(srcX, destX, srcWidth);
    const startZ = Line.coordinate(srcZ, destZ, srcHeight);
    const endX = Line.coordinate(destX, srcX, destWidth);
    const endZ = Line.coordinate(destZ, srcZ, destHeight);

    if (startX === endX && startZ === endZ) {
        return true;
    }

    if (los && flags.isFlagged(startX, startZ, y, flagLoc)) {
        return false;
    }

    const deltaX = endX - startX;
    const deltaZ = endZ - startZ;
    const absoluteDeltaX = Math.abs(deltaX);
    const absoluteDeltaZ = Math.abs(deltaZ);
    const travelEast = deltaX >= 0;
    const travelNorth = deltaZ >= 0;
    let xFlags = travelEast ? flagWest : flagEast;
    let zFlags = travelNorth ? flagSouth : flagNorth;

    if (absoluteDeltaX > absoluteDeltaZ) {
        const offsetX = travelEast ? 1 : -1;
        const offsetZ = travelNorth ? 0 : -1;
        let scaledZ = Line.scaleUp(startZ) + Line.HALF_TILE + offsetZ;
        const tangent = (Line.scaleUp(deltaZ) / absoluteDeltaX) | 0;
        let currX = startX;

        while (currX !== endX) {
            currX += offsetX;
            const currZ = Line.scaleDown(scaledZ);
            if (los && currX === endX && currZ === endZ) {
                xFlags &= ~flagProj;
            }
            if (flags.isFlagged(currX, currZ, y, xFlags)) {
                return false;
            }

            scaledZ += tangent;
            const nextZ = Line.scaleDown(scaledZ);
            if (los && currX === endX && nextZ === endZ) {
                zFlags &= ~flagProj;
            }
            if (nextZ !== currZ && flags.isFlagged(currX, nextZ, y, zFlags)) {
                return false;
            }
        }
    } else {
        const offsetX = travelEast ? 0 : -1;
        const offsetZ = travelNorth ? 1 : -1;
        let scaledX = Line.scaleUp(startX) + Line.HALF_TILE + offsetX;
        const tangent = (Line.scaleUp(deltaX) / absoluteDeltaZ) | 0;
        let currZ = startZ;

        while (currZ !== endZ) {
            currZ += offsetZ;
            const currX = Line.scaleDown(scaledX);
            if (los && currX === endX && currZ === endZ) {
                zFlags &= ~flagProj;
            }
            if (flags.isFlagged(currX, currZ, y, zFlags)) {
                return false;
            }

            scaledX += tangent;
            const nextX = Line.scaleDown(scaledX);
            if (los && nextX === endX && currZ === endZ) {
                xFlags &= ~flagProj;
            }
            if (nextX !== currX && flags.isFlagged(nextX, currZ, y, xFlags)) {
                return false;
            }
        }
    }

    return true;
}
