import fs from 'fs';

import { LocShape } from '@2004scape/rsmod-pathfinder';

import FloType from '#/cache/config/FloType.js';
import LocType from '#/cache/config/LocType.js';
import NpcType from '#/cache/config/NpcType.js';
import { CoordGrid } from '#/engine/CoordGrid.js';
import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';
import { printWarning } from '#/util/Logger.js';
import { convertImage } from '#tools/pack/PixPack.js';
import { openArtifactStore } from '#tools/pack/ArtifactCache.js';
import { MapPack } from '#tools/pack/PackFile.js';

export async function packWorldmap() {
    const zipPath = 'data/pack/.cache/maps-server.zip';
    if (!fs.existsSync(zipPath)) {
        throw new Error(`${zipPath} is missing; pack maps before building the worldmap`);
    }

    FloType.load('data/pack');
    LocType.load('data/pack');
    NpcType.load('data/pack');

    const serverStore = openArtifactStore('maps-server');

    // ---

    const jag = Jagfile.new();

    // ----

    const underlay = Packet.alloc(20_000_000);
    const overlay = Packet.alloc(20_000_000);
    const loc = Packet.alloc(20_000_000);
    const obj = Packet.alloc(5);
    const npc = Packet.alloc(5);
    const multi = Packet.alloc(5);
    const free = Packet.alloc(5);

    function unpackCoord(packed: number): { level: number; x: number; z: number } {
        const z: number = packed & 0x3f;
        const x: number = (packed >> 6) & 0x3f;
        const level: number = (packed >> 12) & 0x3;
        return { x, z, level };
    }

    function processCsv(contents: string[], name: string): Set<number> {
        const result = new Set<number>();
        for (let i = 0; i < contents.length; i++) {
            if (contents[i].startsWith('//') || !contents[i].length) {
                continue;
            }

            const parts = contents[i].split(',');
            if (parts.length === 2) {
                const [from, to] = parts;
                const [fromLevel, fromMx, fromMz, fromLx, fromLz] = from.split('_').map(x => parseInt(x));
                const [_toLevel, toMx, toMz, toLx, toLz] = to.split('_').map(x => parseInt(x));

                if (fromLx % 8 !== 0 || fromLz % 8 !== 0 || toLx % 8 !== 7 || toLz % 8 !== 7 || fromMx > toMx || fromMz > toMz || (fromMx <= toMx && fromMz <= toMz && (fromLx > toLx || fromLz > toLz))) {
                    printWarning(`${name} map not aligned to a zone ${contents[i]}`);
                }

                const startX = (fromMx << 6) + fromLx;
                const startZ = (fromMz << 6) + fromLz;
                const endX = (toMx << 6) + toLx;
                const endZ = (toMz << 6) + toLz;

                for (let x = startX; x <= endX; x++) {
                    for (let z = startZ; z <= endZ; z++) {
                        if (result.has(CoordGrid.packCoord(fromLevel, x, z))) {
                            printWarning(`Overlapping ${name} map ${contents[i]}`);
                        }
                        result.add(CoordGrid.packCoord(fromLevel, x, z));
                    }
                }
            } else {
                const [level, mx, mz, lx, lz] = contents[i].split('_').map(x => parseInt(x));

                for (let i = 0; i < 8; i++) {
                    for (let j = 0; j < 8; j++) {
                        result.add(CoordGrid.packCoord(level, (mx << 6) + lx + i, (mz << 6) + lz + j));
                    }
                }
            }
        }
        return result;
    }

    // easiest solution for the time being
    const multiway = fs.readFileSync(`${Environment.build.srcDir}/maps/multiway.csv`, 'ascii').split(/\r?\n/);
    const multimap = processCsv(multiway, 'multiway');

    const free2play = fs.readFileSync(`${Environment.build.srcDir}/maps/free2play.csv`, 'ascii').split(/\r?\n/);
    const freemap = processCsv(free2play, 'free');

    const ignoreraw = fs.readFileSync(`${Environment.build.srcDir}/maps/ignore.csv`, 'ascii').split(/\r?\n/);
    const ignoremap = processCsv(ignoreraw, 'ignore');

    for (let mapId = 0; mapId < MapPack.max; mapId++) {
        const mapName = MapPack.getById(mapId);
        if (!mapName.startsWith('m') || !serverStore.has(mapName)) {
            continue;
        }

        const [mx, mz] = mapName
            .substring(1)
            .split('_')
            .map((x: string) => parseInt(x));

        if (ignoremap.has(CoordGrid.packCoord(0, mx << 6, mz << 6))) {
            continue;
        }

        let level = 0;
        if (mx == 33 && mz >= 71 && mz <= 73) {
            // exception for underground pass
            level = 1;
        }

        // ----

        const flags: number[][][] = [];
        // const heightmap: number[][][] = [];
        const overlayIds: number[][][] = [];
        const overlayShape: number[][][] = [];
        const overlayRotation: number[][][] = [];
        const underlayIds: number[][][] = [];
        for (let level: number = 0; level < 4; level++) {
            flags[level] = [];
            // heightmap[level] = [];
            overlayIds[level] = [];
            overlayShape[level] = [];
            overlayRotation[level] = [];
            underlayIds[level] = [];

            for (let x: number = 0; x < 64; x++) {
                flags[level][x] = [];
                // heightmap[level][x] = [];
                overlayIds[level][x] = [];
                overlayShape[level][x] = [];
                overlayRotation[level][x] = [];
                underlayIds[level][x] = [];

                for (let z: number = 0; z < 64; z++) {
                    flags[level][x][z] = 0;
                    // heightmap[level][x][z] = 0;
                    overlayIds[level][x][z] = -1;
                    overlayShape[level][x][z] = 0;
                    overlayRotation[level][x][z] = 0;
                    underlayIds[level][x][z] = -1;
                }
            }
        }

        const landData = serverStore.read(mapName);
        if (!landData) {
            continue;
        }
        const landBuf = new Packet(landData);
        for (let level: number = 0; level < 4; level++) {
            for (let x: number = 0; x < 64; x++) {
                for (let z: number = 0; z < 64; z++) {
                    while (true) {
                        const opcode = landBuf.g1();
                        if (opcode === 0) {
                            break;
                        } else if (opcode === 1) {
                            landBuf.g1();
                            break;
                        }

                        if (opcode <= 49) {
                            overlayIds[level][x][z] = landBuf.g1();
                            overlayShape[level][x][z] = (opcode - 2) / 4;
                            overlayRotation[level][x][z] = (opcode - 2) & 0x3;
                        } else if (opcode <= 81) {
                            flags[level][x][z] = opcode - 49;
                        } else {
                            underlayIds[level][x][z] = opcode - 81;
                        }
                    }
                }
            }
        }

        overlay.p1(mx);
        overlay.p1(mz);
        underlay.p1(mx);
        underlay.p1(mz);

        for (let x: number = 0; x < 64; x++) {
            for (let z: number = 0; z < 64; z++) {
                const bridged: boolean = (flags[1][x][z] & 0x2) === 2;
                const actualLevel = (bridged ? 1 : 0) + level;

                if (overlayIds[actualLevel][x][z] !== -1) {
                    overlay.p1(overlayIds[actualLevel][x][z]);
                    overlay.p1(overlayRotation[actualLevel][x][z] + (overlayShape[actualLevel][x][z] << 2));
                } else {
                    overlay.p1(0);
                }

                if (underlayIds[actualLevel][x][z] !== -1) {
                    underlay.p1(underlayIds[actualLevel][x][z]);
                } else {
                    underlay.p1(0);
                }
            }
        }

        // ----

        const walls: number[][][] = [];
        const mapscenes: number[][][] = [];
        const mapfunctions: number[][][] = [];
        for (let level = 0; level < 4; level++) {
            walls[level] = [];
            mapscenes[level] = [];
            mapfunctions[level] = [];

            for (let x = 0; x < 64; x++) {
                walls[level][x] = [];
                mapscenes[level][x] = [];
                mapfunctions[level][x] = [];

                for (let z = 0; z < 64; z++) {
                    mapscenes[level][x][z] = -1;
                    walls[level][x][z] = -1;
                    mapfunctions[level][x][z] = -1;
                }
            }
        }

        const locData = serverStore.read(`l${mx}_${mz}`);
        if (!locData) {
            continue;
        }
        const locBuf = new Packet(locData);
        let locId: number = -1;
        let locIdOffset: number = locBuf.gsmarts();
        while (locIdOffset !== 0) {
            locId += locIdOffset;

            let coord: number = 0;
            let coordOffset: number = locBuf.gsmarts();

            while (coordOffset !== 0) {
                const { x, z, level } = unpackCoord((coord += coordOffset - 1));

                const info: number = locBuf.g1();
                coordOffset = locBuf.gsmarts();

                const bridged: boolean = (level === 1 ? flags[level][x][z] & 0x2 : flags[1][x][z] & 0x2) === 2;
                const actualLevel: number = bridged ? level - 1 : level;
                if (actualLevel < 0) {
                    continue;
                }

                const type: LocType = LocType.get(locId);
                const shape: number = info >> 2;
                const angle: number = info & 0x3;

                if (type.mapscene === 22) {
                    // hiding a dumb sprite
                    continue;
                }

                if (walls[actualLevel][x][z] === -1) {
                    // wall 1 - west
                    // wall 2 - north
                    // wall 3 - east
                    // wall 4 - south
                    // wall 5 - active wall 1
                    // wall 6 - active wall 2
                    // wall 7 - active wall 3
                    // wall 8 - active wall 4

                    // wall 9 - north-west square corner
                    // wall 10 - north-east square corner
                    // wall 11 - south-east square corner
                    // wall 12 - south-west square corner
                    // wall 13 - active wall 9
                    // wall 14 - active wall 10
                    // wall 15 - active wall 11
                    // wall 16 - active wall 12

                    // wall 17 - walldecor west
                    // wall 18 - walldecor north
                    // wall 19 - walldecor east
                    // wall 20 - walldecor south
                    // wall 21 - active wall 17
                    // wall 22 - active wall 18
                    // wall 23 - active wall 19
                    // wall 24 - active wall 20

                    // wall 25 - diagonal SW-NE /
                    // wall 26 - diagonal NW-SE \
                    // wall 27 - active wall 25 (original applet is bugged)
                    // wall 28 - active wall 26 (original applet is bugged)

                    if (shape == LocShape.WALL_STRAIGHT) {
                        walls[actualLevel][x][z] = 1 + angle;

                        if (type.active) {
                            walls[actualLevel][x][z] += 4;
                        }
                    } else if (shape === LocShape.WALL_L) {
                        // may need more work
                        walls[actualLevel][x][z] = 9 + angle;

                        if (type.active) {
                            walls[actualLevel][x][z] += 4;
                        }
                    } else if (shape === LocShape.WALLDECOR_STRAIGHT_NOOFFSET) {
                        walls[actualLevel][x][z] = 17 + angle;

                        if (type.active) {
                            walls[actualLevel][x][z] += 4;
                        }
                    } else if (shape === LocShape.WALL_DIAGONAL) {
                        walls[actualLevel][x][z] = 25 + (angle % 2);

                        if (type.active) {
                            walls[actualLevel][x][z] += 2;
                        }
                    }
                }

                if (type.mapscene !== -1) {
                    mapscenes[actualLevel][x][z] = type.mapscene;
                }

                if (type.mapfunction !== -1) {
                    mapfunctions[actualLevel][x][z] = type.mapfunction;
                }
            }
            locIdOffset = locBuf.gsmarts();
        }

        loc.p1(mx);
        loc.p1(mz);

        for (let x = 0; x < 64; x++) {
            for (let z = 0; z < 64; z++) {
                if (walls[level][x][z] !== -1) {
                    loc.p1(walls[level][x][z]);
                }

                if (mapscenes[level][x][z] !== -1) {
                    loc.p1(29 + mapscenes[level][x][z]);
                }

                if (mapfunctions[level][x][z] !== -1) {
                    loc.p1(160 + mapfunctions[level][x][z]);
                }

                loc.p1(0);
            }
        }

        // ----

        const objs: number[][][] = [];
        for (let level = 0; level < 4; level++) {
            objs[level] = [];

            for (let x = 0; x < 64; x++) {
                objs[level][x] = [];

                for (let z = 0; z < 64; z++) {
                    objs[level][x][z] = -1;
                }
            }
        }

        const objData = serverStore.read(`o${mx}_${mz}`) ?? new Uint8Array();
        const objBuf = new Packet(objData);
        if (objBuf.data.length > 0) {
            while (objBuf.available > 0) {
                const pos = objBuf.g2();
                const level = (pos >> 12) & 0x3;
                const localX = (pos >> 6) & 0x3f;
                const localZ = pos & 0x3f;

                const count = objBuf.g1();
                for (let j = 0; j < count; j++) {
                    const objId = objBuf.g2();
                    const _objCount = objBuf.g1();
                    objs[level][localX][localZ] = objId;
                }
            }

            obj.p1(mx);
            obj.p1(mz);

            for (let x = 0; x < 64; x++) {
                for (let z = 0; z < 64; z++) {
                    obj.pbool(objs[level][x][z] !== -1);
                }
            }
        }

        // ---

        const npcs: number[][][] = [];
        for (let level = 0; level < 4; level++) {
            npcs[level] = [];

            for (let x = 0; x < 64; x++) {
                npcs[level][x] = [];

                for (let z = 0; z < 64; z++) {
                    npcs[level][x][z] = -1;
                }
            }
        }

        const npcData = serverStore.read(`n${mx}_${mz}`) ?? new Uint8Array();
        const npcBuf = new Packet(npcData);
        if (npcBuf.data.length > 0) {
            while (npcBuf.available > 0) {
                const pos = npcBuf.g2();
                const level = (pos >> 12) & 0x3;
                const localX = (pos >> 6) & 0x3f;
                const localZ = pos & 0x3f;

                const count = npcBuf.g1();
                for (let j = 0; j < count; j++) {
                    const id = npcBuf.g2();
                    const type = NpcType.get(id);

                    if (type.minimap) {
                        npcs[level][localX][localZ] = id;
                    }
                }
            }

            npc.p1(mx);
            npc.p1(mz);

            for (let x = 0; x < 64; x++) {
                for (let z = 0; z < 64; z++) {
                    npc.pbool(npcs[level][x][z] !== -1);
                }
            }
        }

        // ---

        const multiTiles: boolean[][][] = [];
        let hasMulti = false;
        for (let level = 0; level < 4; level++) {
            multiTiles[level] = [];

            for (let x = 0; x < 64; x++) {
                multiTiles[level][x] = [];

                for (let z = 0; z < 64; z++) {
                    multiTiles[level][x][z] = false;

                    if (multimap.has(CoordGrid.packCoord(level, (mx << 6) + x, (mz << 6) + z))) {
                        multiTiles[level][x][z] = true;
                        hasMulti = true;
                    }
                }
            }
        }

        if (hasMulti) {
            multi.p1(mx);
            multi.p1(mz);

            for (let x = 0; x < 64; x++) {
                for (let z = 0; z < 64; z++) {
                    multi.pbool(multiTiles[0][x][z]);
                }
            }
        }

        // ---

        const freeTiles: boolean[][][] = [];
        let hasFree = false;
        for (let level = 0; level < 4; level++) {
            freeTiles[level] = [];

            for (let x = 0; x < 64; x++) {
                freeTiles[level][x] = [];

                for (let z = 0; z < 64; z++) {
                    freeTiles[level][x][z] = false;

                    if (freemap.has(CoordGrid.packCoord(level, (mx << 6) + x, (mz << 6) + z))) {
                        freeTiles[level][x][z] = true;
                        hasFree = true;
                    }
                }
            }
        }

        if (hasFree) {
            free.p1(mx);
            free.p1(mz);

            for (let x = 0; x < 64; x++) {
                for (let z = 0; z < 64; z++) {
                    free.pbool(freeTiles[0][x][z]);
                }
            }
        }
    }

    const floorcol = Packet.alloc(1);
    floorcol.p2(FloType.configs.length);

    const refColors = [
        [0x00000038, 0x00847776], // debugname=cliff overlay=true occlude=true rgb=0xaaaaaa
        [0x00000016, 0x00504746], // debugname=cliff2 overlay=true occlude=true rgb=0x444444
        [0x00000022, 0x00564d4d], // debugname=cliff3 overlay=true occlude=true rgb=0x666666
        [0x0000002d, 0x00766a69], // debugname=cliff4 overlay=true occlude=true rgb=0x888888
        [0x00000000, 0x003a1c0c], // debugname=woodenfloor overlay=true occlude=true rgb=0x000000 texture=planks
        [0x00000000, 0x004f648d], // debugname=water overlay=true occlude=true rgb=0x000000 texture=water
        [0x00000000, 0x001f6248], // debugname=gungywater overlay=true occlude=true rgb=0x000000 texture=gungywater
        [0x0000001e, 0x00504746], // debugname=greyroof overlay=true occlude=true rgb=0x5b5b5b
        [0x01500053, 0x00bbb9b2], // debugname=desertroof overlay=true occlude=true rgb=0xfffff5
        [0x0000001a, 0x00463f3f], // debugname=road overlay=true occlude=true rgb=0x505050
        [0x0000000b, 0x00100f0f], // debugname=darkstone overlay=true occlude=true rgb=0x222222
        [0x00000000, 0x003f3934], // debugname=pebblefloor overlay=true occlude=true rgb=0x000000 texture=pebblefloor
        [0x0000a822, 0x0095342f], // debugname=redfloor overlay=true occlude=true rgb=0x993333
        [0x0090ec0c, 0x00503911], // debugname=mudfloor overlay=true occlude=true rgb=0x3d2b0b
        [0x0090ec0c, 0x003b250c], // debugname=mudfloor_bump overlay=true occlude=true rgb=0x3d2b0b
        [0x00715411, 0x00674204], // debugname=mudfloor2 overlay=true occlude=true rgb=0x663300
        [0x00715411, 0x004f3a03], // debugname=mudfloor2_bump overlay=true occlude=true rgb=0x663300
        [0x03815422, 0x0012068c], // debugname=bluefloor overlay=true occlude=true rgb=0x0000cc
        [0x00000000, 0x00e15f15], // debugname=lava overlay=true occlude=true rgb=0x000000 texture=lava
        [0x00000000, 0x004d4d4f], // debugname=marble overlay=true occlude=true rgb=0x000000 texture=marble
        [0x00915419, 0x00887006], // debugname=sandfloor overlay=true occlude=true rgb=0x996600
        [0x00a09419, 0x00544a24], // debugname=l_brownfloor1 overlay=true occlude=true rgb=0x6d5b2b
        [0x00a09419, 0x00605528], // debugname=l_brownfloor1_bump overlay=true occlude=true rgb=0x6d5b2b
        [0x00000000, 0x0038322d], // debugname=cliff_textured overlay=true occlude=true rgb=0x000000 texture=rockwall
        [0x00b09435, 0x00c09757], // debugname=sand_cliff overlay=true occlude=true rgb=0xcbba76
        [0x00c06821, 0x00786d42], // debugname=sand_rock overlay=true occlude=true rgb=0x827944
        [0x00000000, 0x00282011], // debugname=oldbrick overlay=true occlude=true rgb=0x000000 texture=mossybricks
        [0x00000000, 0x00595650], // debugname=brick overlay=true occlude=true rgb=0x000000 texture=wall
        [0x01611c14, 0x0036760f], // debugname=grass overlay=true occlude=true rgb=0x35720a
        [0x0150004f, 0x00aea5a4], // debugname=ice_overlay overlay=true occlude=true rgb=0xeeeeee
        [0x00a11012, 0x003b3507], // debugname=upass_floor overlay=true occlude=true rgb=0x654d0b
        [0x00000000, 0x00363029], // debugname=stone_texture overlay=true occlude=true rgb=0x000000 texture=mossy
        [0x0150004a, 0x00b6babe], // debugname=ice_overlay_blue overlay=true occlude=true rgb=0xc9ddf7
        [0x0000001a, 0x003e3836], // debugname=road_bridge overlay=true occlude=true rgb=0x505050
        [0x00000000, 0x003a1c0c], // debugname=woodenfloor_bridge overlay=true occlude=true rgb=0x000000 texture=planks
        [0x0080f013, 0x005b4d14], // debugname=mud5_overlay overlay=true occlude=true rgb=0x664411
        [0x00000000, 0x00060404], // debugname=black overlay=true occlude=true rgb=0x000000
        [0x03106027, 0x0058697c], // debugname=lightblue overlay=true occlude=true rgb=0x557799
        [0x00000000, 0x00799ed7], // debugname=water_fountain overlay=true occlude=true rgb=0x000000 texture=fountain
        [0x03808427, 0x00404995], // debugname=bluefloor2 overlay=true occlude=true rgb=0x4749a3
        [0x03107420, 0x00324a5b], // debugname=waterfallblue overlay=true occlude=true rgb=0x3f6181
        [0xff21542a, 0x00503000], // debugname=invisible overlay=true occlude=false rgb=0xff00ff
        [0xff21542a, 0x00503000], // debugname=invisible_occ overlay=true occlude=true rgb=0xff00ff
        [0x0000001a, 0x0046403f], // debugname=road_no_occlude overlay=true occlude=false rgb=0x505050
        [0x00000000, 0x003a1c0c], // debugname=woodenfloor_no_occlude overlay=true occlude=false rgb=0x000000 texture=planks
        [0x00000000, 0x00282011], // debugname=oldbrick_no_occlude overlay=true occlude=false rgb=0x000000 texture=mossybricks
        [0x00000000, 0x00595650], // debugname=brick_no_occlude overlay=true occlude=false rgb=0x000000 texture=wall
        [0x01611c14, 0x00154301], // debugname=grassland overlay=false occlude=true rgb=0x35720a
        [0x01011413, 0x002c3306], // debugname=muddygrass overlay=false occlude=true rgb=0x58680b
        [0x00c11c15, 0x0064630c], // debugname=vmuddygrass overlay=false occlude=true rgb=0x78680b
        [0x0141181f, 0x00569006], // debugname=lightgrass overlay=false occlude=true rgb=0x6cac10
        [0x0110ac21, 0x00747a26], // debugname=sandygrass overlay=false occlude=true rgb=0x819531
        [0x00d10c0f, 0x003f3407], // debugname=swamp overlay=false occlude=true rgb=0x55520a
        [0x0250e011, 0x0014412b], // debugname=swamp2 overlay=false occlude=true rgb=0x125841
        [0x00000027, 0x00544b4a], // debugname=lightrock overlay=false occlude=true rgb=0x767676
        [0x00000019, 0x00423b3b], // debugname=darkrock overlay=false occlude=true rgb=0x4d4d4d
        [0x0000000f, 0x001b1717], // debugname=verydarkrock overlay=false occlude=true rgb=0x2e2e2e
        [0x0150004f, 0x00aea4a4], // debugname=ice overlay=false occlude=false rgb=0xeeeeee
        [0x01500049, 0x009699a2], // debugname=blueice overlay=false occlude=true rgb=0xd1d6e7
        [0x01500049, 0x0097a498], // debugname=greenice overlay=false occlude=true rgb=0xd1e7d6
        [0x00c0742b, 0x00847349], // debugname=desert1 overlay=false occlude=true rgb=0xada055
        [0x00b0a436, 0x00cdbe41], // debugname=desert2 overlay=false occlude=true rgb=0xd0c074
        [0x0090ec0c, 0x004a3817], // debugname=mud1 overlay=false occlude=true rgb=0x3d2b0b
        [0x0090b415, 0x003c351a], // debugname=mud2 overlay=false occlude=true rgb=0x644e1e
        [0x00a11012, 0x0045310f], // debugname=mud3 overlay=false occlude=true rgb=0x654d0b
        [0x00715411, 0x005b3303], // debugname=mud4 overlay=false occlude=true rgb=0x663300
        [0x0080f013, 0x00382906], // debugname=mud5 overlay=false occlude=false rgb=0x664411
        [0x00b09435, 0x00a39845], // debugname=sand overlay=false occlude=true rgb=0xcbba76
        [0x0090b415, 0x005b431c], // debugname=mud2_skew overlay=false occlude=false rgb=0x644e1e
        [0x00a11012, 0x004a3003], // debugname=mud3_skew overlay=false occlude=false rgb=0x654d0b
        [0x00715411, 0x004f2d03], // debugname=mud4_skew overlay=false occlude=false rgb=0x663300
        [0x00000001, 0x00060404], // debugname=black_rock overlay=false occlude=false rgb=0x030303
        [0x03106027, 0x004b6387], // debugname=dullblue overlay=false occlude=true rgb=0x557799
        [0xffd06027, 0x00745453], // debugname=purple_pink overlay=false occlude=true rgb=0x995566
        [0x03106027, 0x00416075], // debugname=lightblue_underlay overlay=false occlude=true rgb=0x557799
        [0x00b0a82d, 0x00a47a33], // debugname=desert_shadow overlay=true occlude=true rgb=0xc4ac4e
        [0x0080782f, 0x00816648], // debugname=duel_arena overlay=true occlude=true rgb=0xb79767
        [0x0080283c, 0x00bfa054], // debugname=duelarena overlay=false occlude=true rgb=0xd9bb93
        [0x00b06826, 0x00817a38], // debugname=hive overlay=true occlude=true rgb=0x97874f
        [0x0080a41c, 0x00775032], // debugname=agility overlay=true occlude=true rgb=0x7d5b2b
        [0x00909012, 0x00483c28], // debugname=brownmud overlay=true occlude=true rgb=0x504020
        [0x0090301a, 0x003a3529], // debugname=mountain_overlay overlay=true occlude=true rgb=0x5c5444
        [0x00903014, 0x0028261c], // debugname=mountain_dark_overlay overlay=true occlude=true rgb=0x464034
        [0x00000000, 0x007c693b], // debugname=elfbrick overlay=true occlude=true rgb=0x000000 texture=elfbrick
        [0x01203c0f, 0x002c321c], // debugname=elf_wastelands overlay=true occlude=true rgb=0x303525
        [0x00015407, 0x000a0100], // debugname=dark_red overlay=true occlude=true rgb=0x2d0000
        [0x0390601d, 0x00322d50], // debugname=grey_blue overlay=true occlude=true rgb=0x423f73
        [0x00a04417, 0x00605435], // debugname=viking_town_overlay overlay=true occlude=true rgb=0x544d37
        [0x0090b814, 0x00362811], // debugname=viking_mud_overlay overlay=true occlude=true rgb=0x5e461c
        [0x00903c0d, 0x000f0e0b], // debugname=viking_cave_overlay overlay=true occlude=true rgb=0x2e2920
        [0x00909012, 0x002f271a], // debugname=legendssword_cave overlay=true occlude=true rgb=0x504020
        [0x0090301a, 0x00494133], // debugname=mountain overlay=false occlude=true rgb=0x5c5444
        [0x01906416, 0x00344e2b], // debugname=darkgrass overlay=false occlude=true rgb=0x38562f
        [0x00903014, 0x002b251e], // debugname=mountain_dark overlay=false occlude=true rgb=0x464034
        [0x03108c23, 0x00295163], // debugname=grey_blue_underlay overlay=false occlude=true rgb=0x3e6995
        [0x00a0c40f, 0x004e4818], // debugname=autumnal overlay=false occlude=true rgb=0x4b3e14
        [0x00a04419, 0x00443e30], // debugname=viking_town overlay=false occlude=true rgb=0x5c543c
        [0x00a0440d, 0x001d1b15], // debugname=viking_town_dark overlay=false occlude=true rgb=0x2f2b1f
        [0x01c0a018, 0x00224f22], // debugname=jungle_green overlay=false occlude=true rgb=0x276d27
        [0x0150dc13, 0x00466b17], // debugname=jungle_dark_green overlay=false occlude=true rgb=0x396215
        [0x00a0c011, 0x0055431b], // debugname=mm_town_overlay overlay=true occlude=true rgb=0x544217
        [0x01203c0f, 0x00303224], // debugname=slayer_tower overlay=true occlude=true rgb=0x303525
        [0x02605c07, 0x00030704] // debugname=morytania_dark_green overlay=false occlude=true rgb=0x111e1a
    ];

    for (let i = 0; i < FloType.configs.length; i++) {
        floorcol.p4(refColors[i][0]);
        floorcol.p4(refColors[i][1]);
    }

    // ----

    const index = Packet.alloc(2);

    const mapscene = await convertImage(index, `${Environment.build.srcDir}/sprites`, 'mapscene');
    const mapfunction = await convertImage(index, `${Environment.build.srcDir}/sprites`, 'mapfunction');
    const b12 = await convertImage(index, `${Environment.build.srcDir}/fonts`, 'b12_full');
    const mapdots = await convertImage(index, `${Environment.build.srcDir}/sprites`, 'mapdots');
    const f11 = Packet.load(`${Environment.build.srcDir}/fonts/f11.fm`, true);
    const f12 = Packet.load(`${Environment.build.srcDir}/fonts/f12.fm`, true);
    const f14 = Packet.load(`${Environment.build.srcDir}/fonts/f14.fm`, true);
    const f17 = Packet.load(`${Environment.build.srcDir}/fonts/f17.fm`, true);
    const f19 = Packet.load(`${Environment.build.srcDir}/fonts/f19.fm`, true);
    const f22 = Packet.load(`${Environment.build.srcDir}/fonts/f22.fm`, true);
    const f26 = Packet.load(`${Environment.build.srcDir}/fonts/f26.fm`, true);
    const f30 = Packet.load(`${Environment.build.srcDir}/fonts/f30.fm`, true);

    // ----

    const labels = Packet.alloc(1);
    const labelsSrc = fs
        .readFileSync(`${Environment.build.srcDir}/maps/labels.txt`, 'ascii')
        .split(/\r?\n/)
        .filter((x: string) => x.startsWith('='))
        .map((x: string) => x.substring(1).split(','));

    labels.p2(labelsSrc.length);
    for (let i = 0; i < labelsSrc.length; i++) {
        const [text, x, z, type] = labelsSrc[i];
        labels.pjstr(text);
        labels.p2(parseInt(x));
        labels.p2(parseInt(z));
        labels.p1(parseInt(type));
    }

    // ----

    jag.write('underlay.dat', underlay);
    jag.write('overlay.dat', overlay);
    jag.write('loc.dat', loc);
    jag.write('obj.dat', obj);
    jag.write('npc.dat', npc);
    jag.write('multi.dat', multi);
    jag.write('free.dat', free);
    jag.write('floorcol.dat', floorcol);
    jag.write('mapscene.dat', mapscene);
    jag.write('mapfunction.dat', mapfunction);
    jag.write('b12_full.dat', b12);
    jag.write('f11.dat', f11);
    jag.write('f12.dat', f12);
    jag.write('f14.dat', f14);
    jag.write('f17.dat', f17);
    jag.write('f19.dat', f19);
    jag.write('f22.dat', f22);
    jag.write('f26.dat', f26);
    jag.write('f30.dat', f30);
    jag.write('mapdots.dat', mapdots);
    jag.write('index.dat', index);
    jag.write('labels.dat', labels);
    jag.save('data/pack/mapview/worldmap.jag');
}
