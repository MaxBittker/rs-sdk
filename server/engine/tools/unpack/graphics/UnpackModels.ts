import fs from 'fs';
import zlib from 'zlib';

import FileStream from '#/io/FileStream.js';
import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';

import Environment from '#/util/Environment.js';
import { printDebug, printWarning } from '#/util/Logger.js';

import { PackFile } from '#tools/pack/PackFileBase.js';
import { listFilesExt } from '#tools/pack/Parse.js';

export const ModelPack = new PackFile('model');

const cache = new FileStream('data/unpack');

const existingFiles = listFilesExt(`${Environment.build.srcDir}/models`, '.ob2');

if (!fs.existsSync(`${Environment.build.srcDir}/models/_unpack`)) {
    fs.mkdirSync(`${Environment.build.srcDir}/models/_unpack`, { recursive: true });
}

const versionlist = new Jagfile(new Packet(cache.read(0, 5)));

const models = [];

const modelIndex = versionlist.read('model_index');
if (modelIndex) {
    for (let id = 0; id < modelIndex.length; id++) {
        models[id] = modelIndex.g1();
    }
}

const modelCount = cache.count(1);
console.log(`Extracting ${modelCount} models`);

for (let id = 0; id <= models.length; id++) {
    if (!ModelPack.getById(id)) {
        ModelPack.register(id, `model_${id}`);
    }
    const name = ModelPack.getById(id);

    const existingFile = existingFiles.find(x => x.endsWith(`/${name}.ob2`));
    const destFile = existingFile ?? `${Environment.build.srcDir}/models/_unpack/${name}.ob2`;

    const model = cache.read(1, id);
    if (model) {
        fs.writeFileSync(destFile, zlib.gunzipSync(model));
    } else if (models[id]) {
        printWarning(`Missing model ${name}`);
    } else {
        printDebug(`Missing unreferenced model ${name}`);
    }
}

ModelPack.save();
