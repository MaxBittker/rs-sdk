#!/usr/bin/env bun
// Exports collision data from a running server
// Outputs: JSON, gzipped JSON, binary v5, and PNG overlay
// Usage: bun engine/tools/export-collision.ts [server-url]
// Default: http://localhost:8888

import fs from 'fs';
import { deflateSync } from 'zlib';

const serverUrl = process.argv[2] || 'http://localhost:8888';
const outputPath = 'sdk/collision-data.json';

console.log(`Fetching collision data from ${serverUrl}/api/exportCollision...`);

const response = await fetch(`${serverUrl}/api/exportCollision`);
if (!response.ok) {
    console.error(`Failed to fetch: ${response.status} ${response.statusText}`);
    process.exit(1);
}

const data = await response.json();
console.log(`Received ${data.tiles.length} tiles, ${data.zones.length} zones, ${data.doors?.length ?? 0} doors, ${data.closeDoors?.length ?? 0} close-doors, ${data.locGates?.length ?? 0} loc-gates, ${data.closeLocGates?.length ?? 0} close-loc-gates, ${data.searchables?.length ?? 0} searchables, ${data.closeSearchables?.length ?? 0} close-searchables, ${data.wallLocs?.length ?? 0} wall-locs`);

// Write JSON
fs.writeFileSync(outputPath, JSON.stringify(data));
const stats = fs.statSync(outputPath);
console.log(`Written to ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

// Write compressed version
const compressed = Bun.gzipSync(Buffer.from(JSON.stringify(data)));
fs.writeFileSync(`${outputPath}.gz`, compressed);
console.log(`Compressed: ${(compressed.length / 1024 / 1024).toFixed(2)} MB`);

// Write binary version (v5 — adds closeSearchables)
const binPath = 'sdk/collision-data.bin';
const tileCount = data.tiles.length;
const zoneCount = data.zones.length;
const doorCount = data.doors?.length ?? 0;
const closeDoorCount = data.closeDoors?.length ?? 0;
const locGateCount = data.locGates?.length ?? 0;
const closeLocGateCount = data.closeLocGates?.length ?? 0;
const searchableCount = data.searchables?.length ?? 0;
const closeSearchableCount = data.closeSearchables?.length ?? 0;

const headerSize = 40; // v5: added closeSearchableCount (4 bytes)
const tilesSize = tileCount * 8;
const zonesSize = zoneCount * 4;
const doorsSize = doorCount * 7;
const closeDoorsSize = closeDoorCount * 7;
const locGatesSize = locGateCount * 8;
const closeLocGatesSize = closeLocGateCount * 8;
const searchablesSize = searchableCount * 8;
const closeSearchablesSize = closeSearchableCount * 8;
const totalSize = headerSize + tilesSize + zonesSize + doorsSize + closeDoorsSize + locGatesSize + closeLocGatesSize + searchablesSize + closeSearchablesSize;

const buffer = new ArrayBuffer(totalSize);
const view = new DataView(buffer);

function packCoord(level: number, x: number, z: number): number {
    return (z & 0x3FFF) | ((x & 0x3FFF) << 14) | ((level & 0x3) << 28);
}

// Header (v5)
view.setUint8(0, 0x43);  // 'C'
view.setUint8(1, 0x4F);  // 'O'
view.setUint8(2, 0x4C);  // 'L'
view.setUint8(3, 0x4C);  // 'L'
view.setUint32(4, 5, true);  // version 5
view.setUint32(8, tileCount, true);
view.setUint32(12, zoneCount, true);
view.setUint32(16, doorCount, true);
view.setUint32(20, closeDoorCount, true);
view.setUint32(24, locGateCount, true);
view.setUint32(28, closeLocGateCount, true);
view.setUint32(32, searchableCount, true);
view.setUint32(36, closeSearchableCount, true);

// Tiles
let offset = headerSize;
for (const [level, x, z, flags] of data.tiles) {
    view.setUint32(offset, packCoord(level, x, z), true);
    view.setInt32(offset + 4, flags, true);
    offset += 8;
}

// Zones
for (const [level, zoneX, zoneZ] of data.zones) {
    view.setUint32(offset, packCoord(level, zoneX, zoneZ), true);
    offset += 4;
}

// Doors (Open doors — wall collision will be removed)
for (const [level, x, z, shape, angle, blockrange] of data.doors ?? []) {
    view.setUint32(offset, packCoord(level, x, z), true);
    view.setUint8(offset + 4, shape);
    view.setUint8(offset + 5, angle);
    view.setUint8(offset + 6, blockrange);
    offset += 7;
}

// Close doors (default-open doors — wall collision will be added)
for (const [level, x, z, shape, angle, blockrange] of data.closeDoors ?? []) {
    view.setUint32(offset, packCoord(level, x, z), true);
    view.setUint8(offset + 4, shape);
    view.setUint8(offset + 5, angle);
    view.setUint8(offset + 6, blockrange);
    offset += 7;
}

// Loc gates (multi-tile openable locs — LOC collision will be removed)
for (const [level, x, z, width, length, angle, blockrange] of data.locGates ?? []) {
    view.setUint32(offset, packCoord(level, x, z), true);
    view.setUint8(offset + 4, width);
    view.setUint8(offset + 5, length);
    view.setUint8(offset + 6, angle);
    view.setUint8(offset + 7, blockrange);
    offset += 8;
}

// Close loc gates (default-open multi-tile locs — LOC collision will be added)
for (const [level, x, z, width, length, angle, blockrange] of data.closeLocGates ?? []) {
    view.setUint32(offset, packCoord(level, x, z), true);
    view.setUint8(offset + 4, width);
    view.setUint8(offset + 5, length);
    view.setUint8(offset + 6, angle);
    view.setUint8(offset + 7, blockrange);
    offset += 8;
}

// Searchables (cupboards, chests, drawers etc. — collision stays, used for overlay only)
for (const [level, x, z, width, length, angle, blockrange] of data.searchables ?? []) {
    view.setUint32(offset, packCoord(level, x, z), true);
    view.setUint8(offset + 4, width);
    view.setUint8(offset + 5, length);
    view.setUint8(offset + 6, angle);
    view.setUint8(offset + 7, blockrange);
    offset += 8;
}

// Close searchables (default-open searchable objects — collision stays, used for overlay only)
for (const [level, x, z, width, length, angle, blockrange] of data.closeSearchables ?? []) {
    view.setUint32(offset, packCoord(level, x, z), true);
    view.setUint8(offset + 4, width);
    view.setUint8(offset + 5, length);
    view.setUint8(offset + 6, angle);
    view.setUint8(offset + 7, blockrange);
    offset += 8;
}

fs.writeFileSync(binPath, Buffer.from(buffer));
const binStats = fs.statSync(binPath);
console.log(`Binary: ${binPath} (${(binStats.size / 1024 / 1024).toFixed(2)} MB) — ${((1 - binStats.size / stats.size) * 100).toFixed(1)}% smaller than JSON`);

// ============================================================
// Generate collision overlay PNG
// ============================================================
console.log('\nGenerating collision overlay PNG...');

// Collision flag constants (matching rsmod-pathfinder CollisionFlag)
const CF = {
    LOC: 256,
    FLOOR: 2097152,
    FLOOR_DECORATION: 262144,
    ROOF: -2147483648, // bit 31 as signed
    WALL_NORTH: 2,
    WALL_EAST: 8,
    WALL_SOUTH: 32,
    WALL_WEST: 128,
    WALL_NORTH_WEST: 1,
    WALL_NORTH_EAST: 4,
    WALL_SOUTH_EAST: 16,
    WALL_SOUTH_WEST: 64,
};

const SCALE = 11;
const SECTION_GAP = 66; // gap between map sections (includes label)
const KEY_WIDTH = 3400; // key panel on right side of overworld

// Define map sections to render
interface MapSection {
    label: string;
    minX: number; maxX: number;
    minZ: number; maxZ: number;
}
const sections: MapSection[] = [
    { label: 'OVERWORLD', minX: 2300, maxX: 3600, minZ: 2800, maxZ: 3600 },
    { label: 'DUNGEONS', minX: 2240, maxX: 3520, minZ: 9216, maxZ: 9984 },
    { label: 'WILDERNESS DUNGEONS', minX: 1856, maxX: 3072, minZ: 4608, maxZ: 4928 },
];

// Calculate total image dimensions
// The overworld section gets KEY_WIDTH added to its right side
const overworldPixW = (sections[0].maxX - sections[0].minX) * SCALE;
const maxSectionPixW = Math.max(...sections.map(s => (s.maxX - s.minX) * SCALE));
const WIDTH = Math.max(overworldPixW + KEY_WIDTH, maxSectionPixW);
let totalMapHeight = 0;
const sectionOffsets: number[] = [];
for (const sec of sections) {
    sectionOffsets.push(totalMapHeight);
    totalMapHeight += (sec.maxZ - sec.minZ) * SCALE + SECTION_GAP;
}
totalMapHeight -= SECTION_GAP; // no gap after last section
const HEIGHT = totalMapHeight;

const pixels = new Uint8Array(WIDTH * HEIGHT * 3);
// Dark background
for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = 15; pixels[i + 1] = 15; pixels[i + 2] = 20;
}

function setPixel(px: number, py: number, r: number, g: number, b: number) {
    if (px < 0 || px >= WIDTH || py < 0 || py >= HEIGHT) return;
    const idx = (py * WIDTH + px) * 3;
    pixels[idx] = r; pixels[idx + 1] = g; pixels[idx + 2] = b;
}

// Simple 5x7 bitmap font for legend text
const FONT: Record<string, number[]> = {
    'A': [0x7C,0x12,0x11,0x12,0x7C], 'B': [0x7F,0x49,0x49,0x49,0x36], 'C': [0x3E,0x41,0x41,0x41,0x22],
    'D': [0x7F,0x41,0x41,0x41,0x3E], 'E': [0x7F,0x49,0x49,0x49,0x41], 'F': [0x7F,0x09,0x09,0x09,0x01],
    'G': [0x3E,0x41,0x49,0x49,0x7A], 'H': [0x7F,0x08,0x08,0x08,0x7F], 'I': [0x00,0x41,0x7F,0x41,0x00],
    'J': [0x20,0x40,0x41,0x3F,0x01], 'K': [0x7F,0x08,0x14,0x22,0x41], 'L': [0x7F,0x40,0x40,0x40,0x40],
    'M': [0x7F,0x02,0x0C,0x02,0x7F], 'N': [0x7F,0x04,0x08,0x10,0x7F], 'O': [0x3E,0x41,0x41,0x41,0x3E],
    'P': [0x7F,0x09,0x09,0x09,0x06], 'R': [0x7F,0x09,0x19,0x29,0x46], 'S': [0x46,0x49,0x49,0x49,0x31],
    'T': [0x01,0x01,0x7F,0x01,0x01], 'U': [0x3F,0x40,0x40,0x40,0x3F], 'V': [0x1F,0x20,0x40,0x20,0x1F],
    'W': [0x3F,0x40,0x38,0x40,0x3F], 'X': [0x63,0x14,0x08,0x14,0x63], 'Y': [0x07,0x08,0x70,0x08,0x07],
    'Z': [0x61,0x51,0x49,0x45,0x43], ' ': [0x00,0x00,0x00,0x00,0x00], '/': [0x20,0x10,0x08,0x04,0x02],
    '-': [0x08,0x08,0x08,0x08,0x08], '=': [0x14,0x14,0x14,0x14,0x14], ':': [0x00,0x36,0x36,0x00,0x00],
    '(': [0x00,0x1C,0x22,0x41,0x00], ')': [0x00,0x41,0x22,0x1C,0x00], '.': [0x00,0x60,0x60,0x00,0x00],
    'Q': [0x3E,0x41,0x51,0x21,0x5E],
    '0': [0x3E,0x51,0x49,0x45,0x3E], '1': [0x00,0x42,0x7F,0x40,0x00], '2': [0x42,0x61,0x51,0x49,0x46],
    '3': [0x21,0x41,0x45,0x4B,0x31], '4': [0x18,0x14,0x12,0x7F,0x10], '5': [0x27,0x45,0x45,0x45,0x39],
    '6': [0x3C,0x4A,0x49,0x49,0x30], '7': [0x01,0x71,0x09,0x05,0x03], '8': [0x36,0x49,0x49,0x49,0x36],
    '9': [0x06,0x49,0x49,0x29,0x1E],
};

function drawText(text: string, startX: number, y: number, r: number, g: number, b: number) {
    let cx = startX;
    for (const ch of text.toUpperCase()) {
        const glyph = FONT[ch];
        if (!glyph) { cx += 6; continue; }
        for (let col = 0; col < 5; col++) {
            for (let row = 0; row < 7; row++) {
                if (glyph[col] & (1 << row)) {
                    setPixel(cx + col, y + row, r, g, b);
                }
            }
        }
        cx += 6;
    }
}

// Render each section
let totalTilesRendered = 0;
let totalDoorsRendered = 0;
let totalCloseDoorsRendered = 0;
let totalLocGatesRendered = 0;
let totalCloseLocGatesRendered = 0;
let totalSearchablesRendered = 0;

for (let si = 0; si < sections.length; si++) {
    const sec = sections[si];
    const secTileW = sec.maxX - sec.minX;
    const secTileH = sec.maxZ - sec.minZ;
    const secPixH = secTileH * SCALE;
    const yOff = sectionOffsets[si];
    // Overworld (section 0) is left-aligned so the key panel fits to its right.
    // Other sections are centered across the full image width.
    const xOff = si === 0 ? 0 : Math.floor((WIDTH - secTileW * SCALE) / 2);

    // Draw section label
    drawText(sec.label, xOff + 4, yOff + 4, 200, 200, 220);
    // Draw separator line under label
    for (let x = xOff; x < xOff + secTileW * SCALE; x++) {
        setPixel(x, yOff + 14, 40, 40, 50);
    }
    const mapYOff = yOff + 16; // offset past the label

    function fillTile(tileX: number, tileZ: number, r: number, g: number, b: number, a: number) {
        const basePX = xOff + (tileX - sec.minX) * SCALE;
        const basePY = mapYOff + ((sec.maxZ - 1) - tileZ) * SCALE;
        const srcA = a / 255;
        for (let dy = 0; dy < SCALE; dy++) {
            for (let dx = 0; dx < SCALE; dx++) {
                const px = basePX + dx;
                const py = basePY + dy;
                if (px < 0 || px >= WIDTH || py < 0 || py >= HEIGHT) continue;
                const idx = (py * WIDTH + px) * 3;
                pixels[idx + 0] = Math.min(255, ((r * srcA) + pixels[idx + 0] * (1 - srcA)) | 0);
                pixels[idx + 1] = Math.min(255, ((g * srcA) + pixels[idx + 1] * (1 - srcA)) | 0);
                pixels[idx + 2] = Math.min(255, ((b * srcA) + pixels[idx + 2] * (1 - srcA)) | 0);
            }
        }
    }

    function drawWallEdge(tileX: number, tileZ: number, side: 'n' | 'e' | 's' | 'w', r: number, g: number, b: number) {
        const basePX = xOff + (tileX - sec.minX) * SCALE;
        const basePY = mapYOff + ((sec.maxZ - 1) - tileZ) * SCALE;
        let coords: [number, number][] = [];
        switch (side) {
            case 'n': for (let dx = 0; dx < SCALE; dx++) coords.push([basePX + dx, basePY]); break;
            case 's': for (let dx = 0; dx < SCALE; dx++) coords.push([basePX + dx, basePY + SCALE - 1]); break;
            case 'w': for (let dy = 0; dy < SCALE; dy++) coords.push([basePX, basePY + dy]); break;
            case 'e': for (let dy = 0; dy < SCALE; dy++) coords.push([basePX + SCALE - 1, basePY + dy]); break;
        }
        for (const [px, py] of coords) {
            if (px < 0 || px >= WIDTH || py < 0 || py >= HEIGHT) continue;
            const idx = (py * WIDTH + px) * 3;
            pixels[idx] = r; pixels[idx + 1] = g; pixels[idx + 2] = b;
        }
    }

    function drawDiagonalWall(tileX: number, tileZ: number, corner: 'nw' | 'ne' | 'se' | 'sw', r: number, g: number, b: number) {
        const basePX = xOff + (tileX - sec.minX) * SCALE;
        const basePY = mapYOff + ((sec.maxZ - 1) - tileZ) * SCALE;
        for (let i = 0; i < SCALE; i++) {
            let cx: number, cy: number;
            switch (corner) {
                case 'nw': cx = basePX + i; cy = basePY + i; break;
                case 'ne': cx = basePX + SCALE - 1 - i; cy = basePY + i; break;
                case 'se': cx = basePX + SCALE - 1 - i; cy = basePY + SCALE - 1 - i; break;
                case 'sw': cx = basePX + i; cy = basePY + SCALE - 1 - i; break;
            }
            for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]] as [number, number][]) {
                const px = cx! + ox, py = cy! + oy;
                if (px >= 0 && px < WIDTH && py >= 0 && py < HEIGHT) {
                    const idx = (py * WIDTH + px) * 3;
                    pixels[idx] = r; pixels[idx + 1] = g; pixels[idx + 2] = b;
                }
            }
        }
    }

    // Render tiles for this section
    let secTiles = 0;
    for (const [level, x, z, flags] of data.tiles as [number, number, number, number][]) {
        if (level !== 0) continue;
        if (x < sec.minX || x >= sec.maxX || z < sec.minZ || z >= sec.maxZ) continue;
        secTiles++;

        if (flags & (CF.LOC | CF.FLOOR)) fillTile(x, z, 50, 50, 55, 200);
        if (flags & CF.ROOF) fillTile(x, z, 80, 30, 100, 100);
        if (flags & CF.WALL_NORTH) drawWallEdge(x, z, 'n', 255, 70, 70);
        if (flags & CF.WALL_EAST)  drawWallEdge(x, z, 'e', 70, 255, 70);
        if (flags & CF.WALL_SOUTH) drawWallEdge(x, z, 's', 100, 140, 255);
        if (flags & CF.WALL_WEST)  drawWallEdge(x, z, 'w', 255, 255, 70);
        if (flags & CF.WALL_NORTH_WEST) drawDiagonalWall(x, z, 'nw', 255, 120, 50);
        if (flags & CF.WALL_NORTH_EAST) drawDiagonalWall(x, z, 'ne', 50, 255, 120);
        if (flags & CF.WALL_SOUTH_EAST) drawDiagonalWall(x, z, 'se', 120, 50, 255);
        if (flags & CF.WALL_SOUTH_WEST) drawDiagonalWall(x, z, 'sw', 255, 180, 50);
    }

    // Doors
    let secDoors = 0;
    for (const [level, x, z] of data.doors ?? [] as [number, number, number][]) {
        if (level !== 0 || x < sec.minX || x >= sec.maxX || z < sec.minZ || z >= sec.maxZ) continue;
        secDoors++;
        fillTile(x, z, 255, 165, 0, 255);
    }

    // Close doors
    let secCloseDoors = 0;
    for (const [level, x, z] of data.closeDoors ?? [] as [number, number, number][]) {
        if (level !== 0 || x < sec.minX || x >= sec.maxX || z < sec.minZ || z >= sec.maxZ) continue;
        secCloseDoors++;
        fillTile(x, z, 0, 220, 220, 255);
    }

    // Loc gates (multi-tile openable locs)
    let secLocGates = 0;
    for (const [level, x, z, width, length, angle] of data.locGates ?? [] as [number, number, number, number, number, number][]) {
        if (level !== 0) continue;
        // Compute rotated dimensions
        const rw = (angle === 1 || angle === 3) ? length : width;
        const rl = (angle === 1 || angle === 3) ? width : length;
        for (let dx = 0; dx < rw; dx++) {
            for (let dz = 0; dz < rl; dz++) {
                const tx = x + dx;
                const tz = z + dz;
                if (tx < sec.minX || tx >= sec.maxX || tz < sec.minZ || tz >= sec.maxZ) continue;
                fillTile(tx, tz, 255, 50, 200, 255);
                secLocGates++;
            }
        }
    }

    // Close loc gates (default-open special gates)
    let secCloseLocGates = 0;
    for (const [level, x, z, width, length, angle] of data.closeLocGates ?? [] as [number, number, number, number, number, number][]) {
        if (level !== 0) continue;
        const rw = (angle === 1 || angle === 3) ? length : width;
        const rl = (angle === 1 || angle === 3) ? width : length;
        for (let dx = 0; dx < rw; dx++) {
            for (let dz = 0; dz < rl; dz++) {
                const tx = x + dx;
                const tz = z + dz;
                if (tx < sec.minX || tx >= sec.maxX || tz < sec.minZ || tz >= sec.maxZ) continue;
                fillTile(tx, tz, 200, 50, 255, 255);
                secCloseLocGates++;
            }
        }
    }

    // Searchables (cupboards, chests, drawers etc.)
    let secSearchables = 0;
    for (const [level, x, z, width, length, angle] of data.searchables ?? [] as [number, number, number, number, number, number][]) {
        if (level !== 0) continue;
        const rw = (angle === 1 || angle === 3) ? length : width;
        const rl = (angle === 1 || angle === 3) ? width : length;
        for (let dx = 0; dx < rw; dx++) {
            for (let dz = 0; dz < rl; dz++) {
                const tx = x + dx;
                const tz = z + dz;
                if (tx < sec.minX || tx >= sec.maxX || tz < sec.minZ || tz >= sec.maxZ) continue;
                fillTile(tx, tz, 180, 130, 50, 255);
                secSearchables++;
            }
        }
    }

    totalTilesRendered += secTiles;
    totalDoorsRendered += secDoors;
    totalCloseDoorsRendered += secCloseDoors;
    totalLocGatesRendered += secLocGates;
    totalCloseLocGatesRendered += secCloseLocGates;
    totalSearchablesRendered += secSearchables;
    console.log(`  ${sec.label}: ${secTiles} tiles, ${secDoors} doors, ${secCloseDoors} close-doors, ${secLocGates} loc-gate tiles, ${secCloseLocGates} close-loc-gate tiles, ${secSearchables} searchable tiles (${secTileW}x${secTileH} tiles)`);
}

// ============================================================
// Draw legend key panel to the right of the overworld
// ============================================================
const KEY_X = overworldPixW + 20; // 20px padding from map edge
const KEY_TOP = 30;
const FONT_SCALE = 8; // 8x scale = 40x56 per glyph
const SWATCH_SIZE = 77;
const KEY_ROW_H = 121;

function drawTextScaled(text: string, sx: number, sy: number, r: number, g: number, b: number, scale: number) {
    let cx = sx;
    for (const ch of text.toUpperCase()) {
        const glyph = FONT[ch];
        if (!glyph) { cx += 6 * scale; continue; }
        for (let col = 0; col < 5; col++) {
            for (let row = 0; row < 7; row++) {
                if (glyph[col] & (1 << row)) {
                    for (let dy = 0; dy < scale; dy++) {
                        for (let dx = 0; dx < scale; dx++) {
                            setPixel(cx + col * scale + dx, sy + row * scale + dy, r, g, b);
                        }
                    }
                }
            }
        }
        cx += 6 * scale;
    }
}

function drawKeyBlock(x: number, y: number, w: number, h: number, r: number, g: number, b: number) {
    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            setPixel(x + dx, y + dy, r, g, b);
        }
    }
}

function drawKeyLine(x1: number, y1: number, x2: number, y2: number, r: number, g: number, b: number) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = 0; i <= steps; i++) {
        const px = Math.round(x1 + (x2 - x1) * i / steps);
        const py = Math.round(y1 + (y2 - y1) * i / steps);
        setPixel(px, py, r, g, b);
        setPixel(px + 1, py, r, g, b);
        setPixel(px, py + 1, r, g, b);
    }
}

// Draw vertical separator line
for (let y = 0; y < (sections[0].maxZ - sections[0].minZ) * SCALE + 16; y++) {
    setPixel(KEY_X - 10, y, 40, 40, 50);
    setPixel(KEY_X - 9, y, 40, 40, 50);
}

// Title
drawTextScaled('LEGEND', KEY_X, KEY_TOP, 220, 220, 240, FONT_SCALE);

// Key items with big swatches
const keyItems: { label: string; desc?: string; draw: (x: number, y: number, s: number) => void }[] = [
    { label: 'LOC/FLOOR', draw: (x, y, s) => drawKeyBlock(x, y, s, s, 50, 50, 55) },
    { label: 'ROOF', draw: (x, y, s) => drawKeyBlock(x, y, s, s, 80, 30, 100) },
    { label: 'WALL N', draw: (x, y, s) => drawKeyBlock(x, y, s, s / 3 | 0, 255, 70, 70) },
    { label: 'WALL E', draw: (x, y, s) => drawKeyBlock(x, y, s, s / 3 | 0, 70, 255, 70) },
    { label: 'WALL S', draw: (x, y, s) => drawKeyBlock(x, y, s, s / 3 | 0, 100, 140, 255) },
    { label: 'WALL W', draw: (x, y, s) => drawKeyBlock(x, y, s, s / 3 | 0, 255, 255, 70) },
    { label: 'WALL NW', draw: (x, y, s) => drawKeyLine(x, y, x + s - 1, y + s - 1, 255, 120, 50) },
    { label: 'WALL NE', draw: (x, y, s) => drawKeyLine(x + s - 1, y, x, y + s - 1, 50, 255, 120) },
    { label: 'WALL SE', draw: (x, y, s) => drawKeyLine(x + s - 1, y + s - 1, x, y, 120, 50, 255) },
    { label: 'WALL SW', draw: (x, y, s) => drawKeyLine(x, y + s - 1, x + s - 1, y, 255, 180, 50) },
    { label: 'DOOR', desc: 'CLOSED BY DEFAULT. BOT CAN OPEN', draw: (x, y, s) => drawKeyBlock(x, y, s, s, 255, 165, 0) },
    { label: 'CLOSE DOOR', desc: 'OPEN BY DEFAULT. BOT CAN CLOSE', draw: (x, y, s) => drawKeyBlock(x, y, s, s, 0, 220, 220) },
    { label: 'LOC GATE', desc: 'SPECIAL GATE. BOT CAN OPEN', draw: (x, y, s) => drawKeyBlock(x, y, s, s, 255, 50, 200) },
    { label: 'CLOSE LOC GATE', desc: 'SPECIAL GATE. OPEN BY DEFAULT', draw: (x, y, s) => drawKeyBlock(x, y, s, s, 200, 50, 255) },
    { label: 'SEARCHABLE OBJECT', desc: 'CHESTS. CUPBOARDS. CRATES. ETC', draw: (x, y, s) => drawKeyBlock(x, y, s, s, 180, 130, 50) },
];

const keyStartY = KEY_TOP + FONT_SCALE * 7 + 20; // below title text + padding
for (let i = 0; i < keyItems.length; i++) {
    const itemY = keyStartY + i * KEY_ROW_H;
    keyItems[i].draw(KEY_X, itemY, SWATCH_SIZE);
    drawTextScaled(keyItems[i].label, KEY_X + SWATCH_SIZE + 16, itemY + 3, 200, 200, 210, 3);
    if (keyItems[i].desc) {
        drawTextScaled(keyItems[i].desc!, KEY_X + SWATCH_SIZE + 16, itemY + 30, 140, 140, 150, 2);
    }
}

// Stats at bottom of key
const statsY = keyStartY + keyItems.length * KEY_ROW_H + 20;
drawTextScaled(`${tileCount} TILES`, KEY_X, statsY, 140, 140, 160, 2);
drawTextScaled(`${doorCount} DOORS`, KEY_X, statsY + 30, 140, 140, 160, 2);
drawTextScaled(`${closeDoorCount} CLOSE DOORS`, KEY_X, statsY + 60, 140, 140, 160, 2);
drawTextScaled(`${locGateCount} LOC GATES`, KEY_X, statsY + 90, 140, 140, 160, 2);
drawTextScaled(`${closeLocGateCount} CLOSE LOC GATES`, KEY_X, statsY + 120, 140, 140, 160, 2);
drawTextScaled(`${searchableCount} SEARCHABLE OBJECTS`, KEY_X, statsY + 150, 140, 140, 160, 2);

console.log(`  Total: ${totalTilesRendered} tiles, ${totalDoorsRendered} doors, ${totalCloseDoorsRendered} close-doors, ${totalLocGatesRendered} loc-gate tiles, ${totalCloseLocGatesRendered} close-loc-gate tiles, ${totalSearchablesRendered} searchable tiles`);

// Write PNG
function writePNG(path: string, w: number, h: number, rgb: Uint8Array) {
    function crc32(d: Uint8Array): number {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < d.length; i++) {
            crc ^= d[i];
            for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    function writeChunk(type: string, cd: Uint8Array): Uint8Array {
        const chunk = new Uint8Array(4 + 4 + cd.length + 4);
        const dv = new DataView(chunk.buffer);
        dv.setUint32(0, cd.length);
        for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
        chunk.set(cd, 8);
        const crcData = new Uint8Array(4 + cd.length);
        for (let i = 0; i < 4; i++) crcData[i] = type.charCodeAt(i);
        crcData.set(cd, 4);
        dv.setUint32(8 + cd.length, crc32(crcData));
        return chunk;
    }
    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = new Uint8Array(13);
    const ihdrV = new DataView(ihdr.buffer);
    ihdrV.setUint32(0, w); ihdrV.setUint32(4, h);
    ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const rowBytes = 1 + w * 3;
    const rawData = new Uint8Array(h * rowBytes);
    for (let y = 0; y < h; y++) {
        rawData[y * rowBytes] = 0;
        rawData.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * rowBytes + 1);
    }
    const comp = deflateSync(Buffer.from(rawData), { level: 9 });
    const ihdrC = writeChunk('IHDR', ihdr);
    const idatC = writeChunk('IDAT', new Uint8Array(comp));
    const iendC = writeChunk('IEND', new Uint8Array(0));
    const png = new Uint8Array(sig.length + ihdrC.length + idatC.length + iendC.length);
    let p = 0;
    png.set(sig, p); p += sig.length;
    png.set(ihdrC, p); p += ihdrC.length;
    png.set(idatC, p); p += idatC.length;
    png.set(iendC, p);
    fs.writeFileSync(path, png);
    console.log(`  Written ${path} (${(png.length / 1024).toFixed(0)} KB, ${w}x${h})`);
}

const pngPath = 'sdk/collision-overlay.png';
writePNG(pngPath, WIDTH, HEIGHT, pixels);
