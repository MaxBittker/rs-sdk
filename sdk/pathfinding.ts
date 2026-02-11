// Local pathfinding using bundled collision data
import * as rsmod from '../server/vendor/rsmod-pathfinder';
import { CollisionType, CollisionFlag } from '../server/vendor/rsmod-pathfinder';
import collisionData from './collision-data.json';

let initialized = false;

interface CollisionData {
    tiles: Array<[number, number, number, number]>;
    zones: Array<[number, number, number]>;
    doors?: Array<[number, number, number, number, number, number]>; // [level, x, z, shape, angle, blockrange]
}

export interface DoorInfo {
    level: number;
    x: number;
    z: number;
    shape: number;
    angle: number;
    blockrange: boolean;
}

// Spatial index of all known door positions, keyed by "level,x,z"
const doorIndex = new Map<string, DoorInfo>();

// Zones that have at least one collision tile — zones with zero collision data
// are likely open ocean/void and should not be treated as walkable land.
const populatedZones = new Set<string>();

// One-way doors that should NOT be unmasked in the door index.
// These doors can only be opened from one side; routing through them traps the bot.
const ONE_WAY_DOORS = new Set<string>([
    '0,3108,3353', // Draynor Manor front door (west tile) — only opens from outside
    '0,3109,3353', // Draynor Manor front door (east tile) — only opens from outside
]);

function doorKey(level: number, x: number, z: number): string {
    return `${level},${x},${z}`;
}

export function initPathfinding(): void {
    if (initialized) return;

    const data = collisionData as CollisionData;
    const start = Date.now();

    // Allocate all zones first (includes walkable areas with no collision tiles)
    for (const [level, zoneX, zoneZ] of data.zones) {
        rsmod.allocateIfAbsent(zoneX, zoneZ, level);
    }

    // Allocate mainland zones so the 2048x2048 BFS grid can traverse
    // open land between cities. Unallocated zones return NULL (blocked),
    // so without this the pathfinder can't cross gaps in the collision data.
    // Newly-allocated zones default to OPEN (walkable), which is correct
    // for grassland/roads. Zones already allocated above keep their flags.
    let mainlandZones = 0;
    for (let x = 2304; x <= 3392; x += 8) {
        for (let z = 2944; z <= 3584; z += 8) {
            if (!rsmod.isZoneAllocated(x, z, 0)) {
                rsmod.allocateIfAbsent(x, z, 0);
                mainlandZones++;
            }
        }
    }

    // Set collision flags for tiles that have them (includes wall flags)
    for (const [level, x, z, flags] of data.tiles) {
        rsmod.__set(x, z, level, flags);
        // Track which zones have at least one collision tile (likely land, not ocean)
        populatedZones.add(`${level},${x & ~7},${z & ~7}`);
    }

    // Remove wall collision at door/gate positions so the pathfinder
    // routes through doorways while still respecting permanent walls.
    // Uses rsmod.changeWall(add=false) — the same method the server uses
    // when doors are opened at runtime.
    let doorCount = 0;
    let skippedOneWay = 0;
    if (data.doors) {
        for (const [level, x, z, shape, angle, blockrange] of data.doors) {
            const key = doorKey(level, x, z);

            // Skip one-way doors — keep their wall collision so the pathfinder
            // won't route through them (entering traps the bot).
            if (ONE_WAY_DOORS.has(key)) {
                skippedOneWay++;
                continue;
            }

            rsmod.changeWall(x, z, level, angle, shape, !!blockrange, false, false);
            doorIndex.set(key, {
                level, x, z, shape, angle, blockrange: !!blockrange
            });
            doorCount++;
        }
    }

    initialized = true;
    console.log(`Pathfinding initialized in ${Date.now() - start}ms (${data.zones.length} zones + ${mainlandZones} mainland fill, ${data.tiles.length} tiles, ${doorCount} doors masked, ${skippedOneWay} one-way doors blocked)`);
}

// Check if a zone has collision data
export function isZoneAllocated(level: number, x: number, z: number): boolean {
    if (!initialized) {
        initPathfinding();
    }
    return rsmod.isZoneAllocated(x, z, level);
}

// Find path between two points
export function findPath(
    level: number,
    srcX: number,
    srcZ: number,
    destX: number,
    destZ: number
): Array<{ x: number; z: number; level: number }> {
    if (!initialized) {
        initPathfinding();
    }

    const waypointsRaw = rsmod.findPath(
        level, srcX, srcZ, destX, destZ,
        1, 1, 1, 0, -1, true, 0, 25, CollisionType.NORMAL
    );

    return unpackWaypoints(waypointsRaw);
}

// Find long-distance path (2048x2048 search grid, ±1024 tile reach)
export function findLongPath(
    level: number,
    srcX: number,
    srcZ: number,
    destX: number,
    destZ: number,
    maxWaypoints: number = 500
): Array<{ x: number; z: number; level: number }> {
    if (!initialized) {
        initPathfinding();
    }

    const waypointsRaw = rsmod.findLongPath(
        level, srcX, srcZ, destX, destZ,
        1, 1, 1, 0, -1, true, 0, maxWaypoints, CollisionType.NORMAL
    );

    return unpackWaypoints(waypointsRaw);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/** Check if a tile is walkable (no blocking flags). */
export function isTileWalkable(level: number, x: number, z: number): boolean {
    if (!initialized) initPathfinding();
    return !rsmod.isFlagged(x, z, level, CollisionFlag.WALK_BLOCKED);
}

/** Check if a tile has specific collision flags set. */
export function isFlagged(x: number, z: number, level: number, masks: number): boolean {
    if (!initialized) initPathfinding();
    return rsmod.isFlagged(x, z, level, masks);
}

/**
 * Check if the zone containing (x, z) has any collision tiles.
 * Zones with zero collision data are likely open ocean/void — real walkable
 * land always has some collision data (objects, walls, floor flags nearby).
 */
export function isZoneLikelyLand(level: number, x: number, z: number): boolean {
    return populatedZones.has(`${level},${x & ~7},${z & ~7}`);
}


// ═══════════════════════════════════════════════════════════════════════════════
//  DOOR PATH ANALYSIS — identify doors a computed path crosses through
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Given a list of waypoints, return the doors the path passes through or
 * steps adjacent to (wall collision is directional so the path may step
 * beside a door tile rather than onto it).  Results are in path order.
 */
export function findDoorsAlongPath(
    waypoints: Array<{ x: number; z: number; level: number }>
): DoorInfo[] {
    const doors: DoorInfo[] = [];
    const seen = new Set<string>();

    for (const wp of waypoints) {
        // Check the waypoint tile and its 4 cardinal neighbours
        const candidates = [
            doorKey(wp.level, wp.x, wp.z),
            doorKey(wp.level, wp.x, wp.z + 1),
            doorKey(wp.level, wp.x, wp.z - 1),
            doorKey(wp.level, wp.x + 1, wp.z),
            doorKey(wp.level, wp.x - 1, wp.z),
        ];
        for (const key of candidates) {
            if (!seen.has(key) && doorIndex.has(key)) {
                seen.add(key);
                doors.push(doorIndex.get(key)!);
            }
        }
    }

    return doors;
}

/** Look up a door at an exact position. */
export function getDoorAt(level: number, x: number, z: number): DoorInfo | undefined {
    return doorIndex.get(doorKey(level, x, z));
}

// Unpack waypoints from rsmod format
function unpackWaypoints(waypointsRaw: Uint32Array): Array<{ x: number; z: number; level: number }> {
    const waypoints: Array<{ x: number; z: number; level: number }> = [];
    for (let i = 0; i < waypointsRaw.length; i++) {
        const packed = waypointsRaw[i]!;
        waypoints.push({
            z: packed & 0x3FFF,
            x: (packed >> 14) & 0x3FFF,
            level: (packed >> 28) & 0x3
        });
    }
    return waypoints;
}
