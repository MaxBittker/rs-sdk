import fs from 'fs';
import path from 'path';

import { compressGz } from '#/io/GZip.js';
import FileStream from '#/io/FileStream.js';
import Environment from '#/util/Environment.js';
import { getArtifactManifestPath, getArtifactSourceStamp, loadArtifactManifest, openArtifactStore, saveArtifactManifest } from '#tools/pack/ArtifactCache.js';
import { didFileSetChange } from '#tools/pack/FsCache.js';
import { listFilesExt } from '#tools/pack/Parse.js';
import { AnimSetPack, ModelPack, shouldBuild, shouldBuildFile } from '#tools/pack/PackFile.js';
import { printWarning } from '#/util/Logger.js';

export function packClientGraphics(cache: FileStream, modelFlags: number[]) {
    const models = listFilesExt(`${Environment.build.srcDir}/models`, '.ob2');
    const toolChanged = didFileSetChange('data/pack/.stamps/graphics-tools.txt', [import.meta.filename]);
    const rebuildModelsArchive = shouldBuildFile(`${Environment.build.srcDir}/pack/model.pack`, 'data/pack/main_file_cache.idx1');
    const needsModelHydration = rebuildModelsArchive || cache.count(1) === 0;
    const needsModelPackWork = rebuildModelsArchive || shouldBuild(`${Environment.build.srcDir}/models`, '.ob2', getArtifactManifestPath('graphics-models')) || toolChanged;
    const modelStore = openArtifactStore('graphics-models', rebuildModelsArchive);
    const modelManifest = loadArtifactManifest('graphics-models', rebuildModelsArchive);
    let modelManifestDirty = false;

    if (rebuildModelsArchive) {
        cache.clearArchive(1);
    }

    const anims = listFilesExt(`${Environment.build.srcDir}/models`, '.anim');
    const rebuildAnimsArchive = shouldBuildFile(`${Environment.build.srcDir}/pack/animset.pack`, 'data/pack/main_file_cache.idx2');
    const needsAnimHydration = rebuildAnimsArchive || cache.count(2) === 0;
    const needsAnimPackWork = rebuildAnimsArchive || shouldBuild(`${Environment.build.srcDir}/models`, '.anim', getArtifactManifestPath('graphics-anims')) || toolChanged;
    const animStore = openArtifactStore('graphics-anims', rebuildAnimsArchive);
    const animManifest = loadArtifactManifest('graphics-anims', rebuildAnimsArchive);
    let animManifestDirty = false;

    if (rebuildAnimsArchive) {
        cache.clearArchive(2);
    }

    if (!needsModelPackWork && !needsModelHydration && !needsAnimPackWork && !needsAnimHydration) {
        return;
    }

    for (const file of models) {
        const name = path.basename(file, '.ob2');
        const id = ModelPack.getByName(name);
        const sourceStamp = getArtifactSourceStamp(file);
        const needsRebuild = needsModelPackWork && (toolChanged || modelManifest[name] !== sourceStamp || !modelStore.has(name));
        let packedData: Uint8Array | null = null;

        if (needsRebuild) {
            const data = fs.readFileSync(file);
            if (data.length) {
                packedData = compressGz(data)!;
                modelStore.write(name, packedData);
            } else {
                packedData = new Uint8Array();
                modelStore.write(name, packedData);
            }

            modelManifest[name] = sourceStamp;
            modelManifestDirty = true;
        }

        if (needsRebuild || needsModelHydration) {
            packedData ??= modelStore.read(name);
            if (packedData) {
                cache.write(1, id, packedData, 1);
            }
        }
    }

    let hasModelReferences = false;
    for (let id = 0; id < modelFlags.length; id++) {
        if (modelFlags[id] > 0) {
            hasModelReferences = true;
            break;
        }
    }

    if (hasModelReferences) {
        for (let id = 0; id < ModelPack.max; id++) {
            if (!cache.has(1, id)) {
                if (modelFlags[id] > 0) {
                    printWarning(`missing model ${ModelPack.getById(id)} (${id})`);
                } else {
                    // printDebug(`missing model ${ModelPack.getById(id)} (${id})`);
                }
            }
        }
    }

    for (const file of anims) {
        const name = path.basename(file, '.anim');
        const id = AnimSetPack.getByName(name);
        const sourceStamp = getArtifactSourceStamp(file);
        const needsRebuild = needsAnimPackWork && (toolChanged || animManifest[name] !== sourceStamp || !animStore.has(name));
        let packedData: Uint8Array | null = null;

        if (needsRebuild) {
            const data = fs.readFileSync(file);
            if (data.length) {
                packedData = compressGz(data)!;
                animStore.write(name, packedData);
            } else {
                packedData = new Uint8Array();
                animStore.write(name, packedData);
            }

            animManifest[name] = sourceStamp;
            animManifestDirty = true;
        }

        if (needsRebuild || needsAnimHydration) {
            packedData ??= animStore.read(name);
            if (packedData) {
                cache.write(2, id, packedData, 1);
            }
        }
    }

    if (modelManifestDirty) {
        saveArtifactManifest('graphics-models', modelManifest);
    }

    modelStore.save();

    if (animManifestDirty) {
        saveArtifactManifest('graphics-anims', animManifest);
    }

    animStore.save();
}
