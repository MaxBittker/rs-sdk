#!/usr/bin/env bun
// Generates a collision overlay image as a BMP file
// Usage: bun scripts/collision-overlay.ts
// Output: collision-overlay.bmp

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { CollisionFlag } from '../server/vendor/rsmod-pathfinder';

// Map coordinate range (from MapView.ts)
// Only render the main overworld area where most gameplay happens
const MIN_X = 2300;
const MAX_X = 3600;
const MIN_Z = 2800;
const MAX_Z = 3600;

const WIDTH = MAX_X - MIN_X;   // 1300
const HEIGHT = MAX_Z - MIN_Z;  // 800

// Load binary collision data
const binPath = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '../sdk/collision-data.bin');
console.log(`Loading collision data from ${binPath}...`);
const buf = readFileSync(binPath);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

// Validate header
if (view.getUint8(0) !== 0x43 || view.getUint8(1) !== 0x4F ||
    view.getUint8(2) !== 0x4C || view.getUint8(3) !== 0x4C) {
    throw new Error('Invalid collision binary');
}

const tileCount = view.getUint32(8, true);
const zoneCount = view.getUint32(12, true);
const doorCount = view.getUint32(16, true);
console.log(`${tileCount} tiles, ${zoneCount} zones, ${doorCount} doors`);

// Create pixel buffer (RGBA)
const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
// Fill with transparent black
pixels.fill(0);

// Color scheme
const COL_FLOOR = [40, 40, 40, 180];        // dark gray — floor/loc blocking
const COL_WALL_N = [255, 50, 50, 220];      // red — north wall
const COL_WALL_E = [50, 255, 50, 220];      // green — east wall
const COL_WALL_S = [50, 50, 255, 220];      // blue — south wall
const COL_WALL_W = [255, 255, 50, 220];     // yellow — west wall
const COL_ROOF = [128, 0, 128, 140];        // purple — roof

function setPixel(x: number, z: number, color: number[]) {
    // Map coordinates to pixel: z is inverted (high z = top of image)
    const px = x - MIN_X;
    const py = (MAX_Z - 1) - z;  // flip z axis
    if (px < 0 || px >= WIDTH || py < 0 || py >= HEIGHT) return;
    const idx = (py * WIDTH + px) * 4;
    // Alpha blend
    const srcA = color[3] / 255;
    const dstA = pixels[idx + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA > 0) {
        pixels[idx + 0] = ((color[0] * srcA + pixels[idx + 0] * dstA * (1 - srcA)) / outA) | 0;
        pixels[idx + 1] = ((color[1] * srcA + pixels[idx + 1] * dstA * (1 - srcA)) / outA) | 0;
        pixels[idx + 2] = ((color[2] * srcA + pixels[idx + 2] * dstA * (1 - srcA)) / outA) | 0;
        pixels[idx + 3] = (outA * 255) | 0;
    }
}

// Parse tiles (level 0 only for overworld)
const headerSize = 20;
let offset = headerSize;
let rendered = 0;

for (let i = 0; i < tileCount; i++) {
    const packed = view.getUint32(offset, true);
    const flags = view.getInt32(offset + 4, true);
    offset += 8;

    const z = packed & 0x3FFF;
    const x = (packed >> 14) & 0x3FFF;
    const level = (packed >> 28) & 0x3;

    // Only level 0
    if (level !== 0) continue;
    if (x < MIN_X || x >= MAX_X || z < MIN_Z || z >= MAX_Z) continue;

    rendered++;

    // Floor/LOC blocking
    if (flags & (CollisionFlag.LOC | CollisionFlag.FLOOR)) {
        setPixel(x, z, COL_FLOOR);
    }

    // Roof
    if (flags & CollisionFlag.ROOF) {
        setPixel(x, z, COL_ROOF);
    }

    // Directional walls
    if (flags & CollisionFlag.WALL_NORTH) setPixel(x, z, COL_WALL_N);
    if (flags & CollisionFlag.WALL_EAST) setPixel(x, z, COL_WALL_E);
    if (flags & CollisionFlag.WALL_SOUTH) setPixel(x, z, COL_WALL_S);
    if (flags & CollisionFlag.WALL_WEST) setPixel(x, z, COL_WALL_W);
}

// Mark door positions
const tilesEnd = headerSize + tileCount * 8;
const zonesEnd = tilesEnd + zoneCount * 4;
offset = zonesEnd;

const COL_DOOR = [255, 165, 0, 255]; // orange — doors
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
    // Draw door as a bright orange dot (3x3)
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            setPixel(x + dx, z + dz, COL_DOOR);
        }
    }
}

console.log(`Rendered ${rendered} tiles, ${doorsRendered} doors`);

// Write as BMP
function writeBMP(path: string, width: number, height: number, rgba: Uint8Array) {
    const rowSize = Math.ceil(width * 3 / 4) * 4; // rows padded to 4 bytes
    const imageSize = rowSize * height;
    const fileSize = 54 + imageSize;
    const bmp = Buffer.alloc(fileSize);

    // BMP header
    bmp.writeUInt8(0x42, 0); // 'B'
    bmp.writeUInt8(0x4D, 1); // 'M'
    bmp.writeUInt32LE(fileSize, 2);
    bmp.writeUInt32LE(54, 10); // pixel data offset

    // DIB header (BITMAPINFOHEADER)
    bmp.writeUInt32LE(40, 14); // header size
    bmp.writeInt32LE(width, 18);
    bmp.writeInt32LE(height, 22); // positive = bottom-up
    bmp.writeUInt16LE(1, 26); // color planes
    bmp.writeUInt16LE(24, 28); // bits per pixel (BGR)
    bmp.writeUInt32LE(0, 30); // no compression
    bmp.writeUInt32LE(imageSize, 34);

    // Pixel data (BMP is bottom-up, BGR)
    for (let y = 0; y < height; y++) {
        const srcRow = (height - 1 - y); // flip for BMP bottom-up
        for (let x = 0; x < width; x++) {
            const srcIdx = (srcRow * width + x) * 4;
            const dstIdx = 54 + y * rowSize + x * 3;
            // Alpha composite onto black background
            const a = rgba[srcIdx + 3] / 255;
            bmp[dstIdx + 0] = (rgba[srcIdx + 2] * a) | 0; // B
            bmp[dstIdx + 1] = (rgba[srcIdx + 1] * a) | 0; // G
            bmp[dstIdx + 2] = (rgba[srcIdx + 0] * a) | 0; // R
        }
    }

    writeFileSync(path, bmp);
    console.log(`Written ${path} (${(bmp.length / 1024 / 1024).toFixed(2)} MB)`);
}

const outPath = 'collision-overlay.bmp';
writeBMP(outPath, WIDTH, HEIGHT, pixels);

console.log(`\nLegend:`);
console.log(`  Dark gray  = Floor/LOC blocking`);
console.log(`  Red        = North wall`);
console.log(`  Green      = East wall`);
console.log(`  Blue       = South wall`);
console.log(`  Yellow     = West wall`);
console.log(`  Purple     = Roof`);
console.log(`  Orange     = Door/Gate`);
console.log(`\nCoordinate range: X=[${MIN_X}..${MAX_X}], Z=[${MIN_Z}..${MAX_Z}] (level 0)`);
