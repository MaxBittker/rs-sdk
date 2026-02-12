#!/usr/bin/env bun
// Analyzes collision data with wallLocs to find ghost walls
// Usage: bun scripts/analyze-wall-locs.ts [json-path]
// Default: collision-data-diagnostic.json

import { CollisionFlag } from '../server/vendor/rsmod-pathfinder';

const jsonPath = process.argv[2] || 'collision-data-diagnostic.json';
console.log(`Loading ${jsonPath}...`);
const data = JSON.parse(require('fs').readFileSync(jsonPath, 'utf-8'));

const tiles: [number, number, number, number][] = data.tiles;
const doors: [number, number, number, number, number, number][] = data.doors ?? [];
const closeDoors: [number, number, number, number, number, number][] = data.closeDoors ?? [];
const wallLocs: [number, number, number, number, number, number, number, string][] = data.wallLocs ?? [];

console.log(`  ${tiles.length} tiles, ${doors.length} doors, ${closeDoors.length} closeDoors, ${wallLocs.length} wallLocs\n`);

// Build lookup maps
const WALL_FLAGS = CollisionFlag.WALL_NORTH | CollisionFlag.WALL_EAST |
    CollisionFlag.WALL_SOUTH | CollisionFlag.WALL_WEST |
    CollisionFlag.WALL_NORTH_WEST | CollisionFlag.WALL_NORTH_EAST |
    CollisionFlag.WALL_SOUTH_EAST | CollisionFlag.WALL_SOUTH_WEST;

// Index: tiles with wall flags
const tilesWithWalls = new Map<string, number>();
for (const [level, x, z, flags] of tiles) {
    if (flags & WALL_FLAGS) {
        tilesWithWalls.set(`${level},${x},${z}`, flags);
    }
}

// Index: wall locs by position
const wallLocsByPos = new Map<string, typeof wallLocs>();
for (const wl of wallLocs) {
    const key = `${wl[0]},${wl[1]},${wl[2]}`;
    if (!wallLocsByPos.has(key)) wallLocsByPos.set(key, []);
    wallLocsByPos.get(key)!.push(wl);
}

// Index: doors by position
const doorSet = new Set<string>();
for (const [level, x, z] of doors) doorSet.add(`${level},${x},${z}`);
for (const [level, x, z] of closeDoors) doorSet.add(`${level},${x},${z}`);

// ============================================================
// 1. Find specific ghost wall at Port Sarim (3028, 3262)
// ============================================================
console.log('=== INVESTIGATION: Port Sarim (3028, 3262) ===');
for (const z of [3262, 3263]) {
    const key = `0,3028,${z}`;
    const flags = tilesWithWalls.get(key);
    const locs = wallLocsByPos.get(key) ?? [];
    const isDoor = doorSet.has(key);
    console.log(`\n  Tile (0, 3028, ${z}):`);
    console.log(`    Flags: ${flags ?? 'none'} (${flags ? describeFlagsShort(flags) : 'no wall flags'})`);
    console.log(`    Is door: ${isDoor}`);
    console.log(`    Wall locs at this position: ${locs.length}`);
    for (const wl of locs) {
        console.log(`      locId=${wl[6]}, name="${wl[7]}", shape=${wl[3]}, angle=${wl[4]}, blockrange=${wl[5]}`);
    }
}

// ============================================================
// 2. Find tiles with wall flags but NO wall loc
// ============================================================
console.log('\n\n=== ORPHAN WALL FLAGS (wall flag but no wall loc) ===');
let orphanCount = 0;
const orphansByZone = new Map<string, number>();
for (const [key, flags] of tilesWithWalls) {
    if (!wallLocsByPos.has(key)) {
        orphanCount++;
        const [level, x, z] = key.split(',').map(Number);
        const zoneKey = `${level},${x >> 3 << 3},${z >> 3 << 3}`;
        orphansByZone.set(zoneKey, (orphansByZone.get(zoneKey) ?? 0) + 1);
    }
}
console.log(`  Total tiles with wall flags but no wall loc: ${orphanCount}`);
console.log(`  (These flags come from adjacent walls setting directional flags on neighboring tiles)\n`);

// ============================================================
// 3. Find wall locs that are NOT doors — potential ghost walls
// ============================================================
console.log('=== NON-DOOR WALL LOCS (permanent walls — potential ghost walls) ===');
const nonDoorLocs = wallLocs.filter(wl => !doorSet.has(`${wl[0]},${wl[1]},${wl[2]}`));
console.log(`  Total wall locs: ${wallLocs.length}`);
console.log(`  Doors (Open): ${doors.length}`);
console.log(`  Close doors: ${closeDoors.length}`);
console.log(`  Non-door wall locs (permanent): ${nonDoorLocs.length}`);

// Group non-door wall locs by name to find patterns
const byName = new Map<string, number>();
for (const wl of nonDoorLocs) {
    const name = wl[7];
    byName.set(name, (byName.get(name) ?? 0) + 1);
}

console.log(`\n  Non-door wall loc types (${byName.size} unique):`);
const sorted = [...byName.entries()].sort((a, b) => b[1] - a[1]);
for (const [name, count] of sorted.slice(0, 50)) {
    console.log(`    ${count.toString().padStart(5)}x  ${name}`);
}
if (sorted.length > 50) {
    console.log(`    ... and ${sorted.length - 50} more types`);
}

// ============================================================
// 4. Look at level 0 specifically for the overworld
// ============================================================
console.log('\n\n=== LEVEL 0 SUMMARY ===');
const level0WallLocs = wallLocs.filter(wl => wl[0] === 0);
const level0Doors = doors.filter(d => d[0] === 0);
const level0CloseDoors = closeDoors.filter(d => d[0] === 0);
const level0NonDoor = level0WallLocs.filter(wl => !doorSet.has(`${wl[0]},${wl[1]},${wl[2]}`));
console.log(`  Wall locs: ${level0WallLocs.length}`);
console.log(`  Doors: ${level0Doors.length}`);
console.log(`  Close doors: ${level0CloseDoors.length}`);
console.log(`  Non-door permanent walls: ${level0NonDoor.length}`);

// ============================================================
// 5. Check for tiles with LOC flag near known problem areas
// ============================================================
console.log('\n\n=== TILES WITH ONLY LOC/FLOOR FLAGS (no wall) near Port Sarim ===');
for (const [level, x, z, flags] of tiles) {
    if (level !== 0) continue;
    if (x >= 3025 && x <= 3035 && z >= 3258 && z <= 3268) {
        console.log(`  (${x}, ${z}): flags=${flags} (${describeFlagsShort(flags)})`);
    }
}

function describeFlagsShort(flags: number): string {
    const parts: string[] = [];
    if (flags & CollisionFlag.LOC) parts.push('LOC');
    if (flags & CollisionFlag.FLOOR) parts.push('FLOOR');
    if (flags & CollisionFlag.FLOOR_DECORATION) parts.push('FLOOR_DECOR');
    if (flags & CollisionFlag.ROOF) parts.push('ROOF');
    if (flags & CollisionFlag.WALL_NORTH) parts.push('WALL_N');
    if (flags & CollisionFlag.WALL_EAST) parts.push('WALL_E');
    if (flags & CollisionFlag.WALL_SOUTH) parts.push('WALL_S');
    if (flags & CollisionFlag.WALL_WEST) parts.push('WALL_W');
    if (flags & CollisionFlag.WALL_NORTH_WEST) parts.push('WALL_NW');
    if (flags & CollisionFlag.WALL_NORTH_EAST) parts.push('WALL_NE');
    if (flags & CollisionFlag.WALL_SOUTH_EAST) parts.push('WALL_SE');
    if (flags & CollisionFlag.WALL_SOUTH_WEST) parts.push('WALL_SW');
    return parts.join('|') || 'none';
}
