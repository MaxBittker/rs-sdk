import fs from 'fs';

import { compressGz } from '#/io/GZip.js';
import Packet from '#/io/Packet.js';

import Environment from '#/util/Environment.js';
import { printWarning } from '#/util/Logger.js';

import { getArtifactManifestPath, getArtifactSourceStamp, loadArtifactManifest, openArtifactStore, saveArtifactManifest } from '#tools/pack/ArtifactCache.js';
import { MapPack, shouldBuild, shouldBuildFile } from '#tools/pack/PackFile.js';
import { didFileSetChange } from '#tools/pack/FsCache.js';

let npcTypePromise = null;
let worldmapPromise = null;

async function getNpcType() {
    if (!npcTypePromise) {
        npcTypePromise = import('#/cache/config/NpcType.js').then(module => module.default);
    }

    return npcTypePromise;
}

async function getPackWorldmap() {
    if (!worldmapPromise) {
        worldmapPromise = import('#tools/pack/map/Worldmap.js').then(module => module.packWorldmap);
    }

    return worldmapPromise;
}

function packKey(level, x, z) {
    return (level << 12) | (x << 6) | z;
}

function readMap(lines) {
    const land = new Map();
    const loc = new Map();
    const npc = new Map();
    const obj = new Map();

    let section = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.charCodeAt(0) === 61) {
            // '='
            section = line.slice(4, -4).slice(1, 4);
            continue;
        }

        const colon = line.indexOf(':');
        const sp1 = line.indexOf(' ');
        const sp2 = line.indexOf(' ', sp1 + 1);

        const level = line.charCodeAt(0) - 48;
        const x = parseInt(line.slice(sp1 + 1, sp2));
        const z = parseInt(line.slice(sp2 + 1, colon));
        const key = packKey(level, x, z);
        const data = line.slice(colon + 2);

        if (section === 'MAP') {
            let h = 0,
                overlayId = -1,
                overlayShape = -1,
                overlayRot = -1,
                flags = -1,
                underlay = -1;
            let start = 0;
            while (start < data.length) {
                const end = data.indexOf(' ', start);
                const token = end === -1 ? data.slice(start) : data.slice(start, end);
                const type = token.charCodeAt(0);
                const info = token.slice(1);

                if (type === 104) {
                    // 'h'
                    h = parseInt(info);
                } else if (type === 111) {
                    // 'o'
                    const sc1 = info.indexOf(';');
                    const sc2 = sc1 === -1 ? -1 : info.indexOf(';', sc1 + 1);
                    overlayId = sc1 === -1 ? parseInt(info) : parseInt(info.slice(0, sc1));
                    overlayShape = sc1 === -1 ? -1 : parseInt(info.slice(sc1 + 1, sc2 === -1 ? undefined : sc2));
                    overlayRot = sc2 === -1 ? -1 : parseInt(info.slice(sc2 + 1));
                } else if (type === 102) {
                    // 'f'
                    flags = parseInt(info);
                } else if (type === 117) {
                    // 'u'
                    underlay = parseInt(info);
                }

                if (end === -1) {
                    break;
                }

                start = end + 1;
            }
            land.set(key, { h, overlayId, overlayShape, overlayRot, flags, underlay });
        } else if (section === 'LOC') {
            const parts = data.split(' ');
            const id = parseInt(parts[0]);
            const shape = parts.length > 1 ? parseInt(parts[1]) : 10;
            const angle = parts.length > 2 ? parseInt(parts[2]) : 0;
            const entry = loc.get(key);
            if (entry) {
                entry.push({ id, shape, angle });
            } else {
                loc.set(key, [{ id, shape, angle }]);
            }
        } else if (section === 'NPC') {
            const id = parseInt(data);
            const entry = npc.get(key);
            if (entry) {
                entry.push(id);
            } else {
                npc.set(key, [id]);
            }
        } else if (section === 'OBJ') {
            const sp = data.indexOf(' ');
            const id = parseInt(data.slice(0, sp));
            const count = parseInt(data.slice(sp + 1));
            const entry = obj.get(key);
            if (entry) {
                entry.push({ id, count });
            } else {
                obj.set(key, [{ id, count }]);
            }
        }
    }

    return { land, loc, npc, obj };
}

function readMapSection(lines, ...sections) {
    const sectionSet = new Set(sections);
    const npc = new Map();
    let section = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.charCodeAt(0) === 61) {
            section = line.slice(4, -4).slice(1, 4);
            continue;
        }
        if (!sectionSet.has(section)) {
            continue;
        }

        // only NPC parsing needed at this time for model flags
        const colon = line.indexOf(':');
        const sp1 = line.indexOf(' ');
        const sp2 = line.indexOf(' ', sp1 + 1);

        const level = line.charCodeAt(0) - 48;
        const x = parseInt(line.slice(sp1 + 1, sp2));
        const z = parseInt(line.slice(sp2 + 1, colon));
        const key = (level << 12) | (x << 6) | z;
        const data = line.slice(colon + 2);

        const id = parseInt(data);
        const entry = npc.get(key);
        if (entry) {
            entry.push(id);
        } else {
            npc.set(key, [id]);
        }
    }

    return { npc };
}

function updateModelFlags(npcMap, modelFlags, NpcType) {
    for (const [_key, ids] of npcMap) {
        for (const id of ids) {
            const type = NpcType.get(id);
            if (type.models) {
                for (const model of type.models) {
                    modelFlags[model] |= 0x4;
                }
            }
            if (type.heads) {
                for (const model of type.heads) {
                    modelFlags[model] |= 0x4;
                }
            }
        }
    }
}

export async function collectMapModelFlags(modelFlags) {
    if (!fs.existsSync(`${Environment.build.srcDir}/maps`)) {
        return;
    }

    const NpcType = await getNpcType();
    NpcType.load('data/pack');

    for (let id = 0; id < MapPack.max; id++) {
        const name = MapPack.getById(id);
        if (!name.startsWith('m')) {
            continue;
        }

        const mapXZ = name.slice(1);
        const file = `${Environment.build.srcDir}/maps/m${mapXZ}.jm2`;
        if (!fs.existsSync(file)) {
            continue;
        }

        const data = fs
            .readFileSync(file, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(x => x.length);
        const map = readMapSection(data, 'NPC');
        updateModelFlags(map.npc, modelFlags, NpcType);
    }
}

export async function packMaps(cache, modelFlags) {
    if (!fs.existsSync(`${Environment.build.srcDir}/maps`)) {
        return false;
    }

    const maps = [];
    for (let id = 0; id < MapPack.max; id++) {
        const name = MapPack.getById(id);
        if (!name.startsWith('m')) {
            continue;
        }

        maps.push(name);
    }

    const rebuildMapArchive = shouldBuildFile(`${Environment.build.srcDir}/pack/map.pack`, 'data/pack/main_file_cache.idx4');
    const needsMapHydration = rebuildMapArchive || cache.count(4) === 0;
    const artifactName = 'maps';
    const clientStore = openArtifactStore('maps-client', rebuildMapArchive);
    const serverStore = openArtifactStore('maps-server', rebuildMapArchive);
    const artifactManifest = loadArtifactManifest(artifactName, rebuildMapArchive);
    let artifactManifestDirty = false;
    const toolChanged = didFileSetChange('data/pack/.stamps/map-tools.txt', [import.meta.filename]);
    const needsAnyMapPackWork = rebuildMapArchive || shouldBuild(`${Environment.build.srcDir}/maps`, '.jm2', getArtifactManifestPath(artifactName)) || toolChanged;

    if (rebuildMapArchive) {
        cache.clearArchive(4);
    }

    if (!needsAnyMapPackWork && !needsMapHydration) {
        return false;
    }

    let rebuildWorldmap = !fs.existsSync('data/pack/mapview/worldmap.jag');
    let rebuiltAnyMap = false;
    let NpcType = null;
    for (const name of maps) {
        const mapXZ = name.slice(1);
        const file = `${Environment.build.srcDir}/maps/m${mapXZ}.jm2`;

        if (!fs.existsSync(file)) {
            printWarning(`missing map m${mapXZ}`);
            continue;
        }

        const mapId = MapPack.getByName(`m${mapXZ}`);
        const locMapId = MapPack.getByName(`l${mapXZ}`);
        const mapKey = `m${mapXZ}`;
        const locKey = `l${mapXZ}`;
        const npcKey = `n${mapXZ}`;
        const objKey = `o${mapXZ}`;
        const sourceStamp = getArtifactSourceStamp(file);
        let needsRebuild =
            needsAnyMapPackWork &&
            (toolChanged || artifactManifest[mapXZ] !== sourceStamp || !clientStore.has(mapKey) || !clientStore.has(locKey) || !serverStore.has(mapKey) || !serverStore.has(locKey) || !serverStore.has(npcKey) || !serverStore.has(objKey));
        if (!needsRebuild) {
            if (needsMapHydration) {
                const packedMap = clientStore.read(mapKey);
                const packedLoc = clientStore.read(locKey);
                if (!packedMap || !packedLoc) {
                    needsRebuild = true;
                } else {
                    if (!cache.has(4, mapId)) {
                        cache.write(4, mapId, packedMap, 1);
                    }
                    if (!cache.has(4, locMapId)) {
                        cache.write(4, locMapId, packedLoc, 1);
                    }
                }
            }
        }

        if (!needsRebuild) {
            continue;
        }

        rebuiltAnyMap = true;
        rebuildWorldmap = true;
        const data = fs
            .readFileSync(file, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(x => x.length);
        const map = readMap(data);

        // encode land data
        {
            const TILES = 64 * 64;
            const STRIDE = 4 * TILES;

            const levelHeightmap = new Int16Array(STRIDE);
            const levelTileOverlayIds = new Int16Array(STRIDE).fill(-1);
            const levelTileOverlayShape = new Int16Array(STRIDE).fill(-1);
            const levelTileOverlayRotation = new Int16Array(STRIDE).fill(-1);
            const levelTileFlags = new Int16Array(STRIDE).fill(-1);
            const levelTileUnderlayIds = new Int16Array(STRIDE).fill(-1);

            for (const [key, tile] of map.land) {
                const idx = key;
                levelHeightmap[idx] = tile.h;
                levelTileOverlayIds[idx] = tile.overlayId;
                levelTileOverlayShape[idx] = tile.overlayShape;
                levelTileOverlayRotation[idx] = tile.overlayRot;
                levelTileFlags[idx] = tile.flags;
                levelTileUnderlayIds[idx] = tile.underlay;
            }

            let out = Packet.alloc(3);
            for (let i = 0; i < STRIDE; i++) {
                const height = levelHeightmap[i];
                const overlay = levelTileOverlayIds[i];
                const shape = levelTileOverlayShape[i];
                const rotation = levelTileOverlayRotation[i];
                const flags = levelTileFlags[i];
                const underlay = levelTileUnderlayIds[i];

                if (height === 0 && overlay === -1 && flags === -1 && underlay === -1) {
                    // default values
                    out.p1(0);
                    continue;
                }

                if (overlay !== -1) {
                    let opcode = 2;
                    if (shape !== -1) {
                        opcode += shape << 2;
                    }
                    if (rotation !== -1) {
                        opcode += rotation;
                    }
                    out.p1(opcode);
                    out.p1(overlay);
                }

                if (flags !== -1) {
                    out.p1(flags + 49);
                }

                if (underlay !== -1) {
                    out.p1(underlay + 81);
                }

                if (height !== 0) {
                    // specific height
                    out.p1(1);
                    out.p1(height);
                } else {
                    // perlin noise
                    out.p1(0);
                }
            }

            const data = out.data.subarray(0, out.pos);
            const packed = compressGz(data);
            clientStore.write(mapKey, packed);
            serverStore.write(mapKey, data);
            out.release();

            cache.write(4, mapId, packed, 1);
        }

        // encode loc data
        {
            const allLocs = [];
            for (const [key, entries] of map.loc) {
                for (const { id, shape, angle } of entries) {
                    allLocs.push((id << 14) | key, shape, angle);
                }
            }
            const locList = [];
            for (const [key, entries] of map.loc) {
                const level = (key >> 12) & 0x3;
                const x = (key >> 6) & 0x3f;
                const z = key & 0x3f;
                for (const { id, shape, angle } of entries) {
                    locList.push({ id, level, x, z, shape, angle });
                }
            }
            locList.sort((a, b) => (a.id !== b.id ? a.id - b.id : ((a.level << 12) | (a.x << 6) | a.z) - ((b.level << 12) | (b.x << 6) | b.z)));

            let out = Packet.alloc(3);
            let lastLocId = -1;
            let lastLocData = 0;
            let i = 0;
            while (i < locList.length) {
                const id = locList[i].id;
                out.psmart(id - lastLocId);
                lastLocId = id;
                lastLocData = 0;

                while (i < locList.length && locList[i].id === id) {
                    const { level, x, z, shape, angle } = locList[i++];
                    const currentLocData = (level << 12) | (x << 6) | z;
                    out.psmart(currentLocData - lastLocData + 1);
                    lastLocData = currentLocData;
                    out.p1((shape << 2) | angle);
                }
                out.psmart(0); // end of this loc
            }
            out.psmart(0); // end of map

            const data = out.data.subarray(0, out.pos);
            const packed = compressGz(data);
            clientStore.write(locKey, packed);
            serverStore.write(locKey, data);
            out.release();

            cache.write(4, locMapId, packed, 1);
        }

        // encode npc data
        {
            let out = Packet.alloc(1);

            for (const [key, ids] of map.npc) {
                out.p2(key);
                out.p1(ids.length);
                for (const id of ids) {
                    out.p2(id);
                }
            }

            serverStore.write(npcKey, out.data.subarray(0, out.pos));
            out.release();
        }

        // encode obj data
        {
            let out = Packet.alloc(1);

            for (const [key, objs] of map.obj) {
                out.p2(key);
                out.p1(objs.length);
                for (const { id, count } of objs) {
                    out.p2(id);
                    out.p1(count);
                }
            }

            serverStore.write(objKey, out.data.subarray(0, out.pos));
            out.release();
        }

        artifactManifest[mapXZ] = sourceStamp;
        artifactManifestDirty = true;

        if (!NpcType) {
            NpcType = await getNpcType();
            NpcType.load('data/pack');
        }

        updateModelFlags(map.npc, modelFlags, NpcType);
    }

    if (artifactManifestDirty) {
        saveArtifactManifest(artifactName, artifactManifest);
    }

    clientStore.save();
    serverStore.save();

    if (rebuildWorldmap) {
        const packWorldmap = await getPackWorldmap();
        await packWorldmap();
    }

    return rebuiltAnyMap;
}
