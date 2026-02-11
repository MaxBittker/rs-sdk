import fs from 'fs';
import path from 'path';

const JSON_PATH = path.join(__dirname, '../sdk/collision-data.json');
const BIN_PATH = path.join(__dirname, '../sdk/collision-data.bin');

interface CollisionData {
    tiles: Array<[number, number, number, number]>;
    zones: Array<[number, number, number]>;
    doors: Array<[number, number, number, number, number, number]>;
}

function pack() {
    console.log(`Reading ${JSON_PATH}...`);
    const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')) as CollisionData;

    const tileCount = data.tiles.length;
    const zoneCount = data.zones.length;
    const doorCount = data.doors.length;

    console.log(`Packing ${tileCount} tiles, ${zoneCount} zones, ${doorCount} doors...`);

    // Binary Format:
    // Header (16 bytes): TileCount(4), ZoneCount(4), DoorCount(4), Magic(4)
    // Tiles (tileCount * 8 bytes): Level(1), X(2), Z(2), Flags(3) -> packed into 8 bytes [level(1), x(2), z(2), padding(3)] + [flags(4)]
    // Zones (zoneCount * 4 bytes): Level(1), ZoneX(1), ZoneZ(1), Padding(1) or [Level(1), ZoneBaseX(2), ZoneBaseZ(2)]
    //   Actually let's stick to simple layout:
    //   Tiles: 8 bytes each (Level mod 4 | X << 2 | Z << 16) | (Flags << 32) -- wait JS bitwise is 32-bit.
    //   Let's do 2x 32-bit words per tile: 
    //     Word 1: Level (2 bits), X (15 bits: 0-32767), Z (15 bits: 0-32767)
    //     Word 2: Flags (32 bits)
    //   Zones: 1x 32-bit word: Level (2 bits), ZoneBaseX (15 bits), ZoneBaseZ (15 bits)
    //   Doors: 3x 32-bit words:
    //     Word 1: Level (2 bits), X (15 bits), Z (15 bits)
    //     Word 2: Shape (8), Angle (8), BlockRange (8), Padding (8)
    //     Word 3: Int32 flags or metadata? PR 28 uses [level, x, z, shape, angle, blockrange].

    const buffer = new ArrayBuffer(16 + (tileCount * 8) + (zoneCount * 4) + (doorCount * 12));
    const view = new DataView(buffer);
    let offset = 0;

    // Header
    view.setUint32(offset, tileCount, true); offset += 4;
    view.setUint32(offset, zoneCount, true); offset += 4;
    view.setUint32(offset, doorCount, true); offset += 4;
    view.setUint32(offset, 0x52534357, true); offset += 4; // "RSCW" magic

    // Tiles
    for (const [level, x, z, flags] of data.tiles) {
        // Word 1: level(2) | x(15) << 2 | z(15) << 17
        const packedCoords = (level & 0x3) | ((x & 0x7FFF) << 2) | ((z & 0x7FFF) << 17);
        view.setUint32(offset, packedCoords, true); offset += 4;
        view.setInt32(offset, flags, true); offset += 4;
    }

    // Zones
    for (const [level, bx, bz] of data.zones) {
        const packedZone = (level & 0x3) | ((bx & 0x7FFF) << 2) | ((bz & 0x7FFF) << 17);
        view.setUint32(offset, packedZone, true); offset += 4;
    }

    // Doors
    for (const [level, x, z, shape, angle, blockrange] of data.doors) {
        const packedCoords = (level & 0x3) | ((x & 0x7FFF) << 2) | ((z & 0x7FFF) << 17);
        view.setUint32(offset, packedCoords, true); offset += 4;
        view.setUint8(offset, shape); offset += 1;
        view.setUint8(offset, angle); offset += 1;
        view.setUint8(offset, blockrange); offset += 1;
        view.setUint8(offset, 0); offset += 1; // padding
        view.setUint32(offset, 0, true); offset += 4; // extra flags word
    }

    fs.writeFileSync(BIN_PATH, Buffer.from(buffer));
    console.log(`Done! Created ${BIN_PATH} (${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
}

pack();
