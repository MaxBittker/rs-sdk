export default class CollisionFlag {
    static WALL_NORTH_WEST = 0x1;
    static WALL_NORTH = 0x2;
    static WALL_NORTH_EAST = 0x4;
    static WALL_EAST = 0x8;
    static WALL_SOUTH_EAST = 0x10;
    static WALL_SOUTH = 0x20;
    static WALL_SOUTH_WEST = 0x40;
    static WALL_WEST = 0x80;
    static OBJECT = 0x100;
    static WALL_NORTH_WEST_PROJECTILE_BLOCKER = 0x200;
    static WALL_NORTH_PROJECTILE_BLOCKER = 0x400;
    static WALL_NORTH_EAST_PROJECTILE_BLOCKER = 0x800;
    static WALL_EAST_PROJECTILE_BLOCKER = 0x1000;
    static WALL_SOUTH_EAST_PROJECTILE_BLOCKER = 0x2000;
    static WALL_SOUTH_PROJECTILE_BLOCKER = 0x4000;
    static WALL_SOUTH_WEST_PROJECTILE_BLOCKER = 0x8000;
    static WALL_WEST_PROJECTILE_BLOCKER = 0x10000;
    static OBJECT_PROJECTILE_BLOCKER = 0x20000;
    static FLOOR_DECORATION = 0x40000;

    /**
     * Custom flag dedicated to blocking NPCs.
     * It should be noted that this is a custom flag, and you do not need to use this.
     * The pathfinder takes the flag as a custom option, so you may use any other flag, this just defines
     * a reliable constant to use
     */
    static BLOCK_NPCS = 0x80000;

    /**
     * Custom flag dedicated to blocking players, projectiles as well as NPCs.
     * An example of a monster to set this flag is Brawler. Note that it is unclear if this flag
     * prevents NPCs, as there is a separate flag option for it.
     * This flag is similar to the one above, except it's strictly for NPCs.
     */
    static BLOCK_PLAYERS = 0x100000;

    static FLOOR = 0x200000;
    static WALL_NORTH_WEST_ROUTE_BLOCKER = 0x400000;
    static WALL_NORTH_ROUTE_BLOCKER = 0x800000;
    static WALL_NORTH_EAST_ROUTE_BLOCKER = 0x1000000;
    static WALL_EAST_ROUTE_BLOCKER = 0x2000000;
    static WALL_SOUTH_EAST_ROUTE_BLOCKER = 0x4000000;
    static WALL_SOUTH_ROUTE_BLOCKER = 0x8000000;
    static WALL_SOUTH_WEST_ROUTE_BLOCKER = 0x10000000;
    static WALL_WEST_ROUTE_BLOCKER = 0x20000000;
    static OBJECT_ROUTE_BLOCKER = 0x40000000;

    /**
     * Roof flag, used to bind NPCs to not leave the buildings they spawn in. This is a custom flag.
     */
    static ROOF = 0x80000000;

    /* A shorthand combination of both the floor flags. */
    static FLOOR_BLOCKED = CollisionFlag.FLOOR | CollisionFlag.FLOOR_DECORATION;

    /* Mixed masks of the above flags */
    static BLOCK_WEST = CollisionFlag.WALL_EAST |
        CollisionFlag.OBJECT |
        CollisionFlag.FLOOR_BLOCKED;

    static BLOCK_EAST = CollisionFlag.WALL_WEST |
        CollisionFlag.OBJECT |
        CollisionFlag.FLOOR_BLOCKED;

    static BLOCK_SOUTH = CollisionFlag.WALL_NORTH |
        CollisionFlag.OBJECT |
        CollisionFlag.FLOOR_BLOCKED;

    static BLOCK_NORTH = CollisionFlag.WALL_SOUTH |
        CollisionFlag.OBJECT |
        CollisionFlag.FLOOR_BLOCKED;

    static BLOCK_SOUTH_WEST = CollisionFlag.WALL_NORTH |
        CollisionFlag.WALL_NORTH_EAST |
        CollisionFlag.WALL_EAST |
        CollisionFlag.OBJECT |
        CollisionFlag.FLOOR_BLOCKED;

    static BLOCK_SOUTH_EAST = CollisionFlag.WALL_NORTH_WEST |
        CollisionFlag.WALL_NORTH |
        CollisionFlag.WALL_WEST |
        CollisionFlag.OBJECT |
        CollisionFlag.FLOOR_BLOCKED;

    static BLOCK_NORTH_WEST = CollisionFlag.WALL_EAST |
        CollisionFlag.WALL_SOUTH_EAST |
        CollisionFlag.WALL_SOUTH |
        CollisionFlag.OBJECT |
        CollisionFlag.FLOOR_BLOCKED;

    static BLOCK_NORTH_EAST = CollisionFlag.WALL_SOUTH |
        CollisionFlag.WALL_SOUTH_WEST |
        CollisionFlag.WALL_WEST |
        CollisionFlag.OBJECT |
        CollisionFlag.FLOOR_BLOCKED;

    static BLOCK_NORTH_AND_SOUTH_EAST = CollisionFlag.WALL_NORTH |
        CollisionFlag.WALL_NORTH_EAST |
        CollisionFlag.WALL_EAST |
        CollisionFlag.WALL_SOUTH_EAST |
        CollisionFlag.WALL_SOUTH |
        CollisionFlag.OBJECT |
        CollisionFlag.FLOOR_BLOCKED;

    static BLOCK_NORTH_AND_SOUTH_WEST = CollisionFlag.WALL_NORTH_WEST |
        CollisionFlag.WALL_NORTH |
        CollisionFlag.WALL_SOUTH |
        CollisionFlag.WALL_SOUTH_WEST |
        CollisionFlag.WALL_WEST |
        CollisionFlag.OBJECT |
        CollisionFlag.FLOOR_BLOCKED;

    static BLOCK_NORTH_EAST_AND_WEST = CollisionFlag.WALL_NORTH_WEST |
        CollisionFlag.WALL_NORTH |
        CollisionFlag.WALL_NORTH_EAST |
        CollisionFlag.WALL_EAST |
        CollisionFlag.WALL_WEST |
        CollisionFlag.OBJECT |
        CollisionFlag.FLOOR_BLOCKED;

    static BLOCK_SOUTH_EAST_AND_WEST = CollisionFlag.WALL_EAST |
        CollisionFlag.WALL_SOUTH_EAST |
        CollisionFlag.WALL_SOUTH |
        CollisionFlag.WALL_SOUTH_WEST |
        CollisionFlag.WALL_WEST |
        CollisionFlag.OBJECT |
        CollisionFlag.FLOOR_BLOCKED;

    /* Route blocker flags. These are used in ~550+ clients to generate paths through bankers and such. */
    static BLOCK_WEST_ROUTE_BLOCKER = CollisionFlag.WALL_EAST_ROUTE_BLOCKER |
        CollisionFlag.OBJECT_ROUTE_BLOCKER |
        CollisionFlag.FLOOR_BLOCKED;
    static BLOCK_EAST_ROUTE_BLOCKER = CollisionFlag.WALL_WEST_ROUTE_BLOCKER |
        CollisionFlag.OBJECT_ROUTE_BLOCKER |
        CollisionFlag.FLOOR_BLOCKED;
    static BLOCK_SOUTH_ROUTE_BLOCKER = CollisionFlag.WALL_NORTH_ROUTE_BLOCKER |
        CollisionFlag.OBJECT_ROUTE_BLOCKER |
        CollisionFlag.FLOOR_BLOCKED;
    static BLOCK_NORTH_ROUTE_BLOCKER = CollisionFlag.WALL_SOUTH_ROUTE_BLOCKER |
        CollisionFlag.OBJECT_ROUTE_BLOCKER |
        CollisionFlag.FLOOR_BLOCKED;
    static BLOCK_SOUTH_WEST_ROUTE_BLOCKER = CollisionFlag.WALL_NORTH_ROUTE_BLOCKER |
        CollisionFlag.WALL_NORTH_EAST_ROUTE_BLOCKER |
        CollisionFlag.WALL_EAST_ROUTE_BLOCKER |
        CollisionFlag.OBJECT_ROUTE_BLOCKER |
        CollisionFlag.FLOOR_BLOCKED;
    static BLOCK_SOUTH_EAST_ROUTE_BLOCKER = CollisionFlag.WALL_NORTH_WEST_ROUTE_BLOCKER |
        CollisionFlag.WALL_NORTH_ROUTE_BLOCKER |
        CollisionFlag.WALL_WEST_ROUTE_BLOCKER |
        CollisionFlag.OBJECT_ROUTE_BLOCKER |
        CollisionFlag.FLOOR_BLOCKED;
    static BLOCK_NORTH_WEST_ROUTE_BLOCKER = CollisionFlag.WALL_EAST_ROUTE_BLOCKER |
        CollisionFlag.WALL_SOUTH_EAST_ROUTE_BLOCKER |
        CollisionFlag.WALL_SOUTH_ROUTE_BLOCKER |
        CollisionFlag.OBJECT_ROUTE_BLOCKER |
        CollisionFlag.FLOOR_BLOCKED;
    static BLOCK_NORTH_EAST_ROUTE_BLOCKER = CollisionFlag.WALL_SOUTH_ROUTE_BLOCKER |
        CollisionFlag.WALL_SOUTH_WEST_ROUTE_BLOCKER |
        CollisionFlag.WALL_WEST_ROUTE_BLOCKER |
        CollisionFlag.OBJECT_ROUTE_BLOCKER |
        CollisionFlag.FLOOR_BLOCKED;
    static BLOCK_NORTH_AND_SOUTH_EAST_ROUTE_BLOCKER = CollisionFlag.WALL_NORTH_ROUTE_BLOCKER |
        CollisionFlag.WALL_NORTH_EAST_ROUTE_BLOCKER |
        CollisionFlag.WALL_EAST_ROUTE_BLOCKER |
        CollisionFlag.WALL_SOUTH_EAST_ROUTE_BLOCKER |
        CollisionFlag.WALL_SOUTH_ROUTE_BLOCKER |
        CollisionFlag.OBJECT_ROUTE_BLOCKER |
        CollisionFlag.FLOOR_BLOCKED;
    static BLOCK_NORTH_AND_SOUTH_WEST_ROUTE_BLOCKER = CollisionFlag.WALL_NORTH_WEST_ROUTE_BLOCKER |
        CollisionFlag.WALL_NORTH_ROUTE_BLOCKER |
        CollisionFlag.WALL_SOUTH_ROUTE_BLOCKER |
        CollisionFlag.WALL_SOUTH_WEST_ROUTE_BLOCKER |
        CollisionFlag.WALL_WEST_ROUTE_BLOCKER |
        CollisionFlag.OBJECT_ROUTE_BLOCKER |
        CollisionFlag.FLOOR_BLOCKED;
    static BLOCK_NORTH_EAST_AND_WEST_ROUTE_BLOCKER = CollisionFlag.WALL_NORTH_WEST_ROUTE_BLOCKER |
        CollisionFlag.WALL_NORTH_ROUTE_BLOCKER |
        CollisionFlag.WALL_NORTH_EAST_ROUTE_BLOCKER |
        CollisionFlag.WALL_EAST_ROUTE_BLOCKER |
        CollisionFlag.WALL_WEST_ROUTE_BLOCKER |
        CollisionFlag.OBJECT_ROUTE_BLOCKER |
        CollisionFlag.FLOOR_BLOCKED;
    static BLOCK_SOUTH_EAST_AND_WEST_ROUTE_BLOCKER = CollisionFlag.WALL_EAST_ROUTE_BLOCKER |
        CollisionFlag.WALL_SOUTH_EAST_ROUTE_BLOCKER |
        CollisionFlag.WALL_SOUTH_ROUTE_BLOCKER |
        CollisionFlag.WALL_SOUTH_WEST_ROUTE_BLOCKER |
        CollisionFlag.WALL_WEST_ROUTE_BLOCKER |
        CollisionFlag.OBJECT_ROUTE_BLOCKER |
        CollisionFlag.FLOOR_BLOCKED;
};
