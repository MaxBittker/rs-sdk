import fs from 'fs';

import { modelsHaveTexture } from '#/cache/graphics/Model.js';
import ColorConversion from '#/util/ColorConversion.js';
import Environment from '#/util/Environment.js';
import { printWarning } from '#/util/Logger.js';
import { IdkPack, ModelPack, TexturePack } from '#tools/pack/PackFile.js';

import { ConfigIdx } from './Common.js';
import { listFilesExt } from '#tools/pack/Parse.js';

function renameModel(id: number, name: string) {
    const existingFiles = listFilesExt(`${Environment.build.srcDir}/models`, '.ob2');

    let model = ModelPack.getById(id);
    if (model.startsWith('model_')) {
        let attempt = `${!name.startsWith('idk_') ? 'idk_' : ''}${name}`;
        let i = 2;
        while (ModelPack.getByName(attempt) !== -1) {
            attempt = `${!name.startsWith('idk_') ? 'idk_' : ''}${name}_${i}`;
            i++;
        }
        if (attempt !== name) {
            name = attempt;
        }

        const filePath = existingFiles.find(x => x.endsWith(`/${model}.ob2`));
        if (filePath) {
            fs.renameSync(filePath, `${Environment.build.srcDir}/models/idk/${name}.ob2`);
        } else {
            console.error('Model not found on filesystem', 'idk', model);
        }

        model = name;
        ModelPack.register(id, model);
    }

    return model;
}

enum IdkPartType {
    man_hair = 0,
    man_jaw = 1,
    man_torso = 2,
    man_arms = 3,
    man_hands = 4,
    man_legs = 5,
    man_feet = 6,
    woman_hair = 7,
    woman_jaw = 8,
    woman_torso = 9,
    woman_arms = 10,
    woman_hands = 11,
    woman_legs = 12,
    woman_feet = 13
}

export function unpackIdkConfig(config: ConfigIdx, id: number, compare?: ConfigIdx, modelRenameOffset?: number): string[] {
    const { dat, pos, len } = config;

    const debugname = IdkPack.getById(id);
    const def: string[] = [];
    def.push(`[${debugname}]`);

    const modelIds: number[] = [];
    const recolSrc: number[] = [];
    const recolDst: number[] = [];

    dat.pos = pos[id];
    while (true) {
        const code = dat.g1();
        if (code === 0) {
            break;
        }

        if (code === 1) {
            const type = dat.g1();

            def.push(`type=${IdkPartType[type]}`);
        } else if (code === 2) {
            const count = dat.g1();
            for (let i = 0; i < count; i++) {
                const modelId = dat.g2();

                modelIds.push(modelId);

                if ((compare && id < compare.size) || modelId < modelRenameOffset!) {
                    const model = ModelPack.getById(modelId);
                    def.push(`model${i + 1}=${model}`);
                } else {
                    const model = renameModel(modelId, debugname);
                    def.push(`model${i + 1}=${model}`);
                }
            }
        } else if (code === 3) {
            def.push('disable=yes');
        } else if (code >= 40 && code < 50) {
            const index = code - 40;
            const recol = dat.g2();

            recolSrc[index] = recol;
        } else if (code >= 50 && code < 60) {
            const index = code - 50;
            const recol = dat.g2();

            recolDst[index] = recol;
        } else if (code >= 60 && code < 70) {
            const index = code - 60 + 1;
            const modelId = dat.g2();

            modelIds.push(modelId);

            if ((compare && id < compare.size) || modelId < modelRenameOffset!) {
                const model = ModelPack.getById(modelId);
                def.push(`head${index}=${model}`);
            } else {
                const model = renameModel(modelId, `${debugname}_head`);
                def.push(`head${index}=${model}`);
            }
        } else {
            printWarning(`unknown idk code ${code}`);
        }
    }

    if (dat.pos !== pos[id] + len[id]) {
        printWarning(`incomplete read: ${dat.pos} != ${pos[id] + len[id]}`);
    }

    const recolCount = recolSrc.length;
    for (let i = 0; i < recolCount; i++) {
        if (typeof recolSrc[i] === 'undefined') {
            continue;
        }

        const index = i + 1;

        const srcRaw = recolSrc[i];
        const dstRaw = recolDst[i];

        const srcRgb = ColorConversion.reverseHsl(srcRaw)[0];
        const dstRgb = ColorConversion.reverseHsl(dstRaw)[0];

        if (srcRaw >= 100 || dstRaw >= 100) {
            // output as rgb
            def.push(`recol${index}s=${srcRgb ?? srcRaw}`);
            def.push(`recol${index}d=${dstRgb ?? dstRaw}`);
        } else if (modelsHaveTexture(modelIds, srcRaw)) {
            // model has the source as a texture - output as texture
            def.push(`retex${index}s=${TexturePack.getById(srcRaw)}`);
            def.push(`retex${index}d=${TexturePack.getById(dstRaw)}`);
        } else {
            // output as rgb
            def.push(`recol${index}s=${srcRgb ?? srcRaw}`);
            def.push(`recol${index}d=${dstRgb ?? dstRaw}`);
        }
    }

    return def;
}
