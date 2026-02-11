// Local pathfinding using bundled collision data
import * as rsmod from '../server/vendor/rsmod-pathfinder';
import { CollisionType, CollisionFlag } from '../server/vendor/rsmod-pathfinder';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

let initialized = false;

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

function unpackCoord(packed: number): { level: number; x: number; z: number } {
    return {
        z: packed & 0x3FFF,
        x: (packed >> 14) & 0x3FFF,
        level: (packed >> 28) & 0x3,
    };
}

export function initPathfinding(): void {
    if (initialized) return;

    const start = Date.now();

    // Load binary collision data
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const binPath = resolve(__dirname, 'collision-data.bin');
    const buf = readFileSync(binPath);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

    // Validate header
    if (view.getUint8(0) !== 0x43 || view.getUint8(1) !== 0x4F ||
        view.getUint8(2) !== 0x4C || view.getUint8(3) !== 0x4C) {
        throw new Error('Invalid collision binary: bad magic bytes');
    }
    const version = view.getUint32(4, true);
    if (version !== 1 && version !== 2) {
        throw new Error(`Unsupported collision binary version: ${version}`);
    }

    const tileCount = view.getUint32(8, true);
    const zoneCount = view.getUint32(12, true);
    const doorCount = view.getUint32(16, true);
    const closeDoorCount = version >= 2 ? view.getUint32(20, true) : 0;
    const loadMs = Date.now() - start;

    const headerSize = version >= 2 ? 24 : 20;
    const tilesEnd = headerSize + tileCount * 8;
    const zonesEnd = tilesEnd + zoneCount * 4;

    // Allocate all zones first (includes walkable areas with no collision tiles)
    let offset = tilesEnd; // zones section starts after tiles
    for (let i = 0; i < zoneCount; i++) {
        const packed = view.getUint32(offset, true);
        const { level, x, z } = unpackCoord(packed);
        rsmod.allocateIfAbsent(x, z, level);
        offset += 4;
    }

    // Allocate mainland zones so the 2048x2048 BFS grid can traverse
    // open land between cities. Unallocated zones return NULL (blocked),
    // so without this the pathfinder can't cross gaps in the collision data.
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
    offset = headerSize; // tiles section starts after header
    for (let i = 0; i < tileCount; i++) {
        const packed = view.getUint32(offset, true);
        const flags = view.getInt32(offset + 4, true); // SIGNED — bit 31 used
        const { level, x, z } = unpackCoord(packed);
        rsmod.__set(x, z, level, flags);
        populatedZones.add(`${level},${x & ~7},${z & ~7}`);
        offset += 8;
    }

    // Remove wall collision at door/gate positions so the pathfinder
    // routes through doorways while still respecting permanent walls.
    let doorsMasked = 0;
    let skippedOneWay = 0;
    offset = zonesEnd; // doors section starts after zones
    for (let i = 0; i < doorCount; i++) {
        const packed = view.getUint32(offset, true);
        const shape = view.getUint8(offset + 4);
        const angle = view.getUint8(offset + 5);
        const blockrange = view.getUint8(offset + 6);
        const { level, x, z } = unpackCoord(packed);
        offset += 7;

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
        doorsMasked++;
    }

    // Add wall collision for default-open doors (closeDoors).
    // These doors have no wall collision in the static map data because they
    // spawn open. We add walls so the pathfinder treats them as closed,
    // preventing routes through doorways that may be closed at runtime.
    const doorsEnd = zonesEnd + doorCount * 7;
    offset = doorsEnd;
    let closeDoorsAdded = 0;
    for (let i = 0; i < closeDoorCount; i++) {
        const packed = view.getUint32(offset, true);
        const shape = view.getUint8(offset + 4);
        const angle = view.getUint8(offset + 5);
        const blockrange = view.getUint8(offset + 6);
        const { level, x, z } = unpackCoord(packed);
        offset += 7;

        // Add wall collision (add=true) — the opposite of what we do for "Open" doors
        rsmod.changeWall(x, z, level, angle, shape, !!blockrange, false, true);
        // Also add to doorIndex so findDoorsAlongPath detects them
        const key = doorKey(level, x, z);
        doorIndex.set(key, {
            level, x, z, shape, angle, blockrange: !!blockrange
        });
        closeDoorsAdded++;
    }

    initialized = true;
    console.log(`Pathfinding initialized in ${Date.now() - start}ms (load: ${loadMs}ms) (${zoneCount} zones + ${mainlandZones} mainland fill, ${tileCount} tiles, ${doorsMasked} doors masked, ${skippedOneWay} one-way doors blocked, ${closeDoorsAdded} close-doors walled)`);
}

// Check if a zone has collision data
export function isZoneAllocated(level: number, x: number, z: number): boolean {
    if (!initialized) {
        initPathfinding();
    }
    return rsmod.isZoneAllocated(x, z, level);
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

/**
 * Re-add wall collision for a door that couldn't be opened (e.g. locked).
 * This causes the pathfinder to route around it on subsequent queries.
 * Also removes the door from the index so findDoorsAlongPath won't return it.
 */
export function blockDoor(level: number, x: number, z: number): boolean {
    if (!initialized) initPathfinding();
    const key = doorKey(level, x, z);
    const door = doorIndex.get(key);
    if (!door) return false;
    rsmod.changeWall(x, z, level, door.angle, door.shape, door.blockrange, false, true);
    doorIndex.delete(key);
    return true;
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
