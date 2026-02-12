#!/usr/bin/env bun
// Generates a zoomed-in crop of collision data for a specific area
// Usage: bun scripts/collision-overlay-crop.ts
// Output: collision-crop-lumbridge.png, collision-crop-varrock.png

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { deflateSync } from 'zlib';
import { CollisionFlag } from '../server/vendor/rsmod-pathfinder';

// Load binary collision data
const binPath = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '../sdk/collision-data.bin');
const buf = readFileSync(binPath);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const version = view.getUint32(4, true);
const tileCount = view.getUint32(8, true);
const zoneCount = view.getUint32(12, true);
const doorCount = view.getUint32(16, true);
const closeDoorCount = version >= 2 ? view.getUint32(20, true) : 0;

const SCALE = 8; // pixels per tile for crops

interface Region {
    name: string;
    minX: number; maxX: number;
    minZ: number; maxZ: number;
}

const regions: Region[] = [
    { name: 'lumbridge', minX: 3190, maxX: 3270, minZ: 3190, maxZ: 3270 },
    { name: 'varrock', minX: 3150, maxX: 3290, minZ: 3380, maxZ: 3510 },
    { name: 'falador', minX: 2930, maxX: 3050, minZ: 3300, maxZ: 3400 },
    { name: 'portsarim', minX: 3020, maxX: 3080, minZ: 3230, maxZ: 3280 },
];

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
    const ihdr = new Uint8Array(13);
    const ihdrView = new DataView(ihdr.buffer);
    ihdrView.setUint32(0, width);
    ihdrView.setUint32(4, height);
    ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

    const rowBytes = 1 + width * 3;
    const rawData = new Uint8Array(height * rowBytes);
    for (let y = 0; y < height; y++) {
        rawData[y * rowBytes] = 0;
        rawData.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * rowBytes + 1);
    }
    const compressed = deflateSync(Buffer.from(rawData), { level: 9 });

    const ihdrChunk = writeChunk('IHDR', ihdr);
    const idatChunk = writeChunk('IDAT', new Uint8Array(compressed));
    const iendChunk = writeChunk('IEND', new Uint8Array(0));

    const png = new Uint8Array(signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
    let pos = 0;
    png.set(signature, pos); pos += signature.length;
    png.set(ihdrChunk, pos); pos += ihdrChunk.length;
    png.set(idatChunk, pos); pos += idatChunk.length;
    png.set(iendChunk, pos);

    writeFileSync(path, png);
    console.log(`  Written ${path} (${(png.length / 1024).toFixed(0)} KB, ${width}x${height})`);
}

for (const region of regions) {
    const tileW = region.maxX - region.minX;
    const tileH = region.maxZ - region.minZ;
    const width = tileW * SCALE;
    const height = tileH * SCALE;

    const pixels = new Uint8Array(width * height * 3);
    // Dark background
    for (let i = 0; i < pixels.length; i += 3) {
        pixels[i] = 18; pixels[i + 1] = 18; pixels[i + 2] = 24;
    }

    function fillTile(tileX: number, tileZ: number, r: number, g: number, b: number, a: number) {
        const basePX = (tileX - region.minX) * SCALE;
        const basePY = ((region.maxZ - 1) - tileZ) * SCALE;
        const srcA = a / 255;
        for (let dy = 0; dy < SCALE; dy++) {
            for (let dx = 0; dx < SCALE; dx++) {
                const px = basePX + dx;
                const py = basePY + dy;
                if (px < 0 || px >= width || py < 0 || py >= height) continue;
                const idx = (py * width + px) * 3;
                pixels[idx + 0] = Math.min(255, ((r * srcA) + pixels[idx + 0] * (1 - srcA)) | 0);
                pixels[idx + 1] = Math.min(255, ((g * srcA) + pixels[idx + 1] * (1 - srcA)) | 0);
                pixels[idx + 2] = Math.min(255, ((b * srcA) + pixels[idx + 2] * (1 - srcA)) | 0);
            }
        }
    }

    // Draw grid lines (very faint) to show tile boundaries
    for (let tx = 0; tx < tileW; tx++) {
        for (let tz = 0; tz < tileH; tz++) {
            const basePX = tx * SCALE;
            const basePY = tz * SCALE;
            // Right edge and bottom edge of each tile
            for (let dy = 0; dy < SCALE; dy++) {
                const px = basePX + SCALE - 1;
                const py = basePY + dy;
                if (px < width && py < height) {
                    const idx = (py * width + px) * 3;
                    pixels[idx + 0] = 25; pixels[idx + 1] = 25; pixels[idx + 2] = 32;
                }
            }
            for (let dx = 0; dx < SCALE; dx++) {
                const px = basePX + dx;
                const py = basePY + SCALE - 1;
                if (px < width && py < height) {
                    const idx = (py * width + px) * 3;
                    pixels[idx + 0] = 25; pixels[idx + 1] = 25; pixels[idx + 2] = 32;
                }
            }
        }
    }

    function drawWallEdge(tileX: number, tileZ: number, side: 'n' | 'e' | 's' | 'w', r: number, g: number, b: number) {
        const basePX = (tileX - region.minX) * SCALE;
        const basePY = ((region.maxZ - 1) - tileZ) * SCALE;
        const thickness = 2; // 2px thick walls at 8x scale

        let coords: [number, number][] = [];
        switch (side) {
            case 'n':
                for (let t = 0; t < thickness; t++)
                    for (let dx = 0; dx < SCALE; dx++) coords.push([basePX + dx, basePY + t]);
                break;
            case 's':
                for (let t = 0; t < thickness; t++)
                    for (let dx = 0; dx < SCALE; dx++) coords.push([basePX + dx, basePY + SCALE - 1 - t]);
                break;
            case 'w':
                for (let t = 0; t < thickness; t++)
                    for (let dy = 0; dy < SCALE; dy++) coords.push([basePX + t, basePY + dy]);
                break;
            case 'e':
                for (let t = 0; t < thickness; t++)
                    for (let dy = 0; dy < SCALE; dy++) coords.push([basePX + SCALE - 1 - t, basePY + dy]);
                break;
        }

        for (const [px, py] of coords) {
            if (px < 0 || px >= width || py < 0 || py >= height) continue;
            const idx = (py * width + px) * 3;
            pixels[idx + 0] = r;
            pixels[idx + 1] = g;
            pixels[idx + 2] = b;
        }
    }

    function drawDiagonalWall(tileX: number, tileZ: number, corner: 'nw' | 'ne' | 'se' | 'sw', r: number, g: number, b: number) {
        const basePX = (tileX - region.minX) * SCALE;
        const basePY = ((region.maxZ - 1) - tileZ) * SCALE;
        // Draw diagonal with perpendicular offsets so adjacent tiles connect smoothly
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
                if (px >= 0 && px < width && py >= 0 && py < height) {
                    const idx = (py * width + px) * 3;
                    pixels[idx] = r; pixels[idx + 1] = g; pixels[idx + 2] = b;
                }
            }
        }
    }

    console.log(`\nRendering ${region.name} (${tileW}x${tileH} tiles, ${width}x${height} px)...`);
    let rendered = 0;

    const headerSize = version >= 2 ? 24 : 20;
    let offset = headerSize;

    for (let i = 0; i < tileCount; i++) {
        const packed = view.getUint32(offset, true);
        const flags = view.getInt32(offset + 4, true);
        offset += 8;

        const z = packed & 0x3FFF;
        const x = (packed >> 14) & 0x3FFF;
        const level = (packed >> 28) & 0x3;

        if (level !== 0) continue;
        if (x < region.minX || x >= region.maxX || z < region.minZ || z >= region.maxZ) continue;
        rendered++;

        if (flags & (CollisionFlag.LOC | CollisionFlag.FLOOR)) {
            fillTile(x, z, 55, 55, 65, 210);
        }
        if (flags & CollisionFlag.ROOF) {
            fillTile(x, z, 90, 40, 110, 90);
        }
        // Cardinal walls
        if (flags & CollisionFlag.WALL_NORTH) drawWallEdge(x, z, 'n', 255, 80, 80);
        if (flags & CollisionFlag.WALL_EAST)  drawWallEdge(x, z, 'e', 80, 255, 80);
        if (flags & CollisionFlag.WALL_SOUTH) drawWallEdge(x, z, 's', 100, 150, 255);
        if (flags & CollisionFlag.WALL_WEST)  drawWallEdge(x, z, 'w', 255, 255, 80);
        // Diagonal walls
        if (flags & CollisionFlag.WALL_NORTH_WEST) drawDiagonalWall(x, z, 'nw', 255, 120, 50);
        if (flags & CollisionFlag.WALL_NORTH_EAST) drawDiagonalWall(x, z, 'ne', 50, 255, 120);
        if (flags & CollisionFlag.WALL_SOUTH_EAST) drawDiagonalWall(x, z, 'se', 120, 50, 255);
        if (flags & CollisionFlag.WALL_SOUTH_WEST) drawDiagonalWall(x, z, 'sw', 255, 180, 50);
    }

    // Doors
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
        if (x < region.minX || x >= region.maxX || z < region.minZ || z >= region.maxZ) continue;
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
        if (x < region.minX || x >= region.maxX || z < region.minZ || z >= region.maxZ) continue;
        closeDoorsRendered++;

        fillTile(x, z, 0, 220, 220, 255);
    }

    console.log(`  ${rendered} tiles, ${doorsRendered} doors, ${closeDoorsRendered} close-doors`);
    writePNG(`collision-crop-${region.name}.png`, width, height, pixels);
}

console.log(`\nLegend: Gray=LOC/Floor, Red=Wall N, Green=Wall E, Blue=Wall S, Yellow=Wall W, Purple=Roof, Orange=Door, Cyan=Close-Door`);
