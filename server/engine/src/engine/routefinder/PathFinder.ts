import { canMove } from '#/engine/routefinder/CollisionStrategy.js';
import CollisionEngine from '#/engine/routefinder/CollisionEngine.js';
import { CollisionFlag, CollisionType, DirectionFlag } from '#/engine/routefinder/flags.js';
import PackedCoord from '#/engine/routefinder/PackedCoord.js';
import ReachStrategy from '#/engine/routefinder/ReachStrategy.js';
import { rotate } from '#/engine/routefinder/Rotation.js';

export default class PathFinder {
    private static readonly DEFAULT_SEARCH_MAP_SIZE = 128;
    private static readonly DEFAULT_RING_BUFFER_SIZE = 4096;
    private static readonly DEFAULT_DISTANCE_VALUE = 99_999_999;
    private static readonly DEFAULT_SRC_DIRECTION_VALUE = 99;
    private static readonly MAX_ALTERNATIVE_ROUTE_LOWEST_COST = 1000;
    private static readonly MAX_ALTERNATIVE_ROUTE_SEEK_RANGE = 100;
    private static readonly MAX_ALTERNATIVE_ROUTE_DISTANCE_FROM_DESTINATION = 10;

    private readonly searchMapSize: number;
    private readonly ringBufferSize: number;
    private readonly searchHalfMapSize: number;
    private readonly directions: Int8Array;
    private readonly distances: Int32Array;
    private readonly validLocalX: Int32Array;
    private readonly validLocalZ: Int32Array;

    private currLocalX = 0;
    private currLocalZ = 0;
    private bufReaderIndex = 0;
    private bufWriterIndex = 0;

    constructor() {
        this.searchMapSize = PathFinder.DEFAULT_SEARCH_MAP_SIZE;
        this.ringBufferSize = PathFinder.DEFAULT_RING_BUFFER_SIZE;
        this.searchHalfMapSize = this.searchMapSize / 2;
        this.directions = new Int8Array(this.searchMapSize * this.searchMapSize);
        this.distances = new Int32Array(this.searchMapSize * this.searchMapSize);
        this.validLocalX = new Int32Array(this.ringBufferSize);
        this.validLocalZ = new Int32Array(this.ringBufferSize);
        this.distances.fill(PathFinder.DEFAULT_DISTANCE_VALUE);
    }

    findPath(
        flags: CollisionEngine,
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
        this.reset();

        const baseX = srcX - this.searchHalfMapSize;
        const baseZ = srcZ - this.searchHalfMapSize;
        const localSrcX = srcX - baseX;
        const localSrcZ = srcZ - baseZ;
        const localDestX = destX - baseX;
        const localDestZ = destZ - baseZ;

        this.appendDirection(localSrcX, localSrcZ, PathFinder.DEFAULT_SRC_DIRECTION_VALUE, 0);

        let pathFound: boolean;
        switch (srcSize) {
            case 1:
                pathFound = this.findPath1(flags, baseX, baseZ, y, localDestX, localDestZ, destWidth, destHeight, srcSize, angle, shape, blockAccessFlags, collision);
                break;
            case 2:
                pathFound = this.findPath2(flags, baseX, baseZ, y, localDestX, localDestZ, destWidth, destHeight, srcSize, angle, shape, blockAccessFlags, collision);
                break;
            default:
                pathFound = this.findPathN(flags, baseX, baseZ, y, localDestX, localDestZ, destWidth, destHeight, srcSize, angle, shape, blockAccessFlags, collision);
                break;
        }

        if (!pathFound) {
            if (!moveNear) {
                return new Uint32Array();
            }

            const foundApproachPoint = this.findClosestApproachPoint(localDestX, localDestZ, rotate(angle, destWidth, destHeight), rotate(angle, destHeight, destWidth));
            if (!foundApproachPoint) {
                return new Uint32Array();
            }
        }

        const limit = maxWaypoints;
        const waypoints: number[] = [];
        let next = this.directions[this.localIndex(this.currLocalX, this.currLocalZ)];
        let curr = -1;

        for (let index = 0; index < this.directions.length; index++) {
            if (this.currLocalX === localSrcX && this.currLocalZ === localSrcZ) {
                break;
            }

            if (curr !== next) {
                curr = next;
                if (waypoints.length >= limit) {
                    waypoints.pop();
                }
                waypoints.unshift(new PackedCoord(y, baseX + this.currLocalX, baseZ + this.currLocalZ).packed);
            }

            if ((curr & DirectionFlag.East) !== 0) {
                this.currLocalX += 1;
            } else if ((curr & DirectionFlag.West) !== 0) {
                this.currLocalX -= 1;
            }

            if ((curr & DirectionFlag.North) !== 0) {
                this.currLocalZ += 1;
            } else if ((curr & DirectionFlag.South) !== 0) {
                this.currLocalZ -= 1;
            }

            next = this.directions[this.localIndex(this.currLocalX, this.currLocalZ)];
        }

        return Uint32Array.from(waypoints);
    }

    private findPath1(
        flags: CollisionEngine,
        baseX: number,
        baseZ: number,
        y: number,
        localDestX: number,
        localDestZ: number,
        destWidth: number,
        destHeight: number,
        srcSize: number,
        angle: number,
        shape: number,
        blockAccessFlags: number,
        collision: CollisionType
    ): boolean {
        const relativeSearchSize = this.searchMapSize - 1;

        while (this.bufWriterIndex !== this.bufReaderIndex) {
            this.currLocalX = this.validLocalX[this.bufReaderIndex];
            this.currLocalZ = this.validLocalZ[this.bufReaderIndex];
            this.bufReaderIndex = (this.bufReaderIndex + 1) & (this.ringBufferSize - 1);

            if (ReachStrategy.reached(flags, y, this.currLocalX + baseX, this.currLocalZ + baseZ, localDestX + baseX, localDestZ + baseZ, destWidth, destHeight, srcSize, angle, shape, blockAccessFlags)) {
                return true;
            }

            const nextDistance = this.distances[this.localIndex(this.currLocalX, this.currLocalZ)] + 1;

            let x = this.currLocalX - 1;
            let z = this.currLocalZ;
            if (this.currLocalX > 0 && this.directions[this.localIndex(x, z)] === 0 && canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, z, y), CollisionFlag.BLOCK_WEST)) {
                this.appendDirection(x, z, DirectionFlag.East, nextDistance);
            }

            x = this.currLocalX + 1;
            z = this.currLocalZ;
            if (this.currLocalX < relativeSearchSize && this.directions[this.localIndex(x, z)] === 0 && canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, z, y), CollisionFlag.BLOCK_EAST)) {
                this.appendDirection(x, z, DirectionFlag.West, nextDistance);
            }

            x = this.currLocalX;
            z = this.currLocalZ - 1;
            if (this.currLocalZ > 0 && this.directions[this.localIndex(x, z)] === 0 && canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, z, y), CollisionFlag.BLOCK_SOUTH)) {
                this.appendDirection(x, z, DirectionFlag.North, nextDistance);
            }

            x = this.currLocalX;
            z = this.currLocalZ + 1;
            if (this.currLocalZ < relativeSearchSize && this.directions[this.localIndex(x, z)] === 0 && canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, z, y), CollisionFlag.BLOCK_NORTH)) {
                this.appendDirection(x, z, DirectionFlag.South, nextDistance);
            }

            x = this.currLocalX - 1;
            z = this.currLocalZ - 1;
            if (
                this.currLocalX > 0 &&
                this.currLocalZ > 0 &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, z, y), CollisionFlag.BLOCK_SOUTH_WEST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, this.currLocalZ, y), CollisionFlag.BLOCK_WEST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX, z, y), CollisionFlag.BLOCK_SOUTH)
            ) {
                this.appendDirection(x, z, DirectionFlag.NorthEast, nextDistance);
            }

            x = this.currLocalX + 1;
            z = this.currLocalZ - 1;
            if (
                this.currLocalX < relativeSearchSize &&
                this.currLocalZ > 0 &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, z, y), CollisionFlag.BLOCK_SOUTH_EAST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, this.currLocalZ, y), CollisionFlag.BLOCK_EAST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX, z, y), CollisionFlag.BLOCK_SOUTH)
            ) {
                this.appendDirection(x, z, DirectionFlag.NorthWest, nextDistance);
            }

            x = this.currLocalX - 1;
            z = this.currLocalZ + 1;
            if (
                this.currLocalX > 0 &&
                this.currLocalZ < relativeSearchSize &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, z, y), CollisionFlag.BLOCK_NORTH_WEST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, this.currLocalZ, y), CollisionFlag.BLOCK_WEST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX, z, y), CollisionFlag.BLOCK_NORTH)
            ) {
                this.appendDirection(x, z, DirectionFlag.SouthEast, nextDistance);
            }

            x = this.currLocalX + 1;
            z = this.currLocalZ + 1;
            if (
                this.currLocalX < relativeSearchSize &&
                this.currLocalZ < relativeSearchSize &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, z, y), CollisionFlag.BLOCK_NORTH_EAST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, this.currLocalZ, y), CollisionFlag.BLOCK_EAST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX, z, y), CollisionFlag.BLOCK_NORTH)
            ) {
                this.appendDirection(x, z, DirectionFlag.SouthWest, nextDistance);
            }
        }

        return false;
    }

    private findPath2(
        flags: CollisionEngine,
        baseX: number,
        baseZ: number,
        y: number,
        localDestX: number,
        localDestZ: number,
        destWidth: number,
        destHeight: number,
        srcSize: number,
        angle: number,
        shape: number,
        blockAccessFlags: number,
        collision: CollisionType
    ): boolean {
        const relativeSearchSize = this.searchMapSize - 2;

        while (this.bufWriterIndex !== this.bufReaderIndex) {
            this.currLocalX = this.validLocalX[this.bufReaderIndex];
            this.currLocalZ = this.validLocalZ[this.bufReaderIndex];
            this.bufReaderIndex = (this.bufReaderIndex + 1) & (this.ringBufferSize - 1);

            if (ReachStrategy.reached(flags, y, this.currLocalX + baseX, this.currLocalZ + baseZ, localDestX + baseX, localDestZ + baseZ, destWidth, destHeight, srcSize, angle, shape, blockAccessFlags)) {
                return true;
            }

            const nextDistance = this.distances[this.localIndex(this.currLocalX, this.currLocalZ)] + 1;

            let x = this.currLocalX - 1;
            let z = this.currLocalZ;
            if (
                this.currLocalX > 0 &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, z, y), CollisionFlag.BLOCK_SOUTH_WEST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, this.currLocalZ + 1, y), CollisionFlag.BLOCK_NORTH_WEST)
            ) {
                this.appendDirection(x, z, DirectionFlag.East, nextDistance);
            }

            x = this.currLocalX + 1;
            z = this.currLocalZ;
            if (
                this.currLocalX < relativeSearchSize &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + 2, z, y), CollisionFlag.BLOCK_SOUTH_EAST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + 2, this.currLocalZ + 1, y), CollisionFlag.BLOCK_NORTH_EAST)
            ) {
                this.appendDirection(x, z, DirectionFlag.West, nextDistance);
            }

            x = this.currLocalX;
            z = this.currLocalZ - 1;
            if (
                this.currLocalZ > 0 &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, z, y), CollisionFlag.BLOCK_SOUTH_WEST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + 1, z, y), CollisionFlag.BLOCK_SOUTH_EAST)
            ) {
                this.appendDirection(x, z, DirectionFlag.North, nextDistance);
            }

            x = this.currLocalX;
            z = this.currLocalZ + 1;
            if (
                this.currLocalZ < relativeSearchSize &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, this.currLocalZ + 2, y), CollisionFlag.BLOCK_NORTH_WEST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + 1, this.currLocalZ + 2, y), CollisionFlag.BLOCK_NORTH_EAST)
            ) {
                this.appendDirection(x, z, DirectionFlag.South, nextDistance);
            }

            x = this.currLocalX - 1;
            z = this.currLocalZ - 1;
            if (
                this.currLocalX > 0 &&
                this.currLocalZ > 0 &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, this.currLocalZ, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_EAST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, z, y), CollisionFlag.BLOCK_SOUTH_WEST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX, z, y), CollisionFlag.BLOCK_NORTH_EAST_AND_WEST)
            ) {
                this.appendDirection(x, z, DirectionFlag.NorthEast, nextDistance);
            }

            x = this.currLocalX + 1;
            z = this.currLocalZ - 1;
            if (
                this.currLocalX < relativeSearchSize &&
                this.currLocalZ > 0 &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, z, y), CollisionFlag.BLOCK_NORTH_EAST_AND_WEST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + 2, z, y), CollisionFlag.BLOCK_SOUTH_EAST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + 2, this.currLocalZ, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_WEST)
            ) {
                this.appendDirection(x, z, DirectionFlag.NorthWest, nextDistance);
            }

            x = this.currLocalX - 1;
            z = this.currLocalZ + 1;
            if (
                this.currLocalX > 0 &&
                this.currLocalZ < relativeSearchSize &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, z, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_EAST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, this.currLocalZ + 2, y), CollisionFlag.BLOCK_NORTH_WEST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX, this.currLocalZ + 2, y), CollisionFlag.BLOCK_SOUTH_EAST_AND_WEST)
            ) {
                this.appendDirection(x, z, DirectionFlag.SouthEast, nextDistance);
            }

            x = this.currLocalX + 1;
            z = this.currLocalZ + 1;
            if (
                this.currLocalX < relativeSearchSize &&
                this.currLocalZ < relativeSearchSize &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, this.currLocalZ + 2, y), CollisionFlag.BLOCK_SOUTH_EAST_AND_WEST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + 2, this.currLocalZ + 2, y), CollisionFlag.BLOCK_NORTH_EAST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + 2, z, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_WEST)
            ) {
                this.appendDirection(x, z, DirectionFlag.SouthWest, nextDistance);
            }
        }

        return false;
    }

    private findPathN(
        flags: CollisionEngine,
        baseX: number,
        baseZ: number,
        y: number,
        localDestX: number,
        localDestZ: number,
        destWidth: number,
        destHeight: number,
        srcSize: number,
        angle: number,
        shape: number,
        blockAccessFlags: number,
        collision: CollisionType
    ): boolean {
        const relativeSearchSize = this.searchMapSize - srcSize;

        while (this.bufWriterIndex !== this.bufReaderIndex) {
            this.currLocalX = this.validLocalX[this.bufReaderIndex];
            this.currLocalZ = this.validLocalZ[this.bufReaderIndex];
            this.bufReaderIndex = (this.bufReaderIndex + 1) & (this.ringBufferSize - 1);

            if (ReachStrategy.reached(flags, y, this.currLocalX + baseX, this.currLocalZ + baseZ, localDestX + baseX, localDestZ + baseZ, destWidth, destHeight, srcSize, angle, shape, blockAccessFlags)) {
                return true;
            }

            const nextDistance = this.distances[this.localIndex(this.currLocalX, this.currLocalZ)] + 1;

            let x = this.currLocalX - 1;
            let z = this.currLocalZ;
            if (
                this.currLocalX > 0 &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, z, y), CollisionFlag.BLOCK_SOUTH_WEST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, this.currLocalZ + srcSize - 1, y), CollisionFlag.BLOCK_NORTH_WEST)
            ) {
                let blocked = false;
                for (let index = 1; index < srcSize - 1; index++) {
                    if (!canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, this.currLocalZ + index, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_EAST)) {
                        blocked = true;
                        break;
                    }
                }
                if (!blocked) {
                    this.appendDirection(x, z, DirectionFlag.East, nextDistance);
                }
            }

            x = this.currLocalX + 1;
            z = this.currLocalZ;
            if (
                this.currLocalX < relativeSearchSize &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + srcSize, z, y), CollisionFlag.BLOCK_SOUTH_EAST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + srcSize, this.currLocalZ + srcSize - 1, y), CollisionFlag.BLOCK_NORTH_EAST)
            ) {
                let blocked = false;
                for (let index = 1; index < srcSize - 1; index++) {
                    if (!canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + srcSize, this.currLocalZ + index, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_WEST)) {
                        blocked = true;
                        break;
                    }
                }
                if (!blocked) {
                    this.appendDirection(x, z, DirectionFlag.West, nextDistance);
                }
            }

            x = this.currLocalX;
            z = this.currLocalZ - 1;
            if (
                this.currLocalZ > 0 &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, z, y), CollisionFlag.BLOCK_SOUTH_WEST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + srcSize - 1, z, y), CollisionFlag.BLOCK_SOUTH_EAST)
            ) {
                let blocked = false;
                for (let index = 1; index < srcSize - 1; index++) {
                    if (!canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + index, z, y), CollisionFlag.BLOCK_NORTH_EAST_AND_WEST)) {
                        blocked = true;
                        break;
                    }
                }
                if (!blocked) {
                    this.appendDirection(x, z, DirectionFlag.North, nextDistance);
                }
            }

            x = this.currLocalX;
            z = this.currLocalZ + 1;
            if (
                this.currLocalZ < relativeSearchSize &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, this.currLocalZ + srcSize, y), CollisionFlag.BLOCK_NORTH_WEST) &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + srcSize - 1, this.currLocalZ + srcSize, y), CollisionFlag.BLOCK_NORTH_EAST)
            ) {
                let blocked = false;
                for (let index = 1; index < srcSize - 1; index++) {
                    if (!canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x + index, this.currLocalZ + srcSize, y), CollisionFlag.BLOCK_SOUTH_EAST_AND_WEST)) {
                        blocked = true;
                        break;
                    }
                }
                if (!blocked) {
                    this.appendDirection(x, z, DirectionFlag.South, nextDistance);
                }
            }

            x = this.currLocalX - 1;
            z = this.currLocalZ - 1;
            if (this.currLocalX > 0 && this.currLocalZ > 0 && this.directions[this.localIndex(x, z)] === 0 && canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, z, y), CollisionFlag.BLOCK_SOUTH_WEST)) {
                let blocked = false;
                for (let index = 1; index < srcSize; index++) {
                    if (
                        !canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, this.currLocalZ + index - 1, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_EAST) ||
                        !canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + index - 1, z, y), CollisionFlag.BLOCK_NORTH_EAST_AND_WEST)
                    ) {
                        blocked = true;
                        break;
                    }
                }
                if (!blocked) {
                    this.appendDirection(x, z, DirectionFlag.NorthEast, nextDistance);
                }
            }

            x = this.currLocalX + 1;
            z = this.currLocalZ - 1;
            if (
                this.currLocalX < relativeSearchSize &&
                this.currLocalZ > 0 &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + srcSize, z, y), CollisionFlag.BLOCK_SOUTH_EAST)
            ) {
                let blocked = false;
                for (let index = 1; index < srcSize; index++) {
                    if (
                        !canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + srcSize, this.currLocalZ + index - 1, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_WEST) ||
                        !canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + index, z, y), CollisionFlag.BLOCK_NORTH_EAST_AND_WEST)
                    ) {
                        blocked = true;
                        break;
                    }
                }
                if (!blocked) {
                    this.appendDirection(x, z, DirectionFlag.NorthWest, nextDistance);
                }
            }

            x = this.currLocalX - 1;
            z = this.currLocalZ + 1;
            if (
                this.currLocalX > 0 &&
                this.currLocalZ < relativeSearchSize &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, this.currLocalZ + srcSize, y), CollisionFlag.BLOCK_NORTH_WEST)
            ) {
                let blocked = false;
                for (let index = 1; index < srcSize; index++) {
                    if (
                        !canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, x, this.currLocalZ + index, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_EAST) ||
                        !canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + index - 1, this.currLocalZ + srcSize, y), CollisionFlag.BLOCK_SOUTH_EAST_AND_WEST)
                    ) {
                        blocked = true;
                        break;
                    }
                }
                if (!blocked) {
                    this.appendDirection(x, z, DirectionFlag.SouthEast, nextDistance);
                }
            }

            x = this.currLocalX + 1;
            z = this.currLocalZ + 1;
            if (
                this.currLocalX < relativeSearchSize &&
                this.currLocalZ < relativeSearchSize &&
                this.directions[this.localIndex(x, z)] === 0 &&
                canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + srcSize, this.currLocalZ + srcSize, y), CollisionFlag.BLOCK_NORTH_EAST)
            ) {
                let blocked = false;
                for (let index = 1; index < srcSize; index++) {
                    if (
                        !canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + index, this.currLocalZ + srcSize, y), CollisionFlag.BLOCK_SOUTH_EAST_AND_WEST) ||
                        !canMove(collision, PathFinder.collisionFlag(flags, baseX, baseZ, this.currLocalX + srcSize, this.currLocalZ + index, y), CollisionFlag.BLOCK_NORTH_AND_SOUTH_WEST)
                    ) {
                        blocked = true;
                        break;
                    }
                }
                if (!blocked) {
                    this.appendDirection(x, z, DirectionFlag.SouthWest, nextDistance);
                }
            }
        }

        return false;
    }

    private findClosestApproachPoint(localDestX: number, localDestZ: number, width: number, height: number): boolean {
        let lowestCost = PathFinder.MAX_ALTERNATIVE_ROUTE_LOWEST_COST;
        let maxAlternativePath = PathFinder.MAX_ALTERNATIVE_ROUTE_SEEK_RANGE;
        const alternativeRouteRange = PathFinder.MAX_ALTERNATIVE_ROUTE_DISTANCE_FROM_DESTINATION;

        for (let x = localDestX - alternativeRouteRange; x <= localDestX + alternativeRouteRange; x++) {
            for (let z = localDestZ - alternativeRouteRange; z <= localDestZ + alternativeRouteRange; z++) {
                if (!(x >= 0 && x < this.searchMapSize) || !(z >= 0 && z < this.searchMapSize) || this.distances[this.localIndex(x, z)] >= PathFinder.MAX_ALTERNATIVE_ROUTE_SEEK_RANGE) {
                    continue;
                }

                let dx = 0;
                if (x < localDestX) {
                    dx = localDestX - x;
                } else if (x > localDestX + width - 1) {
                    dx = x - (width + localDestX - 1);
                }

                let dz = 0;
                if (z < localDestZ) {
                    dz = localDestZ - z;
                } else if (z > localDestZ + height - 1) {
                    dz = z - (height + localDestZ - 1);
                }

                const cost = dx * dx + dz * dz;
                if (cost < lowestCost || (cost === lowestCost && maxAlternativePath > this.distances[this.localIndex(x, z)])) {
                    this.currLocalX = x;
                    this.currLocalZ = z;
                    lowestCost = cost;
                    maxAlternativePath = this.distances[this.localIndex(x, z)];
                }
            }
        }

        return lowestCost !== PathFinder.MAX_ALTERNATIVE_ROUTE_LOWEST_COST;
    }

    private localIndex(x: number, z: number): number {
        return x * this.searchMapSize + z;
    }

    private static collisionFlag(flags: CollisionEngine, baseX: number, baseZ: number, localX: number, localZ: number, y: number): number {
        return flags.get(baseX + localX, baseZ + localZ, y);
    }

    private appendDirection(x: number, z: number, direction: number, distance: number): void {
        const index = this.localIndex(x, z);
        this.directions[index] = direction;
        this.distances[index] = distance;
        this.validLocalX[this.bufWriterIndex] = x;
        this.validLocalZ[this.bufWriterIndex] = z;
        this.bufWriterIndex = (this.bufWriterIndex + 1) & (this.ringBufferSize - 1);
    }

    private reset(): void {
        this.directions.fill(0);
        this.distances.fill(PathFinder.DEFAULT_DISTANCE_VALUE);
        this.bufReaderIndex = 0;
        this.bufWriterIndex = 0;
    }
}
