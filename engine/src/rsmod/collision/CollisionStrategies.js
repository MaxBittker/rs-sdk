import CollisionFlag from '../flag/CollisionFlag.js';
import CollisionStrategy from './CollisionStrategy.js';

export class Normal extends CollisionStrategy {
    canMove(tileFlag, blockFlag) {
        return (tileFlag & blockFlag) === 0;
    }
}

export class Blocked extends CollisionStrategy {
    canMove(tileFlag, blockFlag) {
        let flag = blockFlag & ~CollisionFlag.FLOOR;
        return (tileFlag & flag) == 0 && (tileFlag & CollisionFlag.FLOOR) != 0;
    }
}

export class Indoors extends CollisionStrategy {
    canMove(tileFlag, blockFlag) {
        return (tileFlag & blockFlag) == 0 && (tileFlag & CollisionFlag.ROOF) != 0;
    }
}

export class Outdoors extends CollisionStrategy {
    canMove(tileFlag, blockFlag) {
        return (tileFlag & (blockFlag | CollisionFlag.ROOF)) == 0;
    }
}

export class LineOfSight extends CollisionStrategy {
    static BLOCK_MOVEMENT = CollisionFlag.WALL_NORTH_WEST |
        CollisionFlag.WALL_NORTH |
        CollisionFlag.WALL_NORTH_EAST |
        CollisionFlag.WALL_EAST |
        CollisionFlag.WALL_SOUTH_EAST |
        CollisionFlag.WALL_SOUTH |
        CollisionFlag.WALL_SOUTH_WEST |
        CollisionFlag.WALL_WEST |
        CollisionFlag.OBJECT;

    static BLOCK_ROUTE = CollisionFlag.WALL_NORTH_WEST_ROUTE_BLOCKER |
        CollisionFlag.WALL_NORTH_ROUTE_BLOCKER |
        CollisionFlag.WALL_NORTH_EAST_ROUTE_BLOCKER |
        CollisionFlag.WALL_EAST_ROUTE_BLOCKER |
        CollisionFlag.WALL_SOUTH_EAST_ROUTE_BLOCKER |
        CollisionFlag.WALL_SOUTH_ROUTE_BLOCKER |
        CollisionFlag.WALL_SOUTH_WEST_ROUTE_BLOCKER |
        CollisionFlag.WALL_WEST_ROUTE_BLOCKER |
        CollisionFlag.OBJECT_ROUTE_BLOCKER;

    canMove(tileFlag, blockFlag) {
        let movementFlags = (blockFlag & BLOCK_MOVEMENT) >> 9
        let routeFlags = (blockFlag & BLOCK_ROUTE) << 13
        let finalBlockFlag = movementFlags | routeFlags
        return (tileFlag & finalBlockFlag) == 0
    }
}
