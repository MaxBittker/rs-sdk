#!/usr/bin/env bun
// Validates that collision-data.bin is a lossless encoding of collision-data.json
// Usage: bun scripts/validate-collision-bin.ts

import fs from 'fs';

const jsonPath = 'sdk/collision-data.json';
const binPath = 'sdk/collision-data.bin';

console.log('Loading JSON...');
const json = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

console.log('Loading binary...');
const buf = fs.readFileSync(binPath);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

// Validate header
const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
if (magic !== 'COLL') {
    console.error(`FAIL: Bad magic "${magic}", expected "COLL"`);
    process.exit(1);
}

const version = view.getUint32(4, true);
if (version !== 1) {
    console.error(`FAIL: Version ${version}, expected 1`);
    process.exit(1);
}

const tileCount = view.getUint32(8, true);
const zoneCount = view.getUint32(12, true);
const doorCount = view.getUint32(16, true);

console.log(`Binary header: ${tileCount} tiles, ${zoneCount} zones, ${doorCount} doors`);
console.log(`JSON counts:   ${json.tiles.length} tiles, ${json.zones.length} zones, ${(json.doors ?? []).length} doors`);

let errors = 0;

if (tileCount !== json.tiles.length) {
    console.error(`FAIL: Tile count mismatch (bin=${tileCount}, json=${json.tiles.length})`);
    errors++;
}
if (zoneCount !== json.zones.length) {
    console.error(`FAIL: Zone count mismatch (bin=${zoneCount}, json=${json.zones.length})`);
    errors++;
}
if (doorCount !== (json.doors ?? []).length) {
    console.error(`FAIL: Door count mismatch (bin=${doorCount}, json=${(json.doors ?? []).length})`);
    errors++;
}

function unpackCoord(packed: number): [number, number, number] {
    const z = packed & 0x3FFF;
    const x = (packed >> 14) & 0x3FFF;
    const level = (packed >> 28) & 0x3;
    return [level, x, z];
}

// Validate tiles
console.log('Validating tiles...');
const headerSize = 20;
let offset = headerSize;
for (let i = 0; i < tileCount && i < json.tiles.length; i++) {
    const packed = view.getUint32(offset, true);
    const flags = view.getInt32(offset + 4, true);
    const [level, x, z] = unpackCoord(packed);
    const [jLevel, jX, jZ, jFlags] = json.tiles[i];

    if (level !== jLevel || x !== jX || z !== jZ || flags !== jFlags) {
        if (errors < 10) {
            console.error(`FAIL: Tile ${i} mismatch — bin=[${level},${x},${z},${flags}] json=[${jLevel},${jX},${jZ},${jFlags}]`);
        }
        errors++;
    }
    offset += 8;
}

// Validate zones
console.log('Validating zones...');
for (let i = 0; i < zoneCount && i < json.zones.length; i++) {
    const packed = view.getUint32(offset, true);
    const [level, x, z] = unpackCoord(packed);
    const [jLevel, jX, jZ] = json.zones[i];

    if (level !== jLevel || x !== jX || z !== jZ) {
        if (errors < 10) {
            console.error(`FAIL: Zone ${i} mismatch — bin=[${level},${x},${z}] json=[${jLevel},${jX},${jZ}]`);
        }
        errors++;
    }
    offset += 4;
}

// Validate doors
console.log('Validating doors...');
const doors = json.doors ?? [];
for (let i = 0; i < doorCount && i < doors.length; i++) {
    const packed = view.getUint32(offset, true);
    const shape = view.getUint8(offset + 4);
    const angle = view.getUint8(offset + 5);
    const blockrange = view.getUint8(offset + 6);
    const [level, x, z] = unpackCoord(packed);
    const [jLevel, jX, jZ, jShape, jAngle, jBlockrange] = doors[i];

    if (level !== jLevel || x !== jX || z !== jZ || shape !== jShape || angle !== jAngle || blockrange !== jBlockrange) {
        if (errors < 10) {
            console.error(`FAIL: Door ${i} mismatch — bin=[${level},${x},${z},${shape},${angle},${blockrange}] json=[${jLevel},${jX},${jZ},${jShape},${jAngle},${jBlockrange}]`);
        }
        errors++;
    }
    offset += 7;
}

// Size check
const expectedSize = headerSize + tileCount * 8 + zoneCount * 4 + doorCount * 7;
if (buf.byteLength !== expectedSize) {
    console.error(`FAIL: File size ${buf.byteLength} != expected ${expectedSize}`);
    errors++;
}

if (errors === 0) {
    console.log(`\nPASS: Binary is a lossless encoding of JSON (${tileCount} tiles, ${zoneCount} zones, ${doorCount} doors)`);
    console.log(`JSON: ${(fs.statSync(jsonPath).size / 1024 / 1024).toFixed(2)} MB → Binary: ${(fs.statSync(binPath).size / 1024 / 1024).toFixed(2)} MB`);
} else {
    console.error(`\nFAIL: ${errors} error(s) found`);
    process.exit(1);
}
