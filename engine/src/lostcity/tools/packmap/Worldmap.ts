import fs from 'fs';

import Jagfile from '#jagex2/io/Jagfile.js';
import Packet from '#jagex2/io/Packet.js';

import FloType from '#lostcity/cache/FloType.js';
import LocType from '#lostcity/cache/LocType.js';
import { convertImage } from '#lostcity/util/PixPack.js';
import { LocShape } from '@2004scape/rsmod-pathfinder';
import { shouldBuildFile, shouldBuildFileAny } from '#lostcity/util/PackFile.js';
import NpcType from '#lostcity/cache/NpcType.js';

function packWater(underlay: Packet, overlay: Packet, mx: number, mz: number) {
    underlay.p1(mx);
    underlay.p1(mz);

    overlay.p1(mx);
    overlay.p1(mz);

    for (let i = 0; i < 4096; i++) {
        underlay.p1(0);

        overlay.p1(1 + FloType.getId('water'));
        overlay.p1(0);
    }
}

export async function packWorldmap() {
    if (!fs.existsSync('data/pack/server/maps')) {
        return;
    }

    if (
        !shouldBuildFileAny('data/pack/server/maps', 'data/pack/mapview/worldmap.jag') &&
        !shouldBuildFile('src/lostcity/tools/packmap/Worldmap.ts', 'data/pack/mapview/worldmap.jag')
    ) {
        return;
    }

    FloType.load('data/pack');
    LocType.load('data/pack');
    NpcType.load('data/pack');

    // ---

    const jag = new Jagfile();

    // ----

    const underlay = Packet.alloc(20_000_000);
    const overlay = Packet.alloc(20_000_000);
    const loc = Packet.alloc(5);
    const obj = Packet.alloc(5);
    const npc = Packet.alloc(5);

    function unpackCoord(packed: number): { level: number; x: number; z: number } {
        const z: number = packed & 0x3f;
        const x: number = (packed >> 6) & 0x3f;
        const level: number = (packed >> 12) & 0x3;
        return { x, z, level };
    }

    const maps: string[] = fs.readdirSync('data/pack/server/maps').filter((x: string): boolean => x[0] === 'm');
    for (let index: number = 0; index < maps.length; index++) {
        const [mx, mz] = maps[index].substring(1).split('_').map((x: string) => parseInt(x));

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

        const landBuf = Packet.load(`data/pack/server/maps/m${mx}_${mz}`);
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
                const actualLevel = bridged ? 1 : 0;

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

        const locBuf = Packet.load(`data/pack/server/maps/l${mx}_${mz}`);
        let locId: number = -1;
        let locIdOffset: number = locBuf.gsmart();
        while (locIdOffset !== 0) {
            locId += locIdOffset;

            let coord: number = 0;
            let coordOffset: number = locBuf.gsmart();

            while (coordOffset !== 0) {
                const {x, z, level} = unpackCoord(coord += coordOffset - 1);

                const info: number = locBuf.g1();
                coordOffset = locBuf.gsmart();

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
            locIdOffset = locBuf.gsmart();
        }

        loc.p1(mx);
        loc.p1(mz);

        for (let x = 0; x < 64; x++) {
            for (let z = 0; z < 64; z++) {
                if (walls[0][x][z] !== -1) {
                    loc.p1(walls[0][x][z]);
                }

                if (mapscenes[0][x][z] !== -1) {
                    loc.p1(29 + mapscenes[0][x][z]);
                }

                if (mapfunctions[0][x][z] !== -1) {
                    loc.p1(160 + mapfunctions[0][x][z]);
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

        const objBuf = Packet.load(`data/pack/server/maps/o${mx}_${mz}`);
        if (objBuf.data.length > 0) {
            while (objBuf.available > 0) {
                const pos = objBuf.g2();
                const level = (pos >> 12) & 0x3;
                const localX = (pos >> 6) & 0x3f;
                const localZ = pos & 0x3f;

                const count = objBuf.g1();
                for (let j = 0; j < count; j++) {
                    const objId = objBuf.g2();
                    const objCount = objBuf.g1();
                    objs[level][localX][localZ] = objId;
                }
            }

            obj.p1(mx);
            obj.p1(mz);

            for (let x = 0; x < 64; x++) {
                for (let z = 0; z < 64; z++) {
                    obj.pbool(objs[0][x][z] !== -1);
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

        const npcBuf = Packet.load(`data/pack/server/maps/n${mx}_${mz}`);
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
                    npc.pbool(npcs[0][x][z] !== -1);
                }
            }
        }
    }

    packWater(underlay, overlay, 39, 56);
    packWater(underlay, overlay, 40, 56);
    packWater(underlay, overlay, 42, 44);
    packWater(underlay, overlay, 42, 45);
    packWater(underlay, overlay, 42, 46);
    packWater(underlay, overlay, 42, 47);
    packWater(underlay, overlay, 42, 48);
    packWater(underlay, overlay, 43, 44);
    packWater(underlay, overlay, 44, 44);
    packWater(underlay, overlay, 45, 44);
    packWater(underlay, overlay, 46, 44);
    packWater(underlay, overlay, 47, 44);
    packWater(underlay, overlay, 47, 45);
    packWater(underlay, overlay, 47, 46);
    packWater(underlay, overlay, 48, 45);
    packWater(underlay, overlay, 48, 46);

    jag.write('underlay.dat', underlay);

    jag.write('overlay.dat', overlay);

    jag.write('loc.dat', loc);

    jag.write('obj.dat', obj);

    jag.write('npc.dat', npc);

    const floorcol = Packet.alloc(1);
    floorcol.p2(FloType.configs.length);

    const refColors = [
        [0x00000038, 0x009c8f8e], // debugname=cliff overlay=true occlude=true rgb=0xaaaaaa
        [0x00000016, 0x004a4242], // debugname=cliff2 overlay=true occlude=true rgb=0x444444
        [0x00000022, 0x004a4242], // debugname=cliff3 overlay=true occlude=true rgb=0x666666
        [0x0000002d, 0x00817574], // debugname=cliff4 overlay=true occlude=true rgb=0x888888
        [0x00000000, 0x003b1d0c], // debugname=woodenfloor overlay=true occlude=true rgb=0x000000 texture=planks
        [0x00000000, 0x0050648d], // debugname=water overlay=true occlude=true rgb=0x000000 texture=water
        [0x00000000, 0x00206349], // debugname=gungywater overlay=true occlude=true rgb=0x000000 texture=gungywater
        [0x0000001e, 0x004a4342], // debugname=greyroof overlay=true occlude=true rgb=0x5b5b5b
        [0x01500053, 0x00c2c2ba], // debugname=desertroof overlay=true occlude=true rgb=0xfffff5
        [0x0000001a, 0x00413b3a], // debugname=road overlay=true occlude=true rgb=0x505050
        [0x0000000b, 0x00191616], // debugname=darkstone overlay=true occlude=true rgb=0x222222
        [0x00000000, 0x00403935], // debugname=pebblefloor overlay=true occlude=true rgb=0x000000 texture=pebblefloor
        [0x0000a822, 0x00783633], // debugname=redfloor overlay=true occlude=true rgb=0x993333
        [0x0090ec0c, 0x00513a12], // debugname=mudfloor overlay=true occlude=true rgb=0x3d2b0b
        [0x0090ec0c, 0x00120d03], // debugname=mudfloor_bump overlay=true occlude=true rgb=0x3d2b0b
        [0x00715411, 0x006f4805], // debugname=mudfloor2 overlay=true occlude=true rgb=0x663300
        [0x00715411, 0x003c1d01], // debugname=mudfloor2_bump overlay=true occlude=true rgb=0x663300
        [0x03815422, 0x00061789], // debugname=bluefloor overlay=true occlude=true rgb=0x0000cc
        [0x00000000, 0x00e36116], // debugname=lava overlay=true occlude=true rgb=0x000000 texture=lava
        [0x00000000, 0x004e4e50], // debugname=marble overlay=true occlude=true rgb=0x000000 texture=marble
        [0x00915419, 0x00583a03], // debugname=sandfloor overlay=true occlude=true rgb=0x996600
        [0x00a09419, 0x004d4320], // debugname=l_brownfloor1 overlay=true occlude=true rgb=0x6d5b2b
        [0x00a09419, 0x00574730], // debugname=l_brownfloor1_bump overlay=true occlude=true rgb=0x6d5b2b
        [0x00000000, 0x0039332d], // debugname=cliff_textured overlay=true occlude=true rgb=0x000000 texture=rockwall
        [0x00b09435, 0x009b9243], // debugname=sand_cliff overlay=true occlude=true rgb=0xcbba76
        [0x00c06821, 0x005b5441], // debugname=sand_rock overlay=true occlude=true rgb=0x827944
        [0x00000000, 0x00282211], // debugname=oldbrick overlay=true occlude=true rgb=0x000000 texture=mossybricks
        [0x00000000, 0x00333333], // debugname=brick overlay=true occlude=true rgb=0x000000 texture=wall
        [0x01611c14, 0x003b5e0b], // debugname=grass overlay=true occlude=true rgb=0x35720a
        [0x0150004f, 0x00c8c0c0], // debugname=ice_overlay overlay=true occlude=true rgb=0xeeeeee
        [0x00a11012, 0x00734c05], // debugname=upass_floor overlay=true occlude=true rgb=0x654d0b
        [0x00000000, 0x0037312a], // debugname=stone_texture overlay=true occlude=true rgb=0x000000 texture=mossy
        [0x0150004a, 0x00aaafb4], // debugname=ice_overlay_blue overlay=true occlude=true rgb=0xc9ddf7
        [0x0000001a, 0x00474040], // debugname=road_bridge overlay=true occlude=true rgb=0x505050
        [0x00000000, 0x003b1d0c], // debugname=woodenfloor_bridge overlay=true occlude=true rgb=0x000000 texture=planks
        [0x0080f013, 0x0062420d], // debugname=mud5_overlay overlay=true occlude=true rgb=0x664411
        [0x00000000, 0x00060505], // debugname=black overlay=true occlude=true rgb=0x000000
        [0x03106027, 0x003e516e], // debugname=lightblue overlay=true occlude=true rgb=0x557799
        [0x00000000, 0x0079a0d7], // debugname=water_fountain overlay=true occlude=true rgb=0x000000 texture=fountain
        [0x03808427, 0x004e4a82], // debugname=bluefloor2 overlay=true occlude=true rgb=0x4749a3
        [0x03107420, 0x00364c61], // debugname=waterfallblue overlay=true occlude=true rgb=0x3f6181
        [0xff21542a, 0x00503000], // debugname=invisible overlay=true occlude=false rgb=0xff00ff
        [0xff21542a, 0x00503000], // debugname=invisible_occ overlay=true occlude=true rgb=0xff00ff
        [0x0000001a, 0x00474040], // debugname=road_no_occlude overlay=true occlude=false rgb=0x505050
        [0x00000000, 0x003b1d0c], // debugname=woodenfloor_no_occlude overlay=true occlude=false rgb=0x000000 texture=planks
        [0x00000000, 0x00282211], // debugname=oldbrick_no_occlude overlay=true occlude=false rgb=0x000000 texture=mossybricks
        [0x00000000, 0x00333333], // debugname=brick_no_occlude overlay=true occlude=false rgb=0x000000 texture=wall
        [0x01611c14, 0x0036570a], // debugname=grassland overlay=false occlude=true rgb=0x35720a
        [0x01011413, 0x00393c07], // debugname=muddygrass overlay=false occlude=true rgb=0x58680b
        [0x00c11c15, 0x00403f07], // debugname=vmuddygrass overlay=false occlude=true rgb=0x78680b
        [0x0141181f, 0x00556c0e], // debugname=lightgrass overlay=false occlude=true rgb=0x6cac10
        [0x0110ac21, 0x0065832a], // debugname=sandygrass overlay=false occlude=true rgb=0x819531
        [0x00d10c0f, 0x00282805], // debugname=swamp overlay=false occlude=true rgb=0x55520a
        [0x0250e011, 0x0012513d], // debugname=swamp2 overlay=false occlude=true rgb=0x125841
        [0x00000027, 0x00605656], // debugname=lightrock overlay=false occlude=true rgb=0x767676
        [0x00000019, 0x004c4444], // debugname=darkrock overlay=false occlude=true rgb=0x4d4d4d
        [0x0000000f, 0x00171414], // debugname=verydarkrock overlay=false occlude=true rgb=0x2e2e2e
        [0x0150004f, 0x00c2bbba], // debugname=ice overlay=false occlude=false rgb=0xeeeeee
        [0x01500049, 0x00b6b9bf], // debugname=blueice overlay=false occlude=true rgb=0xd1d6e7
        [0x01500049, 0x0098a599], // debugname=greenice overlay=false occlude=true rgb=0xd1e7d6
        [0x00c0742b, 0x00797343], // debugname=desert1 overlay=false occlude=true rgb=0xada055
        [0x00b0a436, 0x009b9243], // debugname=desert2 overlay=false occlude=true rgb=0xd0c074
        [0x0090ec0c, 0x001b1303], // debugname=mud1 overlay=false occlude=true rgb=0x3d2b0b
        [0x0090b415, 0x006b5d22], // debugname=mud2 overlay=false occlude=true rgb=0x644e1e
        [0x00a11012, 0x0039280b], // debugname=mud3 overlay=false occlude=true rgb=0x654d0b
        [0x00715411, 0x005c2403], // debugname=mud4 overlay=false occlude=true rgb=0x663300
        [0x0080f013, 0x00665716], // debugname=mud5 overlay=false occlude=false rgb=0x664411
        [0x00b09435, 0x00b48d4e], // debugname=sand overlay=false occlude=true rgb=0xcbba76
        [0x0090b415, 0x0052471a], // debugname=mud2_skew overlay=false occlude=false rgb=0x644e1e
        [0x00a11012, 0x006c4a0e], // debugname=mud3_skew overlay=false occlude=false rgb=0x654d0b
        [0x00715411, 0x003c2701], // debugname=mud4_skew overlay=false occlude=false rgb=0x663300
        [0x00000001, 0x00060505], // debugname=black_rock overlay=false occlude=false rgb=0x030303
        [0x03106027, 0x00435e79], // debugname=dullblue overlay=false occlude=true rgb=0x557799
        [0xffd06027, 0x008d524f], // debugname=purple_pink overlay=false occlude=true rgb=0x995566
        [0x03106027, 0x0043779b], // debugname=lightblue_underlay overlay=false occlude=true rgb=0x557799
        [0x00b0a82d, 0x00a9974a], // debugname=desert_shadow overlay=true occlude=true rgb=0xc4ac4e
        [0x0080782f, 0x00886b4d], // debugname=duel_arena overlay=true occlude=true rgb=0xb79767
        [0x0080283c, 0x00b47a4e], // debugname=duelarena overlay=false occlude=true rgb=0xd9bb93
        [0x00b06826, 0x0071673f], // debugname=hive overlay=true occlude=true rgb=0x97874f
    ];

    for (let i = 0; i < FloType.configs.length; i++) {
        const type = FloType.get(i);
        // if (type.texture !== -1) {
        //     console.log('[0x' + (ref.g4() >>> 0).toString(16).padStart(8, '0') + ', 0x' + (ref.g4() >>> 0).toString(16).padStart(8, '0') + `], // debugname=${type.debugname} overlay=${type.overlay} occlude=${type.occlude} rgb=0x${(type.rgb >>> 0).toString(16).padStart(6, '0')} texture=${TexturePack.getById(type.texture)}`);
        // } else {
        //     console.log('[0x' + (ref.g4() >>> 0).toString(16).padStart(8, '0') + ', 0x' + (ref.g4() >>> 0).toString(16).padStart(8, '0') + `], // debugname=${type.debugname} overlay=${type.overlay} occlude=${type.occlude} rgb=0x${(type.rgb >>> 0).toString(16).padStart(6, '0')}`);
        // }

        floorcol.p4(refColors[i][0]);
        floorcol.p4(refColors[i][1]);
    }

    jag.write('floorcol.dat', floorcol);

    // ----

    const index = Packet.alloc(1);

    const mapscene = await convertImage(index, 'data/src/sprites', 'mapscene');
    jag.write('mapscene.dat', mapscene!);

    const mapfunction = await convertImage(index, 'data/src/sprites', 'mapfunction');
    jag.write('mapfunction.dat', mapfunction!);

    const b12 = await convertImage(index, 'data/src/fonts', 'b12');
    jag.write('b12.dat', b12!);

    const mapdots = await convertImage(index, 'data/src/sprites', 'mapdots');
    jag.write('mapdots.dat', mapdots!);

    jag.write('index.dat', index);

    // ----

    const labels = Packet.alloc(1);
    const labelsSrc = fs.readFileSync('data/src/maps/labels.txt', 'ascii')
        .replace(/\r/g, '').split('\n')
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

    jag.write('labels.dat', labels);

    // ----

    jag.save('data/pack/mapview/worldmap.jag');
}
