import fs from 'fs';

import JagStore from '#jagex2/io/JagStore.js';

const args = process.argv.slice(2);
if (args.length < 2) {
    throw new Error('Usage: node pack-store.js <input-dir> <output-dir>');
}

const inputDir = args[0];
const outputDir = args[1];

const store = new JagStore(outputDir, true);

for (let i = 0; i <= 4; i++) {
    const files = fs.readdirSync(`${inputDir}/` + i);
    files.sort((a, b) => parseInt(a) - parseInt(b));

    for (let j = 0; j < files.length; j++) {
        const file = files[j];
        const data = fs.readFileSync(`${inputDir}/` + i + '/' + file);

        store.write(i, parseInt(file), data);
    }
}
