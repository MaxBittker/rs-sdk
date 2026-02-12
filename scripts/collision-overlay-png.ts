#!/usr/bin/env bun
// Generates a high-res collision overlay as a PNG file (no external deps)
// Usage: bun scripts/collision-overlay-png.ts
// Output: collision-overlay.png

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { deflateSync } from 'zlib';
import { CollisionFlag } from '../server/vendor/rsmod-pathfinder';

// Map coordinate range — main overworld
const MIN_X = 2300;
const MAX_X = 3600;
const MIN_Z = 2800;
const MAX_Z = 3600;

const TILE_W = MAX_X - MIN_X;  // 1300 tiles
const TILE_H = MAX_Z - MIN_Z;  // 800 tiles

const SCALE = 4; // pixels per tile
const WIDTH = TILE_W * SCALE;
const HEIGHT = TILE_H * SCALE;

// Load binary collision data
const binPath = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '../sdk/collision-data.bin');
console.log(`Loading collision data...`);
const buf = readFileSync(binPath);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

const version = view.getUint32(4, true);
const tileCount = view.getUint32(8, true);
const zoneCount = view.getUint32(12, true);
const doorCount = view.getUint32(16, true);
const closeDoorCount = version >= 2 ? view.getUint32(20, true) : 0;

console.log(`Output: ${WIDTH}x${HEIGHT} (${SCALE}x scale)`);

// Create pixel buffer (RGB)
const pixels = new Uint8Array(WIDTH * HEIGHT * 3);
// Fill with dark background (15, 15, 20)
for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = 15;
    pixels[i + 1] = 15;
    pixels[i + 2] = 20;
}

function fillTile(tileX: number, tileZ: number, r: number, g: number, b: number, a: number) {
    const basePX = (tileX - MIN_X) * SCALE;
    const basePY = ((MAX_Z - 1) - tileZ) * SCALE;
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

// Draw a wall line on the edge of a tile (1px thick at scale)
function drawWallEdge(tileX: number, tileZ: number, side: 'n' | 'e' | 's' | 'w', r: number, g: number, b: number) {
    const basePX = (tileX - MIN_X) * SCALE;
    const basePY = ((MAX_Z - 1) - tileZ) * SCALE;

    let coords: [number, number][] = [];
    switch (side) {
        case 'n': // top edge of tile (low py)
            for (let dx = 0; dx < SCALE; dx++) coords.push([basePX + dx, basePY]);
            break;
        case 's': // bottom edge
            for (let dx = 0; dx < SCALE; dx++) coords.push([basePX + dx, basePY + SCALE - 1]);
            break;
        case 'w': // left edge
            for (let dy = 0; dy < SCALE; dy++) coords.push([basePX, basePY + dy]);
            break;
        case 'e': // right edge
            for (let dy = 0; dy < SCALE; dy++) coords.push([basePX + SCALE - 1, basePY + dy]);
            break;
    }

    for (const [px, py] of coords) {
        if (px < 0 || px >= WIDTH || py < 0 || py >= HEIGHT) continue;
        const idx = (py * WIDTH + px) * 3;
        pixels[idx + 0] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
    }
}

// Parse tiles
const headerSize = version >= 2 ? 24 : 20;
let offset = headerSize;
let rendered = 0;

for (let i = 0; i < tileCount; i++) {
    const packed = view.getUint32(offset, true);
    const flags = view.getInt32(offset + 4, true);
    offset += 8;

    const z = packed & 0x3FFF;
    const x = (packed >> 14) & 0x3FFF;
    const level = (packed >> 28) & 0x3;

    if (level !== 0) continue;
    if (x < MIN_X || x >= MAX_X || z < MIN_Z || z >= MAX_Z) continue;
    rendered++;

    // Floor/LOC blocking — dark gray fill
    if (flags & (CollisionFlag.LOC | CollisionFlag.FLOOR)) {
        fillTile(x, z, 50, 50, 55, 200);
    }

    // Roof — subtle purple tint
    if (flags & CollisionFlag.ROOF) {
        fillTile(x, z, 80, 30, 100, 100);
    }

    // Directional walls — bright colored lines on tile edges
    if (flags & CollisionFlag.WALL_NORTH) drawWallEdge(x, z, 'n', 255, 70, 70);    // red
    if (flags & CollisionFlag.WALL_EAST)  drawWallEdge(x, z, 'e', 70, 255, 70);    // green
    if (flags & CollisionFlag.WALL_SOUTH) drawWallEdge(x, z, 's', 100, 140, 255);  // blue
    if (flags & CollisionFlag.WALL_WEST)  drawWallEdge(x, z, 'w', 255, 255, 70);   // yellow
}

// Doors — bright orange squares
const tilesEnd = headerSize + tileCount * 8;
const zonesEnd = tilesEnd + zoneCount * 4;
offset = zonesEnd;
let doorsRendered = 0;

for (let i = 0; i < doorCount; i++) {
    const packed = view.getUint32(offset, true);
    offset += 7;

    const z = packed & 0x3FFF;
    const x = (packed >> 14) & 0x3FFF;
    const level = (packed >> 28) & 0x3;

    if (level !== 0) continue;
    if (x < MIN_X || x >= MAX_X || z < MIN_Z || z >= MAX_Z) continue;
    doorsRendered++;

    fillTile(x, z, 255, 165, 0, 255);
}

// Close doors (default-open) — cyan squares
const doorsEnd = zonesEnd + doorCount * 7;
offset = doorsEnd;
let closeDoorsRendered = 0;

for (let i = 0; i < closeDoorCount; i++) {
    const packed = view.getUint32(offset, true);
    offset += 7;

    const z = packed & 0x3FFF;
    const x = (packed >> 14) & 0x3FFF;
    const level = (packed >> 28) & 0x3;

    if (level !== 0) continue;
    if (x < MIN_X || x >= MAX_X || z < MIN_Z || z >= MAX_Z) continue;
    closeDoorsRendered++;

    fillTile(x, z, 0, 220, 220, 255);
}

console.log(`Rendered ${rendered} tiles, ${doorsRendered} doors, ${closeDoorsRendered} close-doors`);

// Write PNG
function writePNG(path: string, width: number, height: number, rgb: Uint8Array) {
    function crc32(data: Uint8Array): number {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < data.length; i++) {
            crc ^= data[i];
            for (let j = 0; j < 8; j++) {
                crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
            }
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function writeChunk(type: string, data: Uint8Array): Uint8Array {
        const chunk = new Uint8Array(4 + 4 + data.length + 4);
        const dv = new DataView(chunk.buffer);
        dv.setUint32(0, data.length);
        for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
        chunk.set(data, 8);
        const crcData = new Uint8Array(4 + data.length);
        for (let i = 0; i < 4; i++) crcData[i] = type.charCodeAt(i);
        crcData.set(data, 4);
        dv.setUint32(8 + data.length, crc32(crcData));
        return chunk;
    }

    const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR
    const ihdr = new Uint8Array(13);
    const ihdrView = new DataView(ihdr.buffer);
    ihdrView.setUint32(0, width);
    ihdrView.setUint32(4, height);
    ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

    // IDAT — use Sub filter for better compression of scaled tiles
    const rowBytes = 1 + width * 3;
    const rawData = new Uint8Array(height * rowBytes);
    for (let y = 0; y < height; y++) {
        const rowOff = y * rowBytes;
        rawData[rowOff] = 0; // filter: None
        rawData.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), rowOff + 1);
    }
    const compressed = deflateSync(Buffer.from(rawData), { level: 9 });

    const iend = new Uint8Array(0);
    const ihdrChunk = writeChunk('IHDR', ihdr);
    const idatChunk = writeChunk('IDAT', new Uint8Array(compressed));
    const iendChunk = writeChunk('IEND', iend);

    const png = new Uint8Array(signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
    let pos = 0;
    png.set(signature, pos); pos += signature.length;
    png.set(ihdrChunk, pos); pos += ihdrChunk.length;
    png.set(idatChunk, pos); pos += idatChunk.length;
    png.set(iendChunk, pos);

    writeFileSync(path, png);
    console.log(`Written ${path} (${(png.length / 1024).toFixed(0)} KB, ${width}x${height})`);
}

writePNG('collision-overlay-v2.png', WIDTH, HEIGHT, pixels);

console.log(`\nLegend:`);
console.log(`  Dark gray fill  = Floor/LOC blocking`);
console.log(`  Red edge         = North wall`);
console.log(`  Green edge       = East wall`);
console.log(`  Blue edge        = South wall`);
console.log(`  Yellow edge      = West wall`);
console.log(`  Purple tint      = Roof`);
console.log(`  Orange square    = Door/Gate`);
console.log(`  Cyan square      = Close-Door (default-open)`);
console.log(`\nCoords: X=[${MIN_X}..${MAX_X}], Z=[${MIN_Z}..${MAX_Z}] (level 0, ${SCALE}x scale)`);
