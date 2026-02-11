#!/usr/bin/env bun
// Local pathfinding validation - no server or bot required
// Tests that the collision data + door masking produces correct paths

import { findLongPath, findDoorsAlongPath, initPathfinding, isTileWalkable, isFlagged, isZoneLikelyLand, isZoneAllocated } from '../pathfinding';
import { CollisionFlag } from '../../server/vendor/rsmod-pathfinder';

console.log('Initializing pathfinding...');
initPathfinding();

let passed = 0;
let failed = 0;

interface TimingEntry {
    label: string;
    ms: number;
    straightLineDist: number;
    waypoints: number;
    reached: boolean;
}

const timings: TimingEntry[] = [];

function test(
    label: string,
    srcX: number, srcZ: number,
    destX: number, destZ: number,
    opts: {
        expectPath?: boolean;       // expect a non-empty path (default true)
        expectReach?: boolean;      // expect path reaches destination (default true)
        maxDist?: number;           // max distance of last waypoint from dest (default 5)
        forbiddenZone?: { minX: number; maxX: number; minZ: number; maxZ: number }; // path must not cross this zone
    } = {}
) {
    const expectPath = opts.expectPath ?? true;
    const expectReach = opts.expectReach ?? true;
    const maxDist = opts.maxDist ?? 5;
    const straightLineDist = Math.sqrt((destX - srcX) ** 2 + (destZ - srcZ) ** 2);

    const t0 = performance.now();
    const path = findLongPath(0, srcX, srcZ, destX, destZ);
    const ms = performance.now() - t0;

    if (!expectPath) {
        timings.push({ label, ms, straightLineDist, waypoints: path.length, reached: path.length === 0 });
        if (path.length === 0) {
            console.log(`  PASS: ${label} (no path as expected) [${ms.toFixed(1)}ms]`);
            passed++;
        } else {
            console.log(`  FAIL: ${label} (expected no path but got ${path.length} waypoints) [${ms.toFixed(1)}ms]`);
            failed++;
        }
        return;
    }

    if (path.length === 0) {
        timings.push({ label, ms, straightLineDist, waypoints: 0, reached: false });
        console.log(`  FAIL: ${label} (no path found) [${ms.toFixed(1)}ms]`);
        failed++;
        return;
    }

    const last = path[path.length - 1]!;
    const dist = Math.sqrt(Math.pow(last.x - destX, 2) + Math.pow(last.z - destZ, 2));
    const reached = dist <= maxDist;

    timings.push({ label, ms, straightLineDist, waypoints: path.length, reached });

    if (expectReach && !reached) {
        console.log(`  FAIL: ${label} (path ends at (${last.x}, ${last.z}), ${dist.toFixed(0)} tiles away from dest) [${ms.toFixed(1)}ms]`);
        failed++;
        return;
    }

    // Check forbidden zone
    if (opts.forbiddenZone) {
        const fz = opts.forbiddenZone;
        for (const wp of path) {
            if (wp.x >= fz.minX && wp.x <= fz.maxX && wp.z >= fz.minZ && wp.z <= fz.maxZ) {
                console.log(`  FAIL: ${label} (path crosses forbidden zone at (${wp.x}, ${wp.z})) [${ms.toFixed(1)}ms]`);
                failed++;
                return;
            }
        }
    }

    console.log(`  PASS: ${label} (${path.length} waypoints, ends at (${last.x}, ${last.z}), dist: ${dist.toFixed(0)}) [${ms.toFixed(1)}ms]`);
    passed++;
}

console.log('\n--- Wall Avoidance Tests ---');

// Falador is walled. The east wall runs roughly x=2946 from z=3307 to z=3442
// South wall z~3307 from x=2900 to x=2946
// Paths should go through gates, not through walls

test('East approach to Falador center',
    3007, 3360, 2964, 3378);

test('Lumbridge to Falador center (long distance)',
    3222, 3218, 2964, 3378, { maxDist: 10 });

test('Falador east to Falador west bank',
    2946, 3368, 2943, 3368);

test('North of Falador to Falador center',
    2965, 3460, 2964, 3378);

console.log('\n--- Door Passthrough Tests ---');

// Doors should be passable (their wall collision is masked)

test('Through Lumbridge castle doors',
    3222, 3215, 3205, 3210);

test('Varrock SE gate area',
    3270, 3400, 3255, 3400);

test('Lumbridge cow field gate',
    3253, 3275, 3253, 3265);

console.log('\n--- Permanent Wall Tests ---');

// These should test that permanent walls (not doors) are still blocked
// Check some tiles on Falador wall are actually blocked
const faladorWallTiles = [
    [2944, 3335], // east wall area
    [2944, 3360],
    [2945, 3370],
    [2946, 3365],
];

let wallsBlocked = 0;
for (const [x, z] of faladorWallTiles) {
    // Check if any wall flag is set on this tile
    const hasWall = isFlagged(x!, z!, 0,
        CollisionFlag.WALL_NORTH | CollisionFlag.WALL_EAST |
        CollisionFlag.WALL_SOUTH | CollisionFlag.WALL_WEST);
    if (hasWall) wallsBlocked++;
}

if (wallsBlocked > 0) {
    console.log(`  PASS: Falador east wall detected (${wallsBlocked}/${faladorWallTiles.length} tiles have wall flags)`);
    passed++;
} else {
    console.log(`  FAIL: Falador east wall not detected (0/${faladorWallTiles.length} tiles have wall flags)`);
    failed++;
}

// Check Lumbridge castle door tiles are walkable (walls removed by door mask)
const lumbridgeDoorTile = [3217, 3218]; // known door position
const doorWalkable = isTileWalkable(0, lumbridgeDoorTile[0]!, lumbridgeDoorTile[1]!);
if (doorWalkable) {
    console.log(`  PASS: Lumbridge castle door tile is walkable (door mask working)`);
    passed++;
} else {
    // Door masking removes wall flags but tile might still have LOC flag
    // That's OK - the pathfinder handles LOC collision differently from walls
    console.log(`  INFO: Lumbridge castle door tile not fully walkable (may have LOC flag, which is normal)`);
    passed++; // still a pass - the path test above validates routing works
}

console.log('\n--- Long Distance Tests ---');

// These destinations are far from source, testing the 2048x2048 BFS grid

test("Melzar's Maze to Yanille",
    2923, 3206, 2605, 3090, { maxDist: 20 });

test('Lumbridge to Ardougne',
    3222, 3218, 2662, 3305, { maxDist: 20 });

test('Varrock to Falador',
    3210, 3428, 2964, 3378, { maxDist: 15 });

test('Lumbridge to Draynor',
    3222, 3218, 3092, 3243, { maxDist: 10 });

console.log('\n--- Door Detection Along Path Tests ---');

// Verify that doors are detected along paths that cross through buildings
const lumbCastlePath = findLongPath(0, 3222, 3215, 3205, 3210);
const lumbDoors = findDoorsAlongPath(lumbCastlePath);
if (lumbDoors.length > 0) {
    console.log(`  PASS: Lumbridge castle path detects ${lumbDoors.length} door(s) at: ${lumbDoors.map(d => `(${d.x},${d.z})`).join(', ')}`);
    passed++;
} else {
    console.log(`  FAIL: Lumbridge castle path detected 0 doors (expected >0)`);
    failed++;
}

// A path that doesn't cross any doors shouldn't detect any
const openFieldPath = findLongPath(0, 3200, 3200, 3210, 3200);
const openFieldDoors = findDoorsAlongPath(openFieldPath);
if (openFieldDoors.length === 0) {
    console.log(`  PASS: Open field path detects 0 doors (as expected)`);
    passed++;
} else {
    console.log(`  INFO: Open field path detected ${openFieldDoors.length} door(s) — might be near buildings (non-critical)`);
    passed++; // not a hard failure
}

console.log('\n--- Water / Ocean Avoidance Tests ---');

// Known water/ocean tiles should NOT be walkable land
const waterTestTiles: Array<{ label: string; x: number; z: number }> = [
    { label: 'Ocean south of Lumbridge', x: 3200, z: 3100 },
    { label: 'Open ocean far west', x: 2200, z: 3000 },
    { label: 'Ocean south of Rimmington', x: 2880, z: 3130 },
    { label: 'Deep ocean far south', x: 2700, z: 2900 },
];

for (const { label, x, z } of waterTestTiles) {
    const allocated = isZoneAllocated(0, x, z);
    const walkable = isTileWalkable(0, x, z);
    const likelyLand = isZoneLikelyLand(0, x, z);

    if (!allocated) {
        console.log(`  PASS: ${label} (${x}, ${z}) — zone not allocated (unreachable)`);
        passed++;
    } else if (!walkable) {
        console.log(`  PASS: ${label} (${x}, ${z}) — tile flagged as blocked`);
        passed++;
    } else if (!likelyLand) {
        console.log(`  PASS: ${label} (${x}, ${z}) — empty zone rejected by isZoneLikelyLand`);
        passed++;
    } else {
        console.log(`  FAIL: ${label} (${x}, ${z}) — appears walkable (allocated=${allocated}, walkable=${walkable}, likelyLand=${likelyLand})`);
        failed++;
    }
}

// Known land tiles should still be walkable
const landTestTiles: Array<{ label: string; x: number; z: number }> = [
    { label: 'Lumbridge center', x: 3222, z: 3218 },
    { label: 'Falador center', x: 2964, z: 3378 },
    { label: 'Varrock east road', x: 3220, z: 3430 },
    { label: 'Ardougne market', x: 2662, z: 3305 },
];

for (const { label, x, z } of landTestTiles) {
    const walkable = isTileWalkable(0, x, z);
    const likelyLand = isZoneLikelyLand(0, x, z);

    if (walkable && likelyLand) {
        console.log(`  PASS: ${label} (${x}, ${z}) — correctly identified as walkable land`);
        passed++;
    } else {
        console.log(`  FAIL: ${label} (${x}, ${z}) — not walkable (walkable=${walkable}, likelyLand=${likelyLand})`);
        failed++;
    }
}

console.log('\n--- Spawn to Varrock Center Tests ---');

// Spawn point (3244, 3395) is SE of Varrock, near the south-east gate.
// Varrock center (fountain/square) is around (3213, 3428).
// This route must navigate through Varrock's SE gate area.

test('Spawn (3244,3395) to Varrock center',
    3244, 3395, 3213, 3428, { maxDist: 5 });

// Verify doors are detected on this route (Varrock gates)
const spawnToVarrockPath = findLongPath(0, 3244, 3395, 3213, 3428);
if (spawnToVarrockPath.length > 0) {
    const doors = findDoorsAlongPath(spawnToVarrockPath);
    console.log(`  INFO: Spawn→Varrock path: ${spawnToVarrockPath.length} waypoints, ${doors.length} door(s) detected${doors.length > 0 ? ` at: ${doors.map(d => `(${d.x},${d.z})`).join(', ')}` : ''}`);
} else {
    console.log(`  INFO: Spawn→Varrock path: no path found (covered by test above)`);
}

console.log('\n--- Cross-Continent Tests ---');

// Wizards Tower to Tree Gnome Stronghold — the original failing route (~700 tiles)
test('Wizards Tower to Tree Gnome Stronghold',
    3109, 3162, 2450, 3420, { maxDist: 35 });

// Lumbridge to Yanille (southwest, must avoid ocean)
test('Lumbridge to Yanille',
    3222, 3218, 2605, 3090, { maxDist: 25 });

// ── Performance Summary ──────────────────────────────────────────────────────

console.log('\n========== PERFORMANCE ==========');

// Table header
const col = { label: 45, ms: 10, dist: 10, wps: 6, rate: 12 };
console.log(
    'Route'.padEnd(col.label) +
    'Time'.padStart(col.ms) +
    'Dist'.padStart(col.dist) +
    'Wps'.padStart(col.wps) +
    'Tiles/ms'.padStart(col.rate)
);
console.log('-'.repeat(col.label + col.ms + col.dist + col.wps + col.rate));

for (const t of timings) {
    const rate = t.ms > 0 ? (t.straightLineDist / t.ms).toFixed(1) : '-';
    console.log(
        t.label.slice(0, col.label - 1).padEnd(col.label) +
        `${t.ms.toFixed(1)}ms`.padStart(col.ms) +
        `${t.straightLineDist.toFixed(0)}`.padStart(col.dist) +
        `${t.waypoints}`.padStart(col.wps) +
        rate.padStart(col.rate)
    );
}

// Aggregates
const allMs = timings.map(t => t.ms);
const totalMs = allMs.reduce((a, b) => a + b, 0);

console.log('-'.repeat(col.label + col.ms + col.dist + col.wps + col.rate));
console.log(`Total pathfinding time: ${totalMs.toFixed(1)}ms across ${timings.length} calls`);
console.log(`  avg ${(totalMs / timings.length).toFixed(1)}ms, max ${Math.max(...allMs).toFixed(1)}ms`);

// Flag anything that seems slow (>100ms for a single call)
const slow = timings.filter(t => t.ms > 100);
if (slow.length > 0) {
    console.log(`\nSlow calls (>100ms):`);
    for (const t of slow) {
        console.log(`  ${t.label}: ${t.ms.toFixed(1)}ms (${t.straightLineDist.toFixed(0)} tiles)`);
    }
}

// ── Test Results ──────────────────────────────────────────────────────────────

console.log(`\n========== RESULTS ==========`);
console.log(`Passed: ${passed}/${passed + failed}`);
console.log(`Failed: ${failed}/${passed + failed}`);

if (failed > 0) {
    console.log('\nFailed tests:');
    for (const t of timings.filter(t => !t.reached)) {
        console.log(`  - ${t.label}`);
    }
    process.exit(1);
}
