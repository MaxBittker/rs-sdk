import fs from 'fs';

import JagStore from '#jagex2/io/JagStore.js';

const args = process.argv.slice(2);
if (args.length < 2) {
    throw new Error('Usage: node dump-store.js <input-dir> <output-dir>');
}

const inputDir = args[0];
const outputDir = args[1];

const store = new JagStore(outputDir);
for (let index = 0; index <= 4; index++) {
    const count = store.count(index);

    fs.mkdirSync(`${inputDir}/${index}`, { recursive: true });
    for (let file = 0; file < count; file++) {
        const data = store.read(index, file);
        if (!data) {
            continue;
        }

        fs.writeFileSync(`${inputDir}/${index}/${file}`, data);
    }
}
