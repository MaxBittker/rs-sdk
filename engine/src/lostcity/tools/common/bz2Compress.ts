import fs from 'fs';

import BZip2 from '#jagex2/io/BZip2.js';

const args = process.argv.slice(2);

if (args.length < 1) {
    console.log('Usage: node bz2Compress.ts <path/to/folder>');
    process.exit(1);
}

const path = args[0];
const files = fs.readdirSync(path);

BZip2.compressMany(
    files.map(file => `${path}/${file}`),
    true
);
for (let i = 0; i < files.length; i++) {
    fs.renameSync(`${path}/${files[i]}.bz2`, `${path}/${files[i]}`);
}
