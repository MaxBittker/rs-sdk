import { parentPort } from 'worker_threads';

import FileStream from '#/io/FileStream.js';
import Environment from '#/util/Environment.js';

import { ModelPack, revalidatePack } from '#tools/pack/PackFile.js';
import { packClientWordenc } from '#tools/pack/chat/pack.js';
import { packConfigs } from '#tools/pack/config/PackShared.js';
import { packClientGraphics } from '#tools/pack/graphics/pack.js';
import { packClientInterface, shouldRebuildInterfacePack } from '#tools/pack/interface/PackClient.js';
import { packMaps } from '#tools/pack/map/Pack.js';
import { packClientMidi } from '#tools/pack/midi/pack.js';
import { packClientSound } from '#tools/pack/sound/pack.js';
import { packClientMedia } from '#tools/pack/sprite/media.js';
import { packClientTexture } from '#tools/pack/sprite/textures.js';
import { packClientTitle } from '#tools/pack/sprite/title.js';
import { loadCachedModelFlags, packClientVersionList, shouldRebuildVersionListPack } from '#tools/pack/versionlist/pack.js';
import { clearFsCache, fileExists } from '#tools/pack/FsCache.js';
import { shouldBuild, shouldBuildFileAny, shouldBuildFileList } from '#tools/pack/PackFile.js';

const COMPILER_DIRECT_SOURCE_EXTENSIONS = ['.constant', '.dbrow', '.dbtable', '.inv', '.param', '.varbit', '.varn', '.varp', '.vars'];

const MODEL_FLAG_CONFIG_EXTENSIONS = ['.idk', '.loc', '.npc', '.obj', '.spotanim'];

function shouldBuildFromScripts(exts: string[], out: string) {
    for (const ext of exts) {
        if (shouldBuild(`${Environment.build.srcDir}/scripts`, ext, out)) {
            return true;
        }
    }

    return false;
}

function shouldRunServerCompiler() {
    const out = 'data/pack/server/script.dat';

    return (
        !fileExists('data/pack/server/script.idx') ||
        shouldBuild(`${Environment.build.srcDir}/scripts`, '.rs2', out) ||
        shouldBuildFromScripts(COMPILER_DIRECT_SOURCE_EXTENSIONS, out) ||
        shouldBuildFileList(
            [
                `${Environment.build.srcDir}/pack/category.pack`,
                `${Environment.build.srcDir}/pack/dbrow.pack`,
                `${Environment.build.srcDir}/pack/dbtable.pack`,
                `${Environment.build.srcDir}/pack/enum.pack`,
                `${Environment.build.srcDir}/pack/hunt.pack`,
                `${Environment.build.srcDir}/pack/idk.pack`,
                `${Environment.build.srcDir}/pack/interface.pack`,
                `${Environment.build.srcDir}/pack/inv.pack`,
                `${Environment.build.srcDir}/pack/loc.pack`,
                `${Environment.build.srcDir}/pack/mesanim.pack`,
                `${Environment.build.srcDir}/pack/midi.pack`,
                `${Environment.build.srcDir}/pack/npc.pack`,
                `${Environment.build.srcDir}/pack/obj.pack`,
                `${Environment.build.srcDir}/pack/param.pack`,
                `${Environment.build.srcDir}/pack/script.pack`,
                `${Environment.build.srcDir}/pack/seq.pack`,
                `${Environment.build.srcDir}/pack/spotanim.pack`,
                `${Environment.build.srcDir}/pack/struct.pack`,
                `${Environment.build.srcDir}/pack/varbit.pack`,
                `${Environment.build.srcDir}/pack/varn.pack`,
                `${Environment.build.srcDir}/pack/varp.pack`,
                `${Environment.build.srcDir}/pack/vars.pack`,
                'src/cache/config/Component.ts',
                'src/cache/config/DbTableType.ts',
                'src/cache/config/InvType.ts',
                'src/cache/config/ParamType.ts',
                'src/cache/config/ScriptVarType.ts',
                'src/cache/config/VarBitType.ts',
                'src/cache/config/VarNpcType.ts',
                'src/cache/config/VarPlayerType.ts',
                'src/cache/config/VarSharedType.ts',
                'src/engine/entity/NpcMode.ts',
                'src/engine/entity/NpcStat.ts',
                'src/engine/entity/PlayerStat.ts',
                'src/engine/script/ScriptOpcode.ts',
                'src/engine/script/ScriptOpcodePointers.ts',
                'tools/pack/Compiler.ts',
                'data/pack/server/interface.dat',
                'data/pack/server/inv.dat',
                'data/pack/server/inv.idx',
                'data/pack/server/param.dat',
                'data/pack/server/param.idx',
                'data/pack/server/varp.dat',
                'data/pack/server/varp.idx',
                'data/pack/server/varbit.dat',
                'data/pack/server/varbit.idx',
                'data/pack/server/varn.dat',
                'data/pack/server/varn.idx',
                'data/pack/server/vars.dat',
                'data/pack/server/vars.idx',
                'data/pack/server/dbtable.dat',
                'data/pack/server/dbtable.idx'
            ],
            out
        )
    );
}

function shouldRebuildModelFlagSources() {
    return (
        shouldBuildFromScripts(MODEL_FLAG_CONFIG_EXTENSIONS, 'data/pack/client/versionlist') ||
        shouldRebuildInterfacePack() ||
        shouldBuild(`${Environment.build.srcDir}/scripts`, '.if', 'data/pack/client/versionlist') ||
        shouldBuildFileAny(`${Environment.build.srcDir}/maps`, 'data/pack/client/versionlist') ||
        shouldBuildFileAny('tools/pack/map', 'data/pack/client/versionlist') ||
        shouldBuildFileAny('tools/pack/interface', 'data/pack/client/versionlist') ||
        shouldBuildFileList(
            ['tools/pack/config/IdkConfig.ts', 'tools/pack/config/LocConfig.ts', 'tools/pack/config/NpcConfig.ts', 'tools/pack/config/ObjConfig.ts', 'tools/pack/config/SpotAnimConfig.ts', 'tools/pack/ModelFlags.ts'],
            'data/pack/client/versionlist'
        )
    );
}

export async function packAll(modelFlags: number[]) {
    if (parentPort) {
        parentPort.postMessage({
            type: 'dev_progress',
            broadcast: 'Packing changes'
        });
    }

    clearFsCache();
    await revalidatePack();

    for (let i = 0; i < ModelPack.max; i++) {
        modelFlags[i] = 0;
    }

    // todo: better build conditions to do minimal rebuilds and only build a new client cache if necessary
    const cache = new FileStream('data/pack');
    const shouldRebuildVersionList = shouldRebuildVersionListPack();
    const shouldRefreshModelFlags = shouldRebuildVersionList && shouldRebuildModelFlagSources();

    await packConfigs(cache, modelFlags);
    packClientInterface(cache, modelFlags);

    // relies on reading configs/interfaces for compile-time context
    if (shouldRunServerCompiler()) {
        const { runServerCompiler } = await import('#tools/pack/Compiler.js');
        runServerCompiler();
    }

    await packClientTitle(cache);
    await packClientMedia(cache);
    await packClientTexture(cache);
    packClientWordenc(cache);
    packClientSound(cache);

    packClientGraphics(cache, modelFlags);

    packClientMidi(cache);

    await packMaps(cache, modelFlags);

    if (shouldRebuildVersionList) {
        const rebuildModelFlagsForVersionList = async () => {
            const { rebuildModelFlags } = await import('#tools/pack/ModelFlags.js');
            await rebuildModelFlags(modelFlags);
        };

        if (shouldRefreshModelFlags) {
            await rebuildModelFlagsForVersionList();
        } else if (!loadCachedModelFlags(modelFlags)) {
            await rebuildModelFlagsForVersionList();
        }
    }

    packClientVersionList(cache, modelFlags); // relies on additional flags set during packMaps

    if (parentPort) {
        parentPort.postMessage({
            type: 'dev_progress',
            text: 'Reloading with changes'
        });
    }
}
