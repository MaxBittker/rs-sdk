import fs from 'fs';

import FileStream from '#/io/FileStream.js';
import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';
import Pix from '#/cache/graphics/Pix.js';
import { TexturePack } from '#tools/pack/PackFile.js';

const cache = new FileStream('data/unpack');
const textures = new Jagfile(new Packet(cache.read(0, 6)!));

fs.mkdirSync(`${Environment.build.srcDir}/textures`, { recursive: true });

TexturePack.clear();
TexturePack.load(`${Environment.build.srcDir}/pack/texture.pack`);

for (let id = 0; id < 50; id++) {
    const name = TexturePack.getById(id) || id.toString();
    TexturePack.register(id, name);

    await Pix.unpackFull(textures, id.toString(), `${Environment.build.srcDir}/textures`, name);
}

TexturePack.save();
