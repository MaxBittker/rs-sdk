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

// One-way doors that should NOT be masked or included in the door index.
// These doors can only be opened from one side; routing through them traps the bot.
const ONE_WAY_DOORS = new Set<string>([
    '0,3108,3353', // Draynor Manor front door (west tile) — only opens from outside
    '0,3109,3353', // Draynor Manor front door (east tile) — only opens from outside
]);

// ── Draynor Manor directional door handling ──
// The front door at (3108-3109, 3353) can only be opened from one side.
// If the bot is inside the manor it must exit via the east wing escape doors.
const DRAYNOR_MANOR = {
    // Interior bounding box (level 0) — covers the main building and courtyard.
    // Everything within the manor walls past the front door is trapped.
    minX: 3097, maxX: 3119,
    minZ: 3354, maxZ: 3374,
    // Front door position (two tiles wide)
    frontDoor: [{ x: 3108, z: 3353 }, { x: 3109, z: 3353 }],
    // East wing escape route: walk here to get out
    escapeExit: { x: 3125, z: 3370 },
};

function doorKey(level: number, x: number, z: number): string {
    return `${level},${x},${z}`;
}

/** Check if a position is inside Draynor Manor's ground floor interior. */
export function isInsideDraynorManor(x: number, z: number, level: number = 0): boolean {
    if (level !== 0) return false;
    return x >= DRAYNOR_MANOR.minX && x <= DRAYNOR_MANOR.maxX &&
           z >= DRAYNOR_MANOR.minZ && z <= DRAYNOR_MANOR.maxZ;
}

/** Get the Draynor Manor escape exit coordinates (outside the manor, east courtyard). */
export function getDraynorManorEscape(): { x: number; z: number } {
    return { ...DRAYNOR_MANOR.escapeExit };
}

export function initPathfinding(): void {
    if (initialized) return;

    const data = collisionData as CollisionData;
    const start = Date.now();

    // Allocate all zones first (includes walkable areas with no collision tiles)
    for (const [level, zoneX, zoneZ] of data.zones) {
        rsmod.allocateIfAbsent(zoneX, zoneZ, level);
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
    console.log(`Pathfinding initialized in ${Date.now() - start}ms (${data.zones.length} zones, ${data.tiles.length} tiles, ${doorCount} doors masked, ${skippedOneWay} one-way doors blocked)`);
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

// Find long-distance path (512x512 search grid)
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
//  MULTI-SEGMENT ROUTING — breaks long distances into pathfinder-sized chunks
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

/** Maximum single-segment distance (conservative; 512/2=256 grid half, minus routing headroom). */
const MAX_SINGLE_SEGMENT = 200;

/**
 * Find the nearest walkable tile to (x, z) by spiraling outward.
 * Returns null if no walkable tile found within maxRadius.
 */
function snapToWalkable(
    level: number, x: number, z: number, maxRadius: number = 30
): { x: number; z: number } | null {
    if (!initialized) initPathfinding();
    if (isTileWalkable(level, x, z) && isZoneAllocated(level, x, z) && isZoneLikelyLand(level, x, z)) {
        return { x, z };
    }
    for (let r = 1; r <= maxRadius; r++) {
        for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
                if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue; // perimeter only
                const tx = x + dx;
                const tz = z + dz;
                if (isTileWalkable(level, tx, tz) && isZoneAllocated(level, tx, tz) && isZoneLikelyLand(level, tx, tz)) {
                    return { x: tx, z: tz };
                }
            }
        }
    }
    return null;
}

/**
 * Find a path between two points that may be farther apart than the 512x512
 * pathfinder grid allows.  Recursively bisects the route into segments that
 * each fit within findLongPath's range, then concatenates the results.
 *
 * When a direct split fails (e.g. coastline blocks the midpoint), offset
 * candidates perpendicular to the travel axis are tried so the route can
 * swing around geographic obstacles.
 */
export function findMultiSegmentPath(
    level: number,
    srcX: number, srcZ: number,
    destX: number, destZ: number,
    maxWaypoints: number = 500,
    _depth: number = 0
): Array<{ x: number; z: number; level: number }> {
    if (!initialized) initPathfinding();

    const dx = Math.abs(destX - srcX);
    const dz = Math.abs(destZ - srcZ);

    // Base case: within single pathfinder range
    if (dx <= MAX_SINGLE_SEGMENT && dz <= MAX_SINGLE_SEGMENT) {
        return findLongPath(level, srcX, srcZ, destX, destZ, maxWaypoints);
    }

    // Guard against excessive recursion
    if (_depth > 6) {
        return findLongPath(level, srcX, srcZ, destX, destZ, maxWaypoints);
    }

    // Build candidate split points: midpoint + 1/3 + 2/3 along the line,
    // plus perpendicular offsets at each to route around coastline/mountains.
    const midX = Math.round((srcX + destX) / 2);
    const midZ = Math.round((srcZ + destZ) / 2);
    const thirdX = Math.round(srcX + (destX - srcX) / 3);
    const thirdZ = Math.round(srcZ + (destZ - srcZ) / 3);
    const twoThirdX = Math.round(srcX + 2 * (destX - srcX) / 3);
    const twoThirdZ = Math.round(srcZ + 2 * (destZ - srcZ) / 3);

    // Perpendicular offset: rotate the travel vector 90 degrees
    const travelDx = destX - srcX;
    const travelDz = destZ - srcZ;
    const travelLen = Math.sqrt(travelDx * travelDx + travelDz * travelDz);
    // Perpendicular unit vector (rotated 90 degrees)
    const perpX = -travelDz / travelLen;
    const perpZ = travelDx / travelLen;

    const splitPoints: Array<{ x: number; z: number }> = [
        // Direct line candidates
        { x: midX, z: midZ },
        { x: thirdX, z: thirdZ },
        { x: twoThirdX, z: twoThirdZ },
    ];

    // Perpendicular offsets at increasing distances to swing around obstacles
    const perpOffsets = [80, 160, Math.round(travelLen * 0.4), Math.round(travelLen * 0.6)];
    for (const offset of perpOffsets) {
        splitPoints.push(
            { x: Math.round(midX + perpX * offset), z: Math.round(midZ + perpZ * offset) },
            { x: Math.round(midX - perpX * offset), z: Math.round(midZ - perpZ * offset) },
        );
    }

    let bestPartial: Array<{ x: number; z: number; level: number }> = [];

    for (const raw of splitPoints) {
        const snapped = snapToWalkable(level, raw.x, raw.z);
        if (!snapped) continue;

        const firstHalf = findMultiSegmentPath(level, srcX, srcZ, snapped.x, snapped.z, maxWaypoints, _depth + 1);
        if (firstHalf.length === 0) continue;

        // Verify the first half actually reached the split point (within tolerance).
        const lastWp = firstHalf[firstHalf.length - 1]!;
        const reachDist = Math.abs(lastWp.x - snapped.x) + Math.abs(lastWp.z - snapped.z);
        if (reachDist > 15) {
            if (firstHalf.length > bestPartial.length) {
                bestPartial = firstHalf;
            }
            continue;
        }

        const secondHalf = findMultiSegmentPath(level, lastWp.x, lastWp.z, destX, destZ, maxWaypoints, _depth + 1);
        if (secondHalf.length === 0) {
            if (firstHalf.length > bestPartial.length) {
                bestPartial = firstHalf;
            }
            continue;
        }

        // Concatenate, removing duplicate at junction
        return firstHalf.concat(secondHalf.slice(1));
    }

    // Return best partial result, or direct long path as fallback
    if (bestPartial.length > 0) return bestPartial;
    return findLongPath(level, srcX, srcZ, destX, destZ, maxWaypoints);
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
