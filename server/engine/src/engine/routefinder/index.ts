import CollisionEngine from '#/engine/routefinder/CollisionEngine.js';
import { canTravel as canTravelStep } from '#/engine/routefinder/StepValidator.js';
import { findNaivePath as findNaivePathImpl } from '#/engine/routefinder/NaivePathFinder.js';
import { hasLineOfSight as hasLineOfSightImpl, hasLineOfWalk as hasLineOfWalkImpl } from '#/engine/routefinder/LineValidator.js';
import { lineOfSight as lineOfSightImpl, lineOfWalk as lineOfWalkImpl } from '#/engine/routefinder/LinePathFinder.js';
import PathFinder from '#/engine/routefinder/PathFinder.js';
import ReachStrategy from '#/engine/routefinder/ReachStrategy.js';
import { CollisionFlag, CollisionType, LocAngle, LocLayer, LocShape, locShapeLayer } from '#/engine/routefinder/flags.js';

export { CollisionFlag, CollisionType, LocAngle, LocLayer, LocShape, locShapeLayer };

export class RouteFinder {
    readonly collisionFlags = new CollisionEngine();
    readonly pathfinder = new PathFinder();

    findPath(
        y: number,
        srcX: number,
        srcZ: number,
        destX: number,
        destZ: number,
        srcSize: number,
        destWidth: number,
        destHeight: number,
        angle: number,
        shape: number,
        moveNear: boolean,
        blockAccessFlags: number,
        maxWaypoints: number,
        collision: CollisionType
    ): Uint32Array {
        return this.pathfinder.findPath(this.collisionFlags, y, srcX, srcZ, destX, destZ, srcSize, destWidth, destHeight, angle, shape, moveNear, blockAccessFlags, maxWaypoints, collision);
    }

    findNaivePath(y: number, srcX: number, srcZ: number, destX: number, destZ: number, srcWidth: number, srcHeight: number, destWidth: number, destHeight: number, extraFlag: number, collision: CollisionType): Uint32Array {
        return findNaivePathImpl(this.collisionFlags, y, srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight, extraFlag, collision);
    }

    changeFloor(x: number, z: number, y: number, add: boolean): void {
        this.collisionFlags.changeFloor(x, z, y, add);
    }

    changeLoc(x: number, z: number, y: number, width: number, length: number, blockrange: boolean, breakroutefinding: boolean, add: boolean): void {
        this.collisionFlags.changeLoc(x, z, y, width, length, blockrange, breakroutefinding, add);
    }

    changeNpc(x: number, z: number, y: number, size: number, add: boolean): void {
        this.collisionFlags.changeNpc(x, z, y, size, add);
    }

    changePlayer(x: number, z: number, y: number, size: number, add: boolean): void {
        this.collisionFlags.changePlayer(x, z, y, size, add);
    }

    changeRoof(x: number, z: number, y: number, add: boolean): void {
        this.collisionFlags.changeRoof(x, z, y, add);
    }

    changeWall(x: number, z: number, y: number, angle: number, shape: number, blockrange: boolean, breakroutefinding: boolean, add: boolean): void {
        this.collisionFlags.changeWall(x, z, y, angle, shape, blockrange, breakroutefinding, add);
    }

    allocateIfAbsent(x: number, z: number, y: number): void {
        this.collisionFlags.allocateIfAbsent(x, z, y);
    }

    deallocateIfPresent(x: number, z: number, y: number): void {
        this.collisionFlags.deallocateIfPresent(x, z, y);
    }

    isZoneAllocated(x: number, z: number, y: number): boolean {
        return this.collisionFlags.isZoneAllocated(x, z, y);
    }

    isFlagged(x: number, z: number, y: number, masks: number): boolean {
        return this.collisionFlags.isFlagged(x, z, y, masks);
    }

    canTravel(y: number, x: number, z: number, offsetX: number, offsetZ: number, size: number, extraFlag: number, collision: CollisionType): boolean {
        return canTravelStep(this.collisionFlags, y, x, z, offsetX, offsetZ, size, extraFlag, collision);
    }

    hasLineOfSight(y: number, srcX: number, srcZ: number, destX: number, destZ: number, srcWidth: number, srcHeight: number, destWidth: number, destHeight: number, extraFlag: number): boolean {
        return hasLineOfSightImpl(this.collisionFlags, y, srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight, extraFlag);
    }

    hasLineOfWalk(y: number, srcX: number, srcZ: number, destX: number, destZ: number, srcWidth: number, srcHeight: number, destWidth: number, destHeight: number, extraFlag: number): boolean {
        return hasLineOfWalkImpl(this.collisionFlags, y, srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight, extraFlag);
    }

    lineOfSight(y: number, srcX: number, srcZ: number, destX: number, destZ: number, srcWidth: number, srcHeight: number, destWidth: number, destHeight: number, extraFlag: number): Uint32Array {
        return lineOfSightImpl(this.collisionFlags, y, srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight, extraFlag);
    }

    lineOfWalk(y: number, srcX: number, srcZ: number, destX: number, destZ: number, srcWidth: number, srcHeight: number, destWidth: number, destHeight: number, extraFlag: number): Uint32Array {
        return lineOfWalkImpl(this.collisionFlags, y, srcX, srcZ, destX, destZ, srcWidth, srcHeight, destWidth, destHeight, extraFlag);
    }

    reached(y: number, srcX: number, srcZ: number, destX: number, destZ: number, destWidth: number, destHeight: number, srcSize: number, angle: number, shape: number, blockAccessFlags: number): boolean {
        return ReachStrategy.reached(this.collisionFlags, y, srcX, srcZ, destX, destZ, destWidth, destHeight, srcSize, angle, shape, blockAccessFlags);
    }

    locShapeLayer(shape: number): LocLayer {
        return locShapeLayer(shape);
    }

    __set(x: number, z: number, y: number, mask: number): void {
        this.collisionFlags.set(x, z, y, mask);
    }
}

const routefinder = new RouteFinder();

export default routefinder;

export const findPath = routefinder.findPath.bind(routefinder);
export const findNaivePath = routefinder.findNaivePath.bind(routefinder);
export const changeFloor = routefinder.changeFloor.bind(routefinder);
export const changeLoc = routefinder.changeLoc.bind(routefinder);
export const changeNpc = routefinder.changeNpc.bind(routefinder);
export const changePlayer = routefinder.changePlayer.bind(routefinder);
export const changeRoof = routefinder.changeRoof.bind(routefinder);
export const changeWall = routefinder.changeWall.bind(routefinder);
export const allocateIfAbsent = routefinder.allocateIfAbsent.bind(routefinder);
export const deallocateIfPresent = routefinder.deallocateIfPresent.bind(routefinder);
export const isZoneAllocated = routefinder.isZoneAllocated.bind(routefinder);
export const isFlagged = routefinder.isFlagged.bind(routefinder);
export const canTravel = routefinder.canTravel.bind(routefinder);
export const hasLineOfSight = routefinder.hasLineOfSight.bind(routefinder);
export const hasLineOfWalk = routefinder.hasLineOfWalk.bind(routefinder);
export const lineOfSight = routefinder.lineOfSight.bind(routefinder);
export const lineOfWalk = routefinder.lineOfWalk.bind(routefinder);
export const reached = routefinder.reached.bind(routefinder);
export const __set = routefinder.__set.bind(routefinder);
