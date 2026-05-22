import fs from 'fs';

import Environment from '#/util/Environment.js';
import Packet from '#/io/Packet.js';
import { packInterface } from '#tools/pack/interface/PackShared.js';
import { collectMapModelFlags } from '#tools/pack/map/Pack.js';
import { packIdkConfigs, parseIdkConfig } from '#tools/pack/config/IdkConfig.js';
import { packLocConfigs, parseLocConfig } from '#tools/pack/config/LocConfig.js';
import { packNpcConfigs, parseNpcConfig } from '#tools/pack/config/NpcConfig.js';
import { packObjConfigs, parseObjConfig } from '#tools/pack/config/ObjConfig.js';
import { readConfigs, readDirTree, shouldBuildConfigOutput } from '#tools/pack/config/PackShared.js';
import { packSpotAnimConfigs, parseSpotAnimConfig } from '#tools/pack/config/SpotAnimConfig.js';
import { ModelPack, shouldBuildFileAny } from '#tools/pack/PackFile.js';
import { writeFileIfChanged } from '#tools/pack/FsCache.js';
import { shouldRebuildInterfacePack } from '#tools/pack/interface/PackClient.js';

const MODEL_FLAG_CACHE_DIR = 'data/pack/.cache/model_flags';
const MODEL_FLAG_GROUPS = ['idk', 'loc', 'npc', 'obj', 'spotanim', 'interface', 'map'] as const;

type ModelFlagGroup = (typeof MODEL_FLAG_GROUPS)[number];

function releasePacket(packet: Packet) {
    packet.release();
}

function discardPackedData(dat: Packet, idx: Packet) {
    dat.release();
    idx.release();
}

function getModelFlagCachePath(group: ModelFlagGroup) {
    return `${MODEL_FLAG_CACHE_DIR}/${group}.bin`;
}

function clearModelFlags(modelFlags: number[]) {
    for (let i = 0; i < ModelPack.max; i++) {
        modelFlags[i] = 0;
    }
}

function allocModelFlags() {
    return new Uint8Array(ModelPack.max);
}

function loadModelFlagContribution(group: ModelFlagGroup): Uint8Array | null {
    const path = getModelFlagCachePath(group);
    if (!fs.existsSync(path)) {
        return null;
    }

    const data = fs.readFileSync(path);
    if (data.length !== ModelPack.max) {
        return null;
    }

    return new Uint8Array(data);
}

function saveModelFlagContribution(group: ModelFlagGroup, contribution: Uint8Array) {
    writeFileIfChanged(getModelFlagCachePath(group), contribution);
}

function applyModelFlagContribution(modelFlags: number[], contribution: Uint8Array) {
    for (let i = 0; i < contribution.length; i++) {
        modelFlags[i] |= contribution[i];
    }
}

async function buildConfigModelFlags(
    dirTree: Set<string>,
    extension: string,
    parse: typeof parseIdkConfig | typeof parseLocConfig | typeof parseNpcConfig | typeof parseObjConfig | typeof parseSpotAnimConfig,
    pack: typeof packIdkConfigs | typeof packLocConfigs | typeof packNpcConfigs | typeof packObjConfigs | typeof packSpotAnimConfigs
) {
    const contribution = allocModelFlags();
    await readConfigs(dirTree, extension, [], contribution as unknown as number[], parse, pack, discardPackedData, discardPackedData);
    return contribution;
}

async function buildInterfaceModelFlags() {
    const contribution = allocModelFlags();
    const { client, server } = packInterface(contribution as unknown as number[]);
    releasePacket(client);
    releasePacket(server);
    return contribution;
}

async function buildMapModelFlags() {
    const contribution = allocModelFlags();
    await collectMapModelFlags(contribution as unknown as number[]);
    return contribution;
}

function shouldRefreshModelFlagGroup(group: ModelFlagGroup) {
    switch (group) {
        case 'idk':
            return shouldBuildConfigOutput('.idk', 'data/pack/server/idk.dat');
        case 'loc':
            return shouldBuildConfigOutput('.loc', 'data/pack/server/loc.dat');
        case 'npc':
            return shouldBuildConfigOutput('.npc', 'data/pack/server/npc.dat');
        case 'obj':
            return shouldBuildConfigOutput('.obj', 'data/pack/server/obj.dat');
        case 'spotanim':
            return shouldBuildConfigOutput('.spotanim', 'data/pack/server/spotanim.dat');
        case 'interface':
            return shouldRebuildInterfacePack();
        case 'map':
            return shouldBuildConfigOutput('.npc', 'data/pack/server/npc.dat') || shouldBuildFileAny(`${Environment.build.srcDir}/maps`, 'data/pack/client/versionlist') || shouldBuildFileAny('tools/pack/map', 'data/pack/client/versionlist');
    }
}

export async function rebuildModelFlags(modelFlags: number[]) {
    clearModelFlags(modelFlags);

    const dirTree = new Set<string>();
    readDirTree(dirTree, `${Environment.build.srcDir}/scripts`);

    const builders: Record<ModelFlagGroup, () => Promise<Uint8Array>> = {
        idk: () => buildConfigModelFlags(dirTree, '.idk', parseIdkConfig, packIdkConfigs),
        loc: () => buildConfigModelFlags(dirTree, '.loc', parseLocConfig, packLocConfigs),
        npc: () => buildConfigModelFlags(dirTree, '.npc', parseNpcConfig, packNpcConfigs),
        obj: () => buildConfigModelFlags(dirTree, '.obj', parseObjConfig, packObjConfigs),
        spotanim: () => buildConfigModelFlags(dirTree, '.spotanim', parseSpotAnimConfig, packSpotAnimConfigs),
        interface: buildInterfaceModelFlags,
        map: buildMapModelFlags
    };

    for (const group of MODEL_FLAG_GROUPS) {
        let contribution = !shouldRefreshModelFlagGroup(group) ? loadModelFlagContribution(group) : null;
        if (!contribution) {
            contribution = await builders[group]();
            saveModelFlagContribution(group, contribution);
        }

        applyModelFlagContribution(modelFlags, contribution);
    }
}
