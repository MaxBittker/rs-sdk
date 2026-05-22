import fs from 'fs';

import FileStream from '#/io/FileStream.js';
import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';
import { AnimPack, AnimSetPack, MapPack, MidiPack, ModelPack } from '#tools/pack/PackFile.js';
import Environment from '#/util/Environment.js';
import { fileExists } from '#tools/pack/FsCache.js';
import { shouldBuild, shouldBuildFile, shouldBuildFileAny } from '#tools/pack/PackFile.js';

export function shouldRebuildVersionListPack() {
    return (
        shouldBuildFile(`${Environment.build.srcDir}/pack/model.pack`, 'data/pack/client/versionlist') ||
        shouldBuildFile(`${Environment.build.srcDir}/pack/anim.pack`, 'data/pack/client/versionlist') ||
        shouldBuildFile(`${Environment.build.srcDir}/pack/animset.pack`, 'data/pack/client/versionlist') ||
        shouldBuildFile(`${Environment.build.srcDir}/pack/map.pack`, 'data/pack/client/versionlist') ||
        shouldBuildFile(`${Environment.build.srcDir}/pack/midi.pack`, 'data/pack/client/versionlist') ||
        shouldBuildFileAny(`${Environment.build.srcDir}/models`, 'data/pack/client/versionlist') ||
        shouldBuildFileAny(`${Environment.build.srcDir}/maps`, 'data/pack/client/versionlist') ||
        shouldBuildFileAny(`${Environment.build.srcDir}/jingles`, 'data/pack/client/versionlist') ||
        shouldBuildFileAny(`${Environment.build.srcDir}/songs`, 'data/pack/client/versionlist') ||
        shouldBuild(`${Environment.build.srcDir}/scripts`, '.idk', 'data/pack/client/versionlist') ||
        shouldBuild(`${Environment.build.srcDir}/scripts`, '.npc', 'data/pack/client/versionlist') ||
        shouldBuild(`${Environment.build.srcDir}/scripts`, '.obj', 'data/pack/client/versionlist') ||
        shouldBuild(`${Environment.build.srcDir}/scripts`, '.loc', 'data/pack/client/versionlist') ||
        shouldBuild(`${Environment.build.srcDir}/scripts`, '.spotanim', 'data/pack/client/versionlist') ||
        shouldBuild(`${Environment.build.srcDir}/scripts`, '.if', 'data/pack/client/versionlist') ||
        shouldBuild(`${Environment.build.srcDir}/scripts`, '.varp', 'data/pack/client/versionlist') ||
        shouldBuild(`${Environment.build.srcDir}/scripts`, '.varbit', 'data/pack/client/versionlist') ||
        shouldBuild(`${Environment.build.srcDir}/scripts`, '.seq', 'data/pack/client/versionlist') ||
        shouldBuildFileAny('tools/pack/versionlist', 'data/pack/client/versionlist') ||
        shouldBuildFileAny('tools/pack/map', 'data/pack/client/versionlist') ||
        shouldBuildFileAny('tools/pack/interface', 'data/pack/client/versionlist') ||
        shouldBuildFileAny('tools/pack/config', 'data/pack/client/versionlist') ||
        shouldBuildFile('data/raw/wordenc', 'data/pack/client/versionlist')
    );
}

export function loadCachedModelFlags(modelFlags: number[]) {
    if (!fs.existsSync('data/pack/client/versionlist')) {
        return false;
    }

    const versionlist = Jagfile.load('data/pack/client/versionlist');
    const modelIndex = versionlist.read('model_index');
    if (!modelIndex) {
        return false;
    }

    for (let id = 0; id < ModelPack.max; id++) {
        modelFlags[id] = modelIndex.pos < modelIndex.length ? modelIndex.g1() : 0;
    }

    return true;
}

export function packClientVersionList(cache: FileStream, modelFlags: number[]) {
    const rebuild = shouldRebuildVersionListPack();

    if (!rebuild && cache.has(0, 5)) {
        return false;
    }

    const versionlist = Jagfile.new(true);

    const modelVersion = Packet.alloc(3);
    const modelCrc = Packet.alloc(4);
    const modelIndex = Packet.alloc(3);
    for (let id = 0; id < ModelPack.max; id++) {
        const data = cache.read(1, id);
        if (data) {
            modelVersion.p2(1);
            modelCrc.p4(Packet.getcrc(data, 0, data.length - 2));
            modelIndex.p1(modelFlags[id] ?? 0);

            /*
            0x80 - player chatheads
            0x40 - item inventory models
            0x20 - item inventory models (f2p)
            0x10 - item worn models
            0x8 - item worn models (f2p)
            0x4 - npc models/chatheads + scenery of anything that is mapped down
            0x2 - anything that spawns dynamically (non mapped down npcs/scenery, spotanims, interfaces)
            0x1 - used on tutorial island
            */
        } else {
            modelVersion.p2(0);
            modelCrc.p4(0);
            modelIndex.p1(0);
        }
    }
    versionlist.write('model_version', modelVersion);
    versionlist.write('model_crc', modelCrc);
    versionlist.write('model_index', modelIndex);

    const animVersion = Packet.alloc(3);
    const animCrc = Packet.alloc(4);
    const animIndex = Packet.alloc(3);
    for (let id = 0; id < AnimSetPack.max; id++) {
        const data = cache.read(2, id);
        if (data) {
            animVersion.p2(1);
            animCrc.p4(Packet.getcrc(data, 0, data.length - 2));
        } else {
            animVersion.p2(0);
            animCrc.p4(0);
        }
    }
    for (let id = 0; id < AnimPack.max; id++) {
        // todo: i think this is each frame's animset file
        animIndex.p2(0);
    }
    versionlist.write('anim_version', animVersion);
    versionlist.write('anim_crc', animCrc);
    versionlist.write('anim_index', animIndex);

    const midiVersion = Packet.alloc(3);
    const midiCrc = Packet.alloc(4);
    const midiIndex = Packet.alloc(3);
    for (let id = 0; id < MidiPack.max; id++) {
        const data = cache.read(3, id);
        if (data) {
            midiVersion.p2(1);
            midiCrc.p4(Packet.getcrc(data, 0, data.length - 2));
            // used for prefetching jingles
            midiIndex.pbool(fileExists(`${Environment.build.srcDir}/jingles/${MidiPack.getById(id)}.mid`));
        } else {
            midiVersion.p2(0);
            midiCrc.p4(0);
            midiIndex.p1(0);
        }
    }
    versionlist.write('midi_version', midiVersion);
    versionlist.write('midi_crc', midiCrc);
    versionlist.write('midi_index', midiIndex);

    const mapVersion = Packet.alloc(3);
    const mapCrc = Packet.alloc(4);
    const mapIndex = Packet.alloc(4);
    for (let id = 0; id < MapPack.max; id++) {
        const data = cache.read(4, id);
        if (data) {
            mapVersion.p2(1);
            mapCrc.p4(Packet.getcrc(data, 0, data.length - 2));
        } else {
            mapVersion.p2(0);
            mapCrc.p4(0);
        }
    }

    const free2play = fs.readFileSync(`${Environment.build.srcDir}/maps/free2play.csv`, 'ascii').split(/\r?\n/);
    const prefetch = new Set();
    for (let index: number = 0; index < free2play.length; index++) {
        const line: string = free2play[index];
        if (line.startsWith('//') || !line.length) {
            continue;
        }

        const [_y, mx, mz, _lx, _lz] = line.split('_').map(Number);
        prefetch.add((mx << 8) | mz);
    }

    for (let mapX = 0; mapX < 100; mapX++) {
        for (let mapZ = 0; mapZ < 255; mapZ++) {
            const mapId = MapPack.getByName(`m${mapX}_${mapZ}`);
            if (mapId === -1) {
                continue;
            }

            const locMapId = MapPack.getByName(`l${mapX}_${mapZ}`);

            const region = (mapX << 8) | mapZ;
            mapIndex.p2(region);
            mapIndex.p2(mapId);
            mapIndex.p2(locMapId);
            mapIndex.pbool(prefetch.has(region));
        }
    }
    versionlist.write('map_version', mapVersion);
    versionlist.write('map_crc', mapCrc);
    versionlist.write('map_index', mapIndex);

    versionlist.save('data/pack/client/versionlist');

    cache.write(0, 5, fs.readFileSync('data/pack/client/versionlist'));
    return true;
}
