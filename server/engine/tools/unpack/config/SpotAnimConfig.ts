import fs from 'fs';

import { modelsHaveTexture } from '#/cache/graphics/Model.js';
import ColorConversion from '#/util/ColorConversion.js';
import Environment from '#/util/Environment.js';
import { printWarning } from '#/util/Logger.js';
import { ModelPack, SeqPack, SpotAnimPack, TexturePack } from '#tools/pack/PackFile.js';

import { ConfigIdx } from './Common.js';
import { listFilesExt } from '#tools/pack/Parse.js';

function renameModel(id: number, name: string) {
    const existingFiles = listFilesExt(`${Environment.build.srcDir}/models`, '.ob2');

    let model = ModelPack.getById(id);
    if (model.startsWith('model_')) {
        let attempt = `${!name.startsWith('spot_') ? 'spot_' : ''}${name}`;
        let i = 2;
        while (ModelPack.getByName(attempt) !== -1) {
            attempt = `${!name.startsWith('spot_') ? 'spot_' : ''}${name}_${i}`;
            i++;
        }
        if (attempt !== name) {
            name = attempt;
        }

        const filePath = existingFiles.find(x => x.endsWith(`/${model}.ob2`));
        if (filePath) {
            fs.renameSync(filePath, `${Environment.build.srcDir}/models/spot/${name}.ob2`);
        } else {
            console.error('Model not found on filesystem', 'spot', model);
        }

        model = name;
        ModelPack.register(id, model);
    }

    return model;
}

export function unpackSpotAnimConfig(config: ConfigIdx, id: number, compare?: ConfigIdx, modelRenameOffset?: number): string[] {
    const { dat, pos, len } = config;

    const debugname = SpotAnimPack.getById(id);
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
            const modelId = dat.g2();

            modelIds.push(modelId);

            if ((compare && id < compare.size) || modelId < modelRenameOffset!) {
                const model = ModelPack.getById(modelId);
                def.push(`model=${model}`);
            } else {
                const model = renameModel(modelId, debugname);
                def.push(`model=${model}`);
            }
        } else if (code === 2) {
            const seqId = dat.g2();

            const seqName = SeqPack.getById(seqId) || `seq_${seqId}`;
            def.push(`anim=${seqName}`);
        } else if (code === 3) {
            def.push('hasalpha=yes');
        } else if (code === 4) {
            const resizeh = dat.g2();

            def.push(`resizeh=${resizeh}`);
        } else if (code === 5) {
            const resizev = dat.g2();

            def.push(`resizev=${resizev}`);
        } else if (code === 6) {
            const angle = dat.g2();

            def.push(`angle=${angle}`);
        } else if (code === 7) {
            const ambient = dat.g1b();

            def.push(`ambient=${ambient}`);
        } else if (code === 8) {
            const contrast = dat.g1b();

            def.push(`contrast=${contrast}`);
        } else if (code >= 40 && code < 50) {
            const index = code - 40;
            const recol = dat.g2();

            recolSrc[index] = recol;
        } else if (code >= 50 && code < 60) {
            const index = code - 50;
            const recol = dat.g2();

            recolDst[index] = recol;
        } else {
            printWarning(`unknown spotanim code ${code}`);
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

        if (srcRaw >= 50 || dstRaw >= 50) {
            // texture ids cap at 50, so we can save time knowing it's not a texture id - output as rgb
            def.push(`recol${index}s=${srcRgb ?? srcRaw}`);
            def.push(`recol${index}d=${dstRgb ?? dstRaw}`);
        } else if (modelsHaveTexture(modelIds, srcRaw)) {
            // model has the source as a texture - output as texture
            def.push(`retex${index}s=${TexturePack.getById(srcRaw)}`);
            def.push(`retex${index}d=${TexturePack.getById(dstRaw)}`);
        } else {
            // output as rgb (or fallback to the raw value... edge cases...)
            def.push(`recol${index}s=${srcRgb ?? srcRaw}`);
            def.push(`recol${index}d=${dstRgb ?? dstRaw}`);
        }
    }

    return def;
}
