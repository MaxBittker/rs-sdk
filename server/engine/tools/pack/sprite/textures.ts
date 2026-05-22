import fs from 'fs';

import FileStream from '#/io/FileStream.js';
import Packet from '#/io/Packet.js';
import { convertImage } from '#tools/pack/PixPack.js';
import Environment from '#/util/Environment.js';
import Jagfile from '#/io/Jagfile.js';
import { TexturePack } from '#tools/pack/PackFile.js';
import { shouldBuildFile, shouldBuildFileAny } from '#tools/pack/PackFile.js';

export async function packClientTexture(cache: FileStream) {
    const rebuild =
        shouldBuildFileAny(`${Environment.build.srcDir}/textures`, 'data/pack/client/textures') ||
        shouldBuildFile(`${Environment.build.srcDir}/pack/texture.pack`, 'data/pack/client/textures') ||
        shouldBuildFileAny('tools/pack/sprite', 'data/pack/client/textures') ||
        shouldBuildFile('tools/pack/PixPack.ts', 'data/pack/client/textures');

    if (!rebuild && cache.has(0, 6)) {
        return;
    }

    if (rebuild) {
        const index = Packet.alloc(3);

        const all = [];
        for (let id = 0; id < 50; id++) {
            all.push(await convertImage(index, `${Environment.build.srcDir}/textures`, TexturePack.getById(id)));
        }

        const textures = Jagfile.new();
        textures.write('index.dat', index);
        for (let id = 0; id < all.length; id++) {
            textures.write(`${id}.dat`, all[id]);
        }
        textures.save('data/pack/client/textures');
    }

    cache.write(0, 6, fs.readFileSync('data/pack/client/textures'));
}
