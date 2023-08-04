import fs from 'fs';

import BZip2 from '#jagex2/io/BZip2.js';
import Packet from '#jagex2/io/Packet.js';

let maps = fs.readdirSync('data/pack/client/maps');

function readLand(data) {
    // console.time('land');
    let heightmap = [];
    let overlayIds = [];
    let overlayShape = [];
    let overlayRotation = [];
    let flags = [];
    let underlay = [];

    for (let level = 0; level < 4; level++) {
        heightmap[level] = [];
        overlayIds[level] = [];
        overlayShape[level] = [];
        overlayRotation[level] = [];
        flags[level] = [];
        underlay[level] = [];

        for (let x = 0; x < 64; x++) {
            heightmap[level][x] = [];
            overlayIds[level][x] = [];
            overlayShape[level][x] = [];
            overlayRotation[level][x] = [];
            flags[level][x] = [];
            underlay[level][x] = [];

            for (let z = 0; z < 64; z++) {
                heightmap[level][x][z] = -1;
                overlayIds[level][x][z] = -1;
                overlayShape[level][x][z] = -1;
                overlayRotation[level][x][z] = -1;
                flags[level][x][z] = -1;
                underlay[level][x][z] = -1;

                while (true) {
                    let code = data.g1();
                    if (code === 0) {
                        break;
                    }

                    if (code === 1) {
                        heightmap[level][x][z] = data.g1();
                        break;
                    }

                    if (code <= 49) {
                        overlayIds[level][x][z] = data.g1s();
                        overlayShape[level][x][z] = Math.trunc((code - 2) / 4);
                        overlayRotation[level][x][z] = (code - 2) & 3;
                    } else if (code <= 81) {
                        flags[level][x][z] = code - 49;
                    } else {
                        underlay[level][x][z] = code - 81;
                    }
                }
            }
        }
    }

    // console.timeEnd('land');
    return { heightmap, overlayIds, overlayShape, overlayRotation, flags, underlay };
}

function readLocs(data) {
    let locs = [];

    for (let level = 0; level < 4; level++) {
        locs[level] = [];

        for (let x = 0; x < 64; x++) {
            locs[level][x] = [];

            for (let z = 0; z < 64; z++) {
                locs[level][x][z] = [];
            }
        }
    }

    let locId = -1;
    while (true) {
        let deltaId = data.gsmart();
        if (deltaId === 0) {
            break;
        }

        locId += deltaId;

        let locData = 0;
        while (true) {
            let deltaData = data.gsmart();
            if (deltaData === 0) {
                break;
            }

            locData += deltaData - 1;

            let locZ = locData & 0x3F;
            let locX = (locData >> 6) & 0x3F;
            let locLevel = locData >> 12;

            let locInfo = data.g1();
            let locShape = locInfo >> 2;
            let locRotation = locInfo & 3;

            locs[locLevel][locX][locZ].push({ id: locId, shape: locShape, rotation: locRotation });
        }
    }

    return locs;
}

maps.forEach(file => {
    if (!file.startsWith('m')) {
        return;
    }

    let parts = file.split('_');
    let mapX = parts[0].slice(1);
    let mapZ = parts[1];
    if (mapZ.indexOf('.') !== -1) {
        mapZ = mapZ.slice(0, mapZ.indexOf('.'));
    }
    console.log(`Unpacking map for ${mapX}_${mapZ}`);

    // console.time('read');
    let data = fs.readFileSync(`data/pack/client/maps/${file}`);
    // console.timeEnd('read');
    // console.time('decompress');
    if (file.indexOf('.') === -1) {
        data = BZip2.decompress(data.subarray(4));
    }
    // console.timeEnd('decompress');
    let land = readLand(new Packet(data));

    // console.time('write');
    let section = '';
    for (let level = 0; level < 4; level++) {
        for (let x = 0; x < 64; x++) {
            for (let z = 0; z < 64; z++) {
                let str = '';

                if (land.heightmap[level][x][z] !== -1) {
                    str += `h${land.heightmap[level][x][z]} `;
                }

                if (land.overlayIds[level][x][z] !== -1) {
                    if (land.overlayShape[level][x][z] !== -1 && land.overlayShape[level][x][z] !== 0 && land.overlayRotation[level][x][z] !== -1 && land.overlayRotation[level][x][z] !== 0) {
                        str += `o${land.overlayIds[level][x][z]};${land.overlayShape[level][x][z]};${land.overlayRotation[level][x][z]} `;
                    } else if (land.overlayShape[level][x][z] !== -1 && land.overlayShape[level][x][z] !== 0) {
                        str += `o${land.overlayIds[level][x][z]};${land.overlayShape[level][x][z]} `;
                    } else {
                        str += `o${land.overlayIds[level][x][z]} `;
                    }
                }

                if (land.flags[level][x][z] !== -1) {
                    str += `f${land.flags[level][x][z]} `;
                }

                if (land.underlay[level][x][z] !== -1) {
                    str += `u${land.underlay[level][x][z]} `;
                }

                if (str.length) {
                    section += `${level} ${x} ${z}: ${str.trimEnd()}\n`;
                }
            }
        }
    }
    fs.writeFileSync(`data/src/maps/m${mapX}_${mapZ}.jm2`, '==== MAP ====\n' + section);
    // console.timeEnd('write');
});

maps.forEach(file => {
    if (!file.startsWith('l')) {
        return;
    }

    let parts = file.split('_');
    let mapX = parts[0].slice(1);
    let mapZ = parts[1];
    if (mapZ.indexOf('.') !== -1) {
        mapZ = mapZ.slice(0, mapZ.indexOf('.'));
    }
    console.log(`Unpacking loc map for ${mapX}_${mapZ}`);

    // console.time('read');
    let data = fs.readFileSync(`data/pack/client/maps/${file}`);
    // console.timeEnd('read');
    // console.time('decompress');
    if (file.indexOf('.') === -1) {
        data = BZip2.decompress(data.subarray(4));
    }
    // console.timeEnd('decompress');
    let locs = readLocs(new Packet(data));

    let section = '';
    for (let level = 0; level < 4; level++) {
        for (let x = 0; x < 64; x++) {
            for (let z = 0; z < 64; z++) {
                if (!locs[level][x][z].length) {
                    continue;
                }

                for (let i = 0; i < locs[level][x][z].length; i++) {
                    let loc = locs[level][x][z][i];
                    if (loc.rotation === 0) {
                        section += `${level} ${x} ${z}: ${loc.id} ${loc.shape}\n`;
                    } else {
                        section += `${level} ${x} ${z}: ${loc.id} ${loc.shape} ${loc.rotation}\n`;
                    }
                }
            }
        }
    }

    fs.appendFileSync(`data/src/maps/m${mapX}_${mapZ}.jm2`, '\n==== LOC ====\n' + section);
});
