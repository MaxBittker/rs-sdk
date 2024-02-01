import fs from 'fs';
import zlib from 'zlib';

import JagStore from '#jagex2/io/JagStore.js';

const args = process.argv.slice(2);
if (args.length < 2) {
    throw new Error('Usage: node dump-store.js <input-dir> <output-dir>');
}

const inputDir = args[0];
const outputDir = args[1];

const names = [['', 'title', 'config', 'interface', 'media', 'versionlist', 'textures', 'wordenc', 'sounds'], [], [], [], []];
const extensions = ['jag', 'dat', 'dat', 'mid', 'dat'];

const store = new JagStore(inputDir);
for (let index = 0; index <= 4; index++) {
    fs.mkdirSync(`${outputDir}/${index}`, { recursive: true });

    const count = store.count(index);
    for (let file = 0; file < count; file++) {
        let data = store.read(index, file);
        if (!data) {
            continue;
        }

        const name = names[index][file];

        if (index > 0) {
            const version = (((data[data.length - 2] << 8) | data[data.length - 1]) >>> 0) - 1;
            data = zlib.gunzipSync(data);
            fs.writeFileSync(`${outputDir}/${index}/${name?.length > 0 ? name.replaceAll(' ', '_') : file}.${version}.${extensions[index]}`, data);
        } else {
            fs.writeFileSync(`${outputDir}/${index}/${name?.length > 0 ? name.replaceAll(' ', '_') : file}.${extensions[index]}`, data);
        }
    }
}
