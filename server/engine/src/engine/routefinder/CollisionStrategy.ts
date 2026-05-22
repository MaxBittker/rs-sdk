import { CollisionFlag, CollisionType } from '#/engine/routefinder/flags.js';

const LINE_OF_SIGHT_MOVEMENT =
    CollisionFlag.WALL_NORTH_WEST |
    CollisionFlag.WALL_NORTH |
    CollisionFlag.WALL_NORTH_EAST |
    CollisionFlag.WALL_EAST |
    CollisionFlag.WALL_SOUTH_EAST |
    CollisionFlag.WALL_SOUTH |
    CollisionFlag.WALL_SOUTH_WEST |
    CollisionFlag.WALL_WEST |
    CollisionFlag.LOC;

const LINE_OF_SIGHT_ROUTE =
    CollisionFlag.WALL_NORTH_WEST_ROUTE_BLOCKER |
    CollisionFlag.WALL_NORTH_ROUTE_BLOCKER |
    CollisionFlag.WALL_NORTH_EAST_ROUTE_BLOCKER |
    CollisionFlag.WALL_EAST_ROUTE_BLOCKER |
    CollisionFlag.WALL_SOUTH_EAST_ROUTE_BLOCKER |
    CollisionFlag.WALL_SOUTH_ROUTE_BLOCKER |
    CollisionFlag.WALL_SOUTH_WEST_ROUTE_BLOCKER |
    CollisionFlag.WALL_WEST_ROUTE_BLOCKER |
    CollisionFlag.LOC_ROUTE_BLOCKER;

export function canMove(collision: CollisionType, tileFlag: number, blockFlag: number): boolean {
    switch (collision) {
        case CollisionType.NORMAL:
            return (tileFlag & blockFlag) === CollisionFlag.OPEN;
        case CollisionType.BLOCKED: {
            const flag = blockFlag & ~CollisionFlag.FLOOR;
            return (tileFlag & flag) === CollisionFlag.OPEN && (tileFlag & CollisionFlag.FLOOR) !== CollisionFlag.OPEN;
        }
        case CollisionType.INDOORS:
            return (tileFlag & blockFlag) === CollisionFlag.OPEN && (tileFlag & CollisionFlag.ROOF) !== CollisionFlag.OPEN;
        case CollisionType.OUTDOORS:
            return (tileFlag & (blockFlag | CollisionFlag.ROOF)) === CollisionFlag.OPEN;
        case CollisionType.LINE_OF_SIGHT: {
            const movementFlags = (blockFlag & LINE_OF_SIGHT_MOVEMENT) << 9;
            const routeFlags = (blockFlag & LINE_OF_SIGHT_ROUTE) >>> 13;
            return (tileFlag & (movementFlags | routeFlags)) === CollisionFlag.OPEN;
        }
        default:
            return false;
    }
}
