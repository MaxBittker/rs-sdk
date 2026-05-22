import fs from 'fs';

import FileStream from '#/io/FileStream.js';
import Environment from '#/util/Environment.js';
import { printFatalError, printWarning } from '#/util/Logger.js';
import Packet from '#/io/Packet.js';
import Jagfile from '#/io/Jagfile.js';
import { MapPack } from '#tools/pack/PackFile.js';

const cache = new FileStream('data/unpack', false, true);

const data = cache.read(0, 5);
if (!data) {
    printFatalError('No versionlist in cache');
}

const versionlist = new Jagfile(new Packet(data!));

if (!fs.existsSync(`${Environment.build.srcDir}/maps`)) {
    fs.mkdirSync(`${Environment.build.srcDir}/maps`, { recursive: true });
}

function readLand(data: Packet) {
    const heightmap: number[][][] = [];
    const overlayIds: number[][][] = [];
    const overlayShape: number[][][] = [];
    const overlayRotation: number[][][] = [];
    const flags: number[][][] = [];
    const underlay: number[][][] = [];

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
                    const code = data.g1();
                    if (code === 0) {
                        break;
                    }

                    if (code === 1) {
                        heightmap[level][x][z] = data.g1();
                        break;
                    }

                    if (code <= 49) {
                        overlayIds[level][x][z] = data.g1b();
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

    return {
        heightmap,
        overlayIds,
        overlayShape,
        overlayRotation,
        flags,
        underlay
    };
}

type Loc = {
    id: number;
    shape: number;
    angle: number;
};

function readLocs(data: Packet) {
    const locs: Loc[][][][] = [];

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
        const deltaId = data.gsmarts();
        if (deltaId === 0) {
            break;
        }

        locId += deltaId;

        let locData = 0;
        while (true) {
            const deltaData = data.gsmarts();
            if (deltaData === 0) {
                break;
            }

            locData += deltaData - 1;

            const locZ = locData & 0x3f;
            const locX = (locData >> 6) & 0x3f;
            const locLevel = locData >> 12;

            const locInfo = data.g1();
            const locShape = locInfo >> 2;
            const locAngle = locInfo & 3;

            locs[locLevel][locX][locZ].push({
                id: locId,
                shape: locShape,
                angle: locAngle
            });
        }
    }

    return locs;
}

MapPack.clear();

console.time('maps');
const mapIndex = versionlist.read('map_index')!;
for (let i = 0; i < mapIndex.length / 7; i++) {
    const region = mapIndex.g2();
    const landFile = mapIndex.g2();
    const locFile = mapIndex.g2();
    const _members = mapIndex.gbool();

    const mapX = (region >> 8) & 0xff;
    const mapZ = region & 0xff;

    MapPack.register(landFile, `m${mapX}_${mapZ}`);
    MapPack.register(locFile, `l${mapX}_${mapZ}`);

    const landData = cache.read(4, landFile, true);
    const locData = cache.read(4, locFile, true);
    if (!landData || !locData) {
        printWarning(`Missing map file for ${mapX}_${mapZ}`);
        continue;
    }

    // printInfo(`Unpacking map for ${mapX}_${mapZ}`);

    // todo: preserve npc and obj sections
    const saved = [];
    if (fs.existsSync(`${Environment.build.srcDir}/maps/m${mapX}_${mapZ}.jm2`)) {
        const existing = fs.readFileSync(`${Environment.build.srcDir}/maps/m${mapX}_${mapZ}.jm2`, 'utf8').split(/\r?\n/);

        let hasNpcObj = false;
        for (let i = 0; i < existing.length; i++) {
            const line = existing[i];
            if (line.startsWith('==== NPC ====') || line.startsWith('==== OBJ ====')) {
                hasNpcObj = true;
            }

            if (hasNpcObj) {
                saved.push(line);
            }
        }
    }

    if (landData) {
        const land = readLand(new Packet(landData));

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

        fs.writeFileSync(`${Environment.build.srcDir}/maps/m${mapX}_${mapZ}.jm2`, '==== MAP ====\n' + section);
    }

    if (locData) {
        const locs = readLocs(new Packet(locData));

        let section = '';
        for (let level = 0; level < 4; level++) {
            for (let x = 0; x < 64; x++) {
                for (let z = 0; z < 64; z++) {
                    if (!locs[level][x][z].length) {
                        continue;
                    }

                    for (let i = 0; i < locs[level][x][z].length; i++) {
                        const loc = locs[level][x][z][i];
                        if (loc.angle === 0) {
                            section += `${level} ${x} ${z}: ${loc.id} ${loc.shape}\n`;
                        } else {
                            section += `${level} ${x} ${z}: ${loc.id} ${loc.shape} ${loc.angle}\n`;
                        }
                    }
                }
            }
        }

        fs.appendFileSync(`${Environment.build.srcDir}/maps/m${mapX}_${mapZ}.jm2`, '\n==== LOC ====\n' + section);
    }

    if (saved.length) {
        fs.appendFileSync(`${Environment.build.srcDir}/maps/m${mapX}_${mapZ}.jm2`, '\n' + saved.join('\n'));
    }
}
console.timeEnd('maps');

MapPack.save();
