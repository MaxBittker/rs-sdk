import fs from 'fs';

import { modelsHaveTexture } from '#/cache/graphics/Model.js';
import ColorConversion from '#/util/ColorConversion.js';
import Environment from '#/util/Environment.js';
import { printWarning } from '#/util/Logger.js';
import { ModelPack, ObjPack, SeqPack, TexturePack } from '#tools/pack/PackFile.js';

import { ConfigIdx } from './Common.js';
import { listFilesExt } from '#tools/pack/Parse.js';

function renameModel(id: number, name: string) {
    const existingFiles = listFilesExt(`${Environment.build.srcDir}/models`, '.ob2');

    let model = ModelPack.getById(id);
    if (model.startsWith('model_')) {
        let attempt = `${!name.startsWith('obj_') ? 'obj_' : ''}${name}`;
        let i = 2;
        while (ModelPack.getByName(attempt) !== -1) {
            attempt = `${!name.startsWith('obj_') ? 'obj_' : ''}${name}i${i}`;
            i++;
        }
        if (attempt !== name) {
            name = attempt;
        }

        const filePath = existingFiles.find(x => x.endsWith(`/${model}.ob2`));
        if (filePath) {
            fs.renameSync(filePath, `${Environment.build.srcDir}/models/obj/${name}.ob2`);
        } else {
            console.error('Model not found on filesystem', 'obj', model);
        }

        model = name;
        ModelPack.register(id, model);
    }

    return model;
}

export function unpackObjConfig(config: ConfigIdx, id: number, compare?: ConfigIdx, modelRenameOffset?: number): string[] {
    const { dat, pos, len } = config;
    dat.pos = pos[id];

    const debugname = ObjPack.getById(id);
    const def: string[] = [];
    def.push(`[${debugname}]`);

    const modelIds: number[] = [];
    const recolSrc: number[] = [];
    const recolDst: number[] = [];

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
            const name = dat.gjstr();
            def.push(`name=${name}`);
        } else if (code === 3) {
            const desc = dat.gjstr();
            def.push(`desc=${desc}`);
        } else if (code === 4) {
            const zoom2d = dat.g2();
            def.push(`2dzoom=${zoom2d}`);
        } else if (code === 5) {
            const xan2d = dat.g2();
            def.push(`2dxan=${xan2d}`);
        } else if (code === 6) {
            const yan2d = dat.g2();
            def.push(`2dyan=${yan2d}`);
        } else if (code === 7) {
            const xof2d = dat.g2s();
            def.push(`2dxof=${xof2d}`);
        } else if (code === 8) {
            const yof2d = dat.g2s();
            def.push(`2dyof=${yof2d}`);
        } else if (code === 9) {
            def.push('code9=yes');
        } else if (code === 10) {
            const seqId = dat.g2();

            const seq = SeqPack.getById(seqId) || 'seq_' + seqId;
            def.push(`code10=${seq}`);
        } else if (code === 11) {
            def.push('stackable=yes');
        } else if (code === 12) {
            const cost = dat.g4s();
            def.push(`cost=${cost}`);
        } else if (code === 16) {
            def.push('members=yes');
        } else if (code === 23) {
            const modelId = dat.g2();
            const offset = dat.g1b();

            modelIds.push(modelId);

            if ((compare && id < compare.size) || modelId < modelRenameOffset!) {
                const model = ModelPack.getById(modelId);
                def.push(`manwear=${model},${offset}`);
            } else {
                const model = renameModel(modelId, `${debugname}_manwear`);
                def.push(`manwear=${model},${offset}`);
            }
        } else if (code === 24) {
            const modelId = dat.g2();

            modelIds.push(modelId);

            if ((compare && id < compare.size) || modelId < modelRenameOffset!) {
                const model = ModelPack.getById(modelId);
                def.push(`manwear2=${model}`);
            } else {
                const model = renameModel(modelId, `${debugname}_manwear2`);
                def.push(`manwear2=${model}`);
            }
        } else if (code === 25) {
            const modelId = dat.g2();
            const offset = dat.g1b();

            modelIds.push(modelId);

            if ((compare && id < compare.size) || modelId < modelRenameOffset!) {
                const model = ModelPack.getById(modelId);
                def.push(`womanwear=${model},${offset}`);
            } else {
                const model = renameModel(modelId, `${debugname}_womanwear`);
                def.push(`womanwear=${model},${offset}`);
            }
        } else if (code === 26) {
            const modelId = dat.g2();

            modelIds.push(modelId);

            if ((compare && id < compare.size) || modelId < modelRenameOffset!) {
                const model = ModelPack.getById(modelId);
                def.push(`womanwear2=${model}`);
            } else {
                const model = renameModel(modelId, `${debugname}_womanwear2`);
                def.push(`womanwear2=${model}`);
            }
        } else if (code >= 30 && code < 35) {
            const index = code - 30 + 1;
            const op = dat.gjstr();
            def.push(`op${index}=${op}`);
        } else if (code >= 35 && code < 40) {
            const index = code - 35 + 1;
            const op = dat.gjstr();
            def.push(`iop${index}=${op}`);
        } else if (code === 40) {
            const count = dat.g1();

            for (let i = 0; i < count; i++) {
                recolSrc[i] = dat.g2();
                recolDst[i] = dat.g2();
            }
        } else if (code === 78) {
            const modelId = dat.g2();

            modelIds.push(modelId);

            if ((compare && id < compare.size) || modelId < modelRenameOffset!) {
                const model = ModelPack.getById(modelId);
                def.push(`manwear3=${model}`);
            } else {
                const model = renameModel(modelId, `${debugname}_manwear3`);
                def.push(`manwear3=${model}`);
            }
        } else if (code === 79) {
            const modelId = dat.g2();

            modelIds.push(modelId);

            if ((compare && id < compare.size) || modelId < modelRenameOffset!) {
                const model = ModelPack.getById(modelId);
                def.push(`womanwear3=${model}`);
            } else {
                const model = renameModel(modelId, `${debugname}_womanwear3`);
                def.push(`womanwear3=${model}`);
            }
        } else if (code === 90) {
            const modelId = dat.g2();

            modelIds.push(modelId);

            if ((compare && id < compare.size) || modelId < modelRenameOffset!) {
                const model = ModelPack.getById(modelId);
                def.push(`manhead=${model}`);
            } else {
                const model = renameModel(modelId, `${debugname}_manhead`);
                def.push(`manhead=${model}`);
            }
        } else if (code === 91) {
            const modelId = dat.g2();

            modelIds.push(modelId);

            if ((compare && id < compare.size) || modelId < modelRenameOffset!) {
                const model = ModelPack.getById(modelId);
                def.push(`womanhead=${model}`);
            } else {
                const model = renameModel(modelId, `${debugname}_womanhead`);
                def.push(`womanhead=${model}`);
            }
        } else if (code === 92) {
            const modelId = dat.g2();

            modelIds.push(modelId);

            if ((compare && id < compare.size) || modelId < modelRenameOffset!) {
                const model = ModelPack.getById(modelId);
                def.push(`manhead2=${model}`);
            } else {
                const model = renameModel(modelId, `${debugname}_manhead2`);
                def.push(`manhead2=${model}`);
            }
        } else if (code === 93) {
            const modelId = dat.g2();

            modelIds.push(modelId);

            if ((compare && id < compare.size) || modelId < modelRenameOffset!) {
                const model = ModelPack.getById(modelId);
                def.push(`womanhead2=${model}`);
            } else {
                const model = renameModel(modelId, `${debugname}_womanhead2`);
                def.push(`womanhead2=${model}`);
            }
        } else if (code === 95) {
            const zan2d = dat.g2();
            def.push(`2dzan=${zan2d}`);
        } else if (code === 97) {
            const objId = dat.g2();

            const obj = ObjPack.getById(objId) || 'obj_' + objId;
            def.push(`certlink=${obj}`);
        } else if (code === 98) {
            const objId = dat.g2();

            const obj = ObjPack.getById(objId) || 'obj_' + objId;
            def.push(`certtemplate=${obj}`);
        } else if (code >= 100 && code < 110) {
            const index = code - 100 + 1;
            const objId = dat.g2();
            const count = dat.g2();

            const objName = ObjPack.getById(objId) || 'obj_' + objId;
            def.push(`count${index}=${objName},${count}`);
        } else if (code === 110) {
            const resizex = dat.g2();
            def.push(`resizex=${resizex}`);
        } else if (code === 111) {
            const resizey = dat.g2();
            def.push(`resizey=${resizey}`);
        } else if (code === 112) {
            const resizez = dat.g2();
            def.push(`resizez=${resizez}`);
        } else if (code === 113) {
            const ambient = dat.g1b();
            def.push(`ambient=${ambient}`);
        } else if (code === 114) {
            const contrast = dat.g1b();
            def.push(`contrast=${contrast}`);
        } else {
            printWarning(`unknown obj code ${code}`);
        }
    }

    if (dat.pos !== pos[id] + len[id]) {
        printWarning(`incomplete read: ${dat.pos} != ${pos[id] + len[id]}`);
    }

    const recolCount = recolSrc.length;
    for (let i = 0; i < recolCount; i++) {
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
