import fs from 'fs';

import FileStream from '#/io/FileStream.js';
import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';
import Pix from '#/cache/graphics/Pix.js';

const cache = new FileStream('data/unpack');
const title = new Jagfile(new Packet(cache.read(0, 1)!));

if (!fs.existsSync(`${Environment.build.srcDir}/binary`)) {
    fs.mkdirSync(`${Environment.build.srcDir}/binary`, { recursive: true });
}

if (!fs.existsSync(`${Environment.build.srcDir}/title`)) {
    fs.mkdirSync(`${Environment.build.srcDir}/title`, { recursive: true });
}

if (!fs.existsSync(`${Environment.build.srcDir}/fonts`)) {
    fs.mkdirSync(`${Environment.build.srcDir}/fonts`, { recursive: true });
}

const background = title.read('title.dat');
if (background) {
    fs.writeFileSync(`${Environment.build.srcDir}/binary/title.jpg`, background.data);
}

const fonts = ['b12_full', 'p11_full', 'p12_full', 'q8_full'];

for (const name of fonts) {
    Pix.unpackFull(title, name, `${Environment.build.srcDir}/fonts`);
}

const titleImages = ['logo', 'runes', 'titlebox', 'titlebutton'];

for (const name of titleImages) {
    Pix.unpackFull(title, name, `${Environment.build.srcDir}/title`);
}
