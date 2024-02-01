import fs from 'fs';
import { loadPack } from '#lostcity/util/NameMap.js';

const models = loadPack('dump/pack/model.pack');

fs.mkdirSync('dump/src/models/idk', { recursive: true });
fs.mkdirSync('dump/src/models/obj', { recursive: true });
fs.mkdirSync('dump/src/models/npc', { recursive: true });
fs.mkdirSync('dump/src/models/spotanim', { recursive: true });
fs.mkdirSync('dump/src/models/loc', { recursive: true });

function renameModel(category: string, id: string, name: string) {
    if (fs.existsSync(`dump/src/models/model_${id}.ob2`)) {
        fs.renameSync(`dump/src/models/model_${id}.ob2`, `dump/src/models/${category}/${name}.ob2`);
        models[id as unknown as number] = name;
    }

    return models[id as unknown as number];
}

const newModelName: Record<string, string> = {};

const locs = fs.readFileSync('dump/src/scripts/all.loc', 'ascii').replace(/\r/g, '').split('\n');
let lastLoc = null;
for (let i = 0; i < locs.length; i++) {
    const line = locs[i];

    if (line.startsWith('[')) {
        lastLoc = line.substring(1, line.indexOf(']'));
        continue;
    }

    if (!line.startsWith('model')) {
        continue;
    }

    const key = line.substring(0, line.indexOf('='));
    const value = line.substring(line.indexOf('=') + 1);

    if (key.startsWith('model')) {
        const id = value.substring(0, value.indexOf(','));
        const modelId = id.substring(id.indexOf('_') + 1);
        const type = value.substring(value.indexOf(',') + 1);

        if (!newModelName[id]) {
            newModelName[id] = 'model_' + lastLoc;
        }

        // TODO: this messes up when models are not uniquely used for a single shape (they should be!)
        // TODO: also look into model_loc_115 using same name for 2226/2227/2228
        let target = newModelName[id];
        switch (type) {
            case 'wall_straight':
                target += '_1';
                break;
            case 'wall_diagonalcorner':
                target += '_2';
                break;
            case 'wall_l':
                target += '_3';
                break;
            case 'wall_squarecorner':
                target += '_4';
                break;
            case 'wall_diagonal':
                target += '_5';
                break;
            case 'walldecor_straight_nooffset':
                target += '_q';
                break;
            case 'walldecor_straight_offset':
                target += '_w';
                break;
            case 'walldecor_diagonal_offset':
                target += '_e';
                break;
            case 'walldecor_diagonal_nooffset':
                target += '_r';
                break;
            case 'walldecor_diagonal_both':
                target += '_t';
                break;
            case 'centrepiece_straight':
                // target += '_8';
                break;
            case 'centrepiece_diagonal':
                target += '_9';
                break;
            case 'grounddecor':
                target += '_0';
                break;
            case 'roof_straight':
                target += '_a';
                break;
            case 'roof_diagonal_with_roofedge':
                target += '_s';
                break;
            case 'roof_diagonal':
                target += '_d';
                break;
            case 'roof_l_concave':
                target += '_f';
                break;
            case 'roof_l_convex':
                target += '_g';
                break;
            case 'roof_flat':
                target += '_h';
                break;
            case 'roofedge_straight':
                target += '_z';
                break;
            case 'roofedge_diagonalcorner':
                target += '_x';
                break;
            case 'roofedge_l':
                target += '_c';
                break;
            case 'roofedge_squarecorner':
                target += '_v';
                break;
            default:
                console.error(type);
                process.exit(1);
        }

        locs[i] = `model=${newModelName[id]}`; // simplify name
        renameModel('loc', modelId, target);

        // check if last line was model and then delete this one if so
        if (locs[i - 1].startsWith('model')) {
            locs.splice(i, 1);
            i--;
            continue;
        }
    }
}
fs.writeFileSync('dump/src/scripts/all.loc', locs.join('\n'));

const idk = fs.readFileSync('dump/src/scripts/all.idk', 'ascii').replace(/\r/g, '').split('\n');
for (let i = 0; i < idk.length; i++) {
    const line = idk[i];
    if (!line.startsWith('model') && !line.startsWith('head')) {
        continue;
    }

    const key = line.substring(0, line.indexOf('='));
    const value = line.substring(line.indexOf('=') + 1);

    if (key.startsWith('model')) {
        const modelId = value.substring(value.indexOf('_') + 1);
        const modelName = renameModel('idk', modelId, `model_${modelId}_idk`);
        idk[i] = `${key}=${modelName}`;
    } else if (key.startsWith('head')) {
        const modelId = value.substring(value.indexOf('_') + 1);
        const modelName = renameModel('idk', modelId, `model_${modelId}_idk_head`);
        idk[i] = `${key}=${modelName}`;
    }
}
fs.writeFileSync('dump/src/scripts/all.idk', idk.join('\n'));

const objs = fs.readFileSync('dump/src/scripts/all.obj', 'ascii').replace(/\r/g, '').split('\n');
for (let i = 0; i < objs.length; i++) {
    const line = objs[i];
    if (!line.startsWith('model') && !line.startsWith('man') && !line.startsWith('woman')) {
        continue;
    }

    const key = line.substring(0, line.indexOf('='));
    let value = line.substring(line.indexOf('=') + 1);

    if (key.startsWith('model')) {
        const modelId = value.substring(value.indexOf('_') + 1);
        const modelName = renameModel('obj', modelId, `model_${modelId}_obj`);
        objs[i] = `${key}=${modelName}`;
    } else if (key === 'manwear') {
        const offset = value.substring(value.indexOf(',') + 1);
        value = value.substring(0, value.indexOf(','));

        const modelId = value.substring(value.indexOf('_') + 1);
        const modelName = renameModel('obj', modelId, `model_${modelId}_obj_wear`);
        objs[i] = `${key}=${modelName},${offset}`;
    } else if (key.startsWith('manwear')) {
        const modelId = value.substring(value.indexOf('_') + 1);
        const modelName = renameModel('obj', modelId, `model_${modelId}_obj_wear`);
        objs[i] = `${key}=${modelName}`;
    } else if (key === 'womanwear') {
        const offset = value.substring(value.indexOf(',') + 1);
        value = value.substring(0, value.indexOf(','));

        const modelId = value.substring(value.indexOf('_') + 1);
        const modelName = renameModel('obj', modelId, `model_${modelId}_obj_wear`);
        objs[i] = `${key}=${modelName},${offset}`;
    } else if (key.startsWith('womanwear')) {
        const modelId = value.substring(value.indexOf('_') + 1);
        const modelName = renameModel('obj', modelId, `model_${modelId}_obj_wear`);
        objs[i] = `${key}=${modelName}`;
    } else if (key.startsWith('manhead')) {
        const modelId = value.substring(value.indexOf('_') + 1);
        const modelName = renameModel('obj', modelId, `model_${modelId}_obj_wear`);
        objs[i] = `${key}=${modelName}`;
    } else if (key.startsWith('womanhead')) {
        const modelId = value.substring(value.indexOf('_') + 1);
        const modelName = renameModel('obj', modelId, `model_${modelId}_obj_wear`);
        objs[i] = `${key}=${modelName}`;
    }
}
fs.writeFileSync('dump/src/scripts/all.obj', objs.join('\n'));

const npcs = fs.readFileSync('dump/src/scripts/all.npc', 'ascii').replace(/\r/g, '').split('\n');
for (let i = 0; i < npcs.length; i++) {
    const line = npcs[i];
    if (!line.startsWith('model') && !line.startsWith('head')) {
        continue;
    }

    const key = line.substring(0, line.indexOf('='));
    const value = line.substring(line.indexOf('=') + 1);

    if (key.startsWith('model')) {
        const modelId = value.substring(value.indexOf('_') + 1);
        const modelName = renameModel('npc', modelId, `model_${modelId}_npc`);
        npcs[i] = `${key}=${modelName}`;
    } else if (key.startsWith('head')) {
        const modelId = value.substring(value.indexOf('_') + 1);
        const modelName = renameModel('npc', modelId, `model_${modelId}_npc_head`);
        npcs[i] = `${key}=${modelName}`;
    }
}
fs.writeFileSync('dump/src/scripts/all.npc', npcs.join('\n'));

const spotanims = fs.readFileSync('dump/src/scripts/all.spotanim', 'ascii').replace(/\r/g, '').split('\n');
for (let i = 0; i < spotanims.length; i++) {
    const line = spotanims[i];
    if (!line.startsWith('model')) {
        continue;
    }

    const key = line.substring(0, line.indexOf('='));
    const value = line.substring(line.indexOf('=') + 1);

    if (key.startsWith('model')) {
        const modelId = value.substring(value.indexOf('_') + 1);
        const modelName = renameModel('spotanim', modelId, `model_${modelId}_spotanim`);
        spotanims[i] = `${key}=${modelName}`;
    }
}
fs.writeFileSync('dump/src/scripts/all.spotanim', spotanims.join('\n'));

fs.writeFileSync(
    'dump/pack/model.pack',
    models
        .map((name, id) => `${id}=${name}`)
        .filter(x => x)
        .join('\n') + '\n'
);
