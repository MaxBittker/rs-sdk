import { CollisionFlag } from '#/engine/routefinder/flags.js';

export default class Line {
    static readonly SIGHT_BLOCKED_NORTH = CollisionFlag.LOC_PROJ_BLOCKER | CollisionFlag.WALL_NORTH_PROJ_BLOCKER;
    static readonly SIGHT_BLOCKED_EAST = CollisionFlag.LOC_PROJ_BLOCKER | CollisionFlag.WALL_EAST_PROJ_BLOCKER;
    static readonly SIGHT_BLOCKED_SOUTH = CollisionFlag.LOC_PROJ_BLOCKER | CollisionFlag.WALL_SOUTH_PROJ_BLOCKER;
    static readonly SIGHT_BLOCKED_WEST = CollisionFlag.LOC_PROJ_BLOCKER | CollisionFlag.WALL_WEST_PROJ_BLOCKER;

    static readonly WALK_BLOCKED_NORTH = CollisionFlag.WALL_NORTH | CollisionFlag.WALK_BLOCKED;
    static readonly WALK_BLOCKED_EAST = CollisionFlag.WALL_EAST | CollisionFlag.WALK_BLOCKED;
    static readonly WALK_BLOCKED_SOUTH = CollisionFlag.WALL_SOUTH | CollisionFlag.WALK_BLOCKED;
    static readonly WALK_BLOCKED_WEST = CollisionFlag.WALL_WEST | CollisionFlag.WALK_BLOCKED;

    static readonly HALF_TILE = (1 << 16) / 2;

    static scaleUp(tiles: number): number {
        return tiles << 16;
    }

    static scaleDown(tiles: number): number {
        return tiles >> 16;
    }

    static coordinate(a: number, b: number, size: number): number {
        if (a >= b) {
            return a;
        }
        if (a + size - 1 <= b) {
            return a + size - 1;
        }
        return b;
    }
}
