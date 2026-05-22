import fs from 'fs';

import { modelsHaveTexture } from '#/cache/graphics/Model.js';
import ColorConversion from '#/util/ColorConversion.js';
import Environment from '#/util/Environment.js';
import { printWarning } from '#/util/Logger.js';
import { ModelPack, NpcPack, SeqPack, TexturePack } from '#tools/pack/PackFile.js';

import { ConfigIdx } from './Common.js';
import { listFilesExt } from '#tools/pack/Parse.js';

function renameModel(id: number, name: string) {
    const existingFiles = listFilesExt(`${Environment.build.srcDir}/models`, '.ob2');

    let model = ModelPack.getById(id);
    if (model.startsWith('model_')) {
        let attempt = `${!name.startsWith('npc_') ? 'npc_' : ''}${name}`;
        let i = 2;
        while (ModelPack.getByName(attempt) !== -1) {
            attempt = `${!name.startsWith('npc_') ? 'npc_' : ''}${name}i${i}`;
            i++;
        }
        if (attempt !== name) {
            name = attempt;
        }

        const filePath = existingFiles.find(x => x.endsWith(`/${model}.ob2`));
        if (filePath) {
            fs.renameSync(filePath, `${Environment.build.srcDir}/models/npc/${name}.ob2`);
        } else {
            console.error('Model not found on filesystem', 'npc', model);
        }

        model = name;
        ModelPack.register(id, model);
    }

    return model;
}

export function unpackNpcConfig(config: ConfigIdx, id: number, compare?: ConfigIdx, modelRenameOffset?: number): string[] {
    const { dat, pos, len } = config;
    dat.pos = pos[id];

    const debugname = NpcPack.getById(id);
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
            const count = dat.g1();

            for (let i = 0; i < count; i++) {
                const index = i + 1;
                const modelId = dat.g2();

                modelIds.push(modelId);

                if ((compare && id < compare.size) || modelId < modelRenameOffset!) {
                    const model = ModelPack.getById(modelId);
                    def.push(`model${index}=${model}`);
                } else {
                    const model = renameModel(modelId, debugname);
                    def.push(`model${index}=${model}`);
                }
            }
        } else if (code === 2) {
            const name = dat.gjstr();
            def.push(`name=${name}`);
        } else if (code === 3) {
            const desc = dat.gjstr();
            def.push(`desc=${desc}`);
        } else if (code === 12) {
            const size = dat.g1b();
            def.push(`size=${size}`);
        } else if (code === 13) {
            const readyanimId = dat.g2();

            const readyanim = SeqPack.getById(readyanimId) || 'seq_ ' + readyanimId;
            def.push(`readyanim=${readyanim}`);
        } else if (code === 14) {
            const walkanimId = dat.g2();

            const walkanim = SeqPack.getById(walkanimId) || 'seq_ ' + walkanimId;
            def.push(`walkanim=${walkanim}`);
        } else if (code === 16) {
            def.push('hasalpha=yes');
        } else if (code === 17) {
            const walkanimId = dat.g2();
            const walkanim_bId = dat.g2();
            const walkanim_lId = dat.g2();
            const walkanim_rId = dat.g2();

            const walkanim = SeqPack.getById(walkanimId) || 'seq_' + walkanimId;
            const walkanim_b = SeqPack.getById(walkanim_bId) || 'seq_' + walkanim_bId;
            const walkanim_l = SeqPack.getById(walkanim_lId) || 'seq_' + walkanim_lId;
            const walkanim_r = SeqPack.getById(walkanim_rId) || 'seq_' + walkanim_rId;

            def.push(`walkanim=${walkanim},${walkanim_b},${walkanim_l},${walkanim_r}`);
        } else if (code >= 30 && code < 35) {
            const index = code - 30 + 1;
            const op = dat.gjstr();
            def.push(`op${index}=${op}`);
        } else if (code === 40) {
            const count = dat.g1();

            for (let i = 0; i < count; i++) {
                recolSrc[i] = dat.g2();
                recolDst[i] = dat.g2();
            }
        } else if (code === 60) {
            const count = dat.g1();

            for (let i = 0; i < count; i++) {
                const index = i + 1;
                const modelId = dat.g2();

                modelIds.push(modelId);

                if ((compare && id < compare.size) || modelId < modelRenameOffset!) {
                    const model = ModelPack.getById(modelId);
                    def.push(`head${index}=${model}`);
                } else {
                    const model = renameModel(modelId, `${debugname}_head`);
                    def.push(`head${index}=${model}`);
                }
            }
        } else if (code === 93) {
            def.push('minimap=no');
        } else if (code === 95) {
            const vislevel = dat.g2();
            if (vislevel === 0) {
                def.push('vislevel=hide');
            } else {
                def.push(`vislevel=${vislevel}`);
            }
        } else if (code === 97) {
            const resizeh = dat.g2();
            def.push(`resizeh=${resizeh}`);
        } else if (code === 98) {
            const resizev = dat.g2();
            def.push(`resizev=${resizev}`);
        } else if (code === 99) {
            def.push('alwaysontop=yes');
        } else if (code === 100) {
            const ambient = dat.g1b();
            def.push(`ambient=${ambient}`);
        } else if (code === 101) {
            const contrast = dat.g1b();
            def.push(`contrast=${contrast}`);
        } else if (code === 102) {
            const headicon = dat.g2();
            def.push(`headicon=${headicon}`);
        } else if (code === 103) {
            const turnspeed = dat.g2();
            def.push(`turnspeed=${turnspeed}`);
        } else {
            printWarning(`unknown npc code ${code}`);
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
