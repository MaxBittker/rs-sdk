export const CollisionFlag = {
    OPEN: 0x0,
    WALL_NORTH_WEST: 0x1,
    WALL_NORTH: 0x2,
    WALL_NORTH_EAST: 0x4,
    WALL_EAST: 0x8,
    WALL_SOUTH_EAST: 0x10,
    WALL_SOUTH: 0x20,
    WALL_SOUTH_WEST: 0x40,
    WALL_WEST: 0x80,
    LOC: 0x100,
    WALL_NORTH_WEST_PROJ_BLOCKER: 0x200,
    WALL_NORTH_PROJ_BLOCKER: 0x400,
    WALL_NORTH_EAST_PROJ_BLOCKER: 0x800,
    WALL_EAST_PROJ_BLOCKER: 0x1000,
    WALL_SOUTH_EAST_PROJ_BLOCKER: 0x2000,
    WALL_SOUTH_PROJ_BLOCKER: 0x4000,
    WALL_SOUTH_WEST_PROJ_BLOCKER: 0x8000,
    WALL_WEST_PROJ_BLOCKER: 0x10000,
    LOC_PROJ_BLOCKER: 0x20000,
    FLOOR_DECORATION: 0x40000,
    NPC_OCC: 0x80000,
    BLOCK_NPC_AND_PLAYERS: 0x100000,
    FLOOR: 0x200000,
    PLAYER_OCC: 0x400000,
    // bits 22-30 (0x400000-0x40000000) freed: the route-blocker subsystem was removed (it only ever
    // fed CollisionType.LINE_OF_SIGHT, was never written -- changeLocCollision hardcoded false -- and
    // is reclaimed for player-occupancy collision). Bit 22 (0x400000) is now available for PLAYER_OCC.
    ROOF: 0x80000000,
    FLOOR_BLOCKED: 0x240000,
    WALK_BLOCKED: 0x240100,
    BLOCK_WEST: 0x240108,
    BLOCK_EAST: 0x240180,
    BLOCK_SOUTH: 0x240102,
    BLOCK_NORTH: 0x240120,
    BLOCK_SOUTH_WEST: 0x24010e,
    BLOCK_SOUTH_EAST: 0x240183,
    BLOCK_NORTH_WEST: 0x240138,
    BLOCK_NORTH_EAST: 0x2401e0,
    BLOCK_NORTH_AND_SOUTH_EAST: 0x24013e,
    BLOCK_NORTH_AND_SOUTH_WEST: 0x2401e3,
    BLOCK_NORTH_EAST_AND_WEST: 0x24018f,
    BLOCK_SOUTH_EAST_AND_WEST: 0x2401f8,
    NULL: 0x7fffffff
} as const;

export const BlockAccessFlag = {
    BLOCK_NORTH: 0x1,
    BLOCK_EAST: 0x2,
    BLOCK_SOUTH: 0x4,
    BLOCK_WEST: 0x8
} as const;

export const DirectionFlag = {
    North: 0x1,
    East: 0x2,
    South: 0x4,
    West: 0x8,
    SouthWest: 0xc,
    NorthWest: 0x9,
    SouthEast: 0x6,
    NorthEast: 0x3
} as const;

export const CollisionType = {
    NORMAL: 0,
    BLOCKED: 1,
    INDOORS: 2,
    OUTDOORS: 3,
    LINE_OF_SIGHT: 4
} as const;

export const LocAngle = {
    WEST: 0,
    NORTH: 1,
    EAST: 2,
    SOUTH: 3
} as const;

export const LocLayer = {
    WALL: 0,
    WALL_DECOR: 1,
    GROUND: 2,
    GROUND_DECOR: 3
} as const;

export const LocShape = {
    WALL_STRAIGHT: 0,
    WALL_DIAGONAL_CORNER: 1,
    WALL_L: 2,
    WALL_SQUARE_CORNER: 3,
    WALLDECOR_STRAIGHT_NOOFFSET: 4,
    WALLDECOR_STRAIGHT_OFFSET: 5,
    WALLDECOR_DIAGONAL_OFFSET: 6,
    WALLDECOR_DIAGONAL_NOOFFSET: 7,
    WALLDECOR_DIAGONAL_BOTH: 8,
    WALL_DIAGONAL: 9,
    CENTREPIECE_STRAIGHT: 10,
    CENTREPIECE_DIAGONAL: 11,
    ROOF_STRAIGHT: 12,
    ROOF_DIAGONAL_WITH_ROOFEDGE: 13,
    ROOF_DIAGONAL: 14,
    ROOF_L_CONCAVE: 15,
    ROOF_L_CONVEX: 16,
    ROOF_FLAT: 17,
    ROOFEDGE_STRAIGHT: 18,
    ROOFEDGE_DIAGONAL_CORNER: 19,
    ROOFEDGE_L: 20,
    ROOFEDGE_SQUARE_CORNER: 21,
    GROUND_DECOR: 22
} as const;

export type CollisionType = (typeof CollisionType)[keyof typeof CollisionType];
export type CollisionFlag = (typeof CollisionFlag)[keyof typeof CollisionFlag];
export type BlockAccessFlag = (typeof BlockAccessFlag)[keyof typeof BlockAccessFlag];
export type LocAngle = (typeof LocAngle)[keyof typeof LocAngle];
export type LocLayer = (typeof LocLayer)[keyof typeof LocLayer];
export type LocShape = (typeof LocShape)[keyof typeof LocShape];

export function locShapeLayer(shape: number): LocLayer {
    switch (shape) {
        case LocShape.WALL_STRAIGHT:
        case LocShape.WALL_DIAGONAL_CORNER:
        case LocShape.WALL_L:
        case LocShape.WALL_SQUARE_CORNER:
            return LocLayer.WALL;
        case LocShape.WALLDECOR_STRAIGHT_NOOFFSET:
        case LocShape.WALLDECOR_STRAIGHT_OFFSET:
        case LocShape.WALLDECOR_DIAGONAL_OFFSET:
        case LocShape.WALLDECOR_DIAGONAL_NOOFFSET:
        case LocShape.WALLDECOR_DIAGONAL_BOTH:
            return LocLayer.WALL_DECOR;
        case LocShape.WALL_DIAGONAL:
        case LocShape.CENTREPIECE_STRAIGHT:
        case LocShape.CENTREPIECE_DIAGONAL:
        case LocShape.ROOF_STRAIGHT:
        case LocShape.ROOF_DIAGONAL_WITH_ROOFEDGE:
        case LocShape.ROOF_DIAGONAL:
        case LocShape.ROOF_L_CONCAVE:
        case LocShape.ROOF_L_CONVEX:
        case LocShape.ROOF_FLAT:
        case LocShape.ROOFEDGE_STRAIGHT:
        case LocShape.ROOFEDGE_DIAGONAL_CORNER:
        case LocShape.ROOFEDGE_L:
        case LocShape.ROOFEDGE_SQUARE_CORNER:
            return LocLayer.GROUND;
        case LocShape.GROUND_DECOR:
            return LocLayer.GROUND_DECOR;
        default:
            throw new Error(`Unknown loc shape ${shape}`);
    }
}
