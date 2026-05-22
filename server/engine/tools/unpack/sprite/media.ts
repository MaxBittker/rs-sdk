import fs from 'fs';
import path from 'path';

import FileStream from '#/io/FileStream.js';
import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';
import Pix from '#/cache/graphics/Pix.js';

const cache = new FileStream('data/unpack');
const media = new Jagfile(new Packet(cache.read(0, 4)!));

fs.mkdirSync(`${Environment.build.srcDir}/sprites`, { recursive: true });

for (const name of media.fileName) {
    Pix.unpackFull(media, path.basename(name, path.extname(name)), `${Environment.build.srcDir}/sprites`);
}
