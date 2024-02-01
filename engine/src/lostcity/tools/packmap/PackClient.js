import fs from 'fs';

import BZip2 from '#jagex2/io/BZip2.js';
import Packet from '#jagex2/io/Packet.js';
import { basename } from 'path';

function readMap(map) {
    let land = [];
    let loc = [];

    let section = null;
    for (let i = 0; i < map.length; i++) {
        let line = map[i];

        if (line.startsWith('====')) {
            section = line.slice(4, -4).slice(1, 4);
            continue;
        }

        if (section === 'MAP') {
            let parts = line.split(':');
            let [level, x, z] = parts[0].split(' ');
            let data = parts[1].slice(1).split(' ');

            if (!land[level]) {
                land[level] = [];
            }

            if (!land[level][x]) {
                land[level][x] = [];
            }

            land[level][x][z] = data;
        } else if (section === 'LOC') {
            let parts = line.split(':');
            let [level, x, z] = parts[0].split(' ');
            let data = parts[1].slice(1).split(' ');

            if (!loc[level]) {
                loc[level] = [];
            }

            if (!loc[level][x]) {
                loc[level][x] = [];
            }

            if (!loc[level][x][z]) {
                loc[level][x][z] = [];
            }

            loc[level][x][z].push(data);
        }
    }

    return { land, loc };
}

console.log('Packing client maps');
//console.time('maps');

fs.mkdirSync('data/pack/client/maps', { recursive: true });

let updates = [];

let mapFiles = fs.readdirSync('data/src/maps');
mapFiles.forEach((file, index) => {
    let [x, z] = file.slice(1).split('.').shift().split('_');

    let data = fs
        .readFileSync(`data/src/maps/${file}`, 'ascii')
        .replace(/\r/g, '')
        .split('\n')
        .filter(x => x.length);
    let map = readMap(data);

    // encode land data
    if (!fs.existsSync(`data/pack/client/maps/m${x}_${z}`) || fs.statSync(`data/src/maps/${file}`).mtimeMs > fs.statSync(`data/pack/client/maps/m${x}_${z}`).mtimeMs) {
        let levelHeightmap = [];
        let levelTileOverlayIds = [];
        let levelTileOverlayShape = [];
        let levelTileOverlayRotation = [];
        let levelTileFlags = [];
        let levelTileUnderlayIds = [];

        for (let level = 0; level < 4; level++) {
            if (!levelTileFlags[level]) {
                levelHeightmap[level] = [];
                levelTileOverlayIds[level] = [];
                levelTileOverlayShape[level] = [];
                levelTileOverlayRotation[level] = [];
                levelTileFlags[level] = [];
                levelTileUnderlayIds[level] = [];
            }

            for (let x = 0; x < 64; x++) {
                if (!levelTileFlags[level][x]) {
                    levelHeightmap[level][x] = [];
                    levelTileOverlayIds[level][x] = [];
                    levelTileOverlayShape[level][x] = [];
                    levelTileOverlayRotation[level][x] = [];
                    levelTileFlags[level][x] = [];
                    levelTileUnderlayIds[level][x] = [];
                }

                for (let z = 0; z < 64; z++) {
                    levelHeightmap[level][x][z] = 0;
                    levelTileOverlayIds[level][x][z] = -1;
                    levelTileOverlayShape[level][x][z] = -1;
                    levelTileOverlayRotation[level][x][z] = -1;
                    levelTileFlags[level][x][z] = -1;
                    levelTileUnderlayIds[level][x][z] = -1;
                }
            }
        }

        // parse land data
        for (let level = 0; level < 4; level++) {
            if (!map.land[level]) {
                continue;
            }

            for (let x = 0; x < 64; x++) {
                if (!map.land[level][x]) {
                    continue;
                }

                for (let z = 0; z < 64; z++) {
                    let tile = map.land[level][x][z];
                    if (!tile) {
                        continue;
                    }

                    for (let i = 0; i < tile.length; i++) {
                        let type = tile[i][0];
                        let info = tile[i].slice(1);

                        if (type === 'h') {
                            levelHeightmap[level][x][z] = Number(info);
                        } else if (type === 'o') {
                            let [id, shape, rotation] = info.split(';');

                            levelTileOverlayIds[level][x][z] = Number(id);

                            if (typeof shape !== 'undefined') {
                                levelTileOverlayShape[level][x][z] = Number(shape);
                            }

                            if (typeof rotation !== 'undefined') {
                                levelTileOverlayRotation[level][x][z] = Number(rotation);
                            }
                        } else if (type === 'f') {
                            levelTileFlags[level][x][z] = Number(info);
                        } else if (type === 'u') {
                            levelTileUnderlayIds[level][x][z] = Number(info);
                        }
                    }
                }
            }
        }

        // get size to pre-allocate
        let size = 64 * 64 * 4;
        for (let level = 0; level < 4; level++) {
            for (let x = 0; x < 64; x++) {
                for (let z = 0; z < 64; z++) {
                    let height = levelHeightmap[level][x][z];
                    let overlay = levelTileOverlayIds[level][x][z];

                    if (overlay != -1) {
                        size += 1;
                    }

                    if (height != 0) {
                        size += 1;
                    }
                }
            }
        }

        // encode into client format
        let out = Packet.alloc(size);
        for (let level = 0; level < 4; level++) {
            for (let x = 0; x < 64; x++) {
                for (let z = 0; z < 64; z++) {
                    let height = levelHeightmap[level][x][z];
                    let overlay = levelTileOverlayIds[level][x][z];
                    let shape = levelTileOverlayShape[level][x][z];
                    let rotation = levelTileOverlayRotation[level][x][z];
                    let flags = levelTileFlags[level][x][z];
                    let underlay = levelTileUnderlayIds[level][x][z];

                    if (height == 0 && overlay == -1 && flags == -1 && underlay == -1) {
                        // default values
                        out.p1(0);
                        continue;
                    }

                    if (overlay != -1) {
                        let opcode = 2;
                        if (shape != -1) {
                            opcode += shape << 2;
                        }
                        if (rotation != -1) {
                            opcode += rotation;
                        }
                        out.p1(opcode);
                        out.p1(overlay);
                    }

                    if (flags != -1) {
                        out.p1(flags + 49);
                    }

                    if (underlay != -1) {
                        out.p1(underlay + 81);
                    }

                    if (height != 0) {
                        // specific height
                        out.p1(1);
                        out.p1(height);
                    } else {
                        // perlin noise
                        out.p1(0);
                    }
                }
            }
        }

        out.save(`data/pack/server/maps/m${x}_${z}`);
        updates.push(`data/pack/server/maps/m${x}_${z}`);
    }

    // encode loc data
    if (!fs.existsSync(`data/pack/client/maps/l${x}_${z}`) || fs.statSync(`data/src/maps/${file}`).mtimeMs > fs.statSync(`data/pack/client/maps/l${x}_${z}`).mtimeMs) {
        let locs = {};

        for (let level = 0; level < 4; level++) {
            if (!map.loc[level]) {
                continue;
            }

            for (let x = 0; x < 64; x++) {
                if (!map.loc[level][x]) {
                    continue;
                }

                for (let z = 0; z < 64; z++) {
                    if (!map.loc[level][x][z]) {
                        continue;
                    }

                    let tile = map.loc[level][x][z];
                    for (let i = 0; i < tile.length; i++) {
                        let [id, type, rotation] = tile[i];

                        if (!locs[id]) {
                            locs[id] = [];
                        }

                        if (typeof type === 'undefined') {
                            type = 10;
                        }

                        if (typeof rotation === 'undefined') {
                            rotation = 0;
                        }

                        locs[id].push({
                            level,
                            x,
                            z,
                            type: Number(type),
                            rotation: Number(rotation)
                        });
                    }
                }
            }
        }

        let locIds = Object.keys(locs)
            .map(id => parseInt(id))
            .sort((a, b) => a - b);
        let out = new Packet();
        let lastLocId = -1;
        for (let i = 0; i < locIds.length; i++) {
            let locId = locIds[i];
            let locData = locs[locId];

            out.psmart(locId - lastLocId);
            lastLocId = locId;

            let lastLocData = 0;
            for (let j = 0; j < locData.length; j++) {
                let loc = locData[j];

                let currentLocData = (loc.level << 12) | (loc.x << 6) | loc.z;
                out.psmart(currentLocData - lastLocData + 1);
                lastLocData = currentLocData;

                let locInfo = (loc.type << 2) | loc.rotation;
                out.p1(locInfo);
            }

            out.psmart(0); // end of this loc
        }

        out.psmart(0); // end of map
        out.save(`data/pack/server/maps/l${x}_${z}`);
        updates.push(`data/pack/server/maps/l${x}_${z}`);
    }
});

fs.mkdirSync('data/pack/client/maps', { recursive: true });

BZip2.compressMany(updates, true);
for (let i = 0; i < updates.length; i++) {
    fs.renameSync(`${updates[i]}.bz2`, `data/pack/client/maps/${basename(updates[i])}`);
}
//console.timeEnd('maps');
