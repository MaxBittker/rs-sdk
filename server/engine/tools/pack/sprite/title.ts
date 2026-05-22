import fs from 'fs';

import FileStream from '#/io/FileStream.js';
import { convertImage } from '#tools/pack/PixPack.js';
import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';
import Jagfile from '#/io/Jagfile.js';
import { shouldBuildFile, shouldBuildFileAny } from '#tools/pack/PackFile.js';

export async function packClientTitle(cache: FileStream) {
    const rebuild =
        shouldBuildFileAny(`${Environment.build.srcDir}/title`, 'data/pack/client/title') ||
        shouldBuildFileAny(`${Environment.build.srcDir}/fonts`, 'data/pack/client/title') ||
        shouldBuildFile(`${Environment.build.srcDir}/binary/title.jpg`, 'data/pack/client/title') ||
        shouldBuildFileAny('tools/pack/sprite', 'data/pack/client/title') ||
        shouldBuildFile('tools/pack/PixPack.ts', 'data/pack/client/title');

    if (!rebuild && cache.has(0, 1)) {
        return;
    }

    if (rebuild) {
        const index = Packet.alloc(3);
        const logo = await convertImage(index, `${Environment.build.srcDir}/title`, 'logo');
        const runes = await convertImage(index, `${Environment.build.srcDir}/title`, 'runes');
        const titlebox = await convertImage(index, `${Environment.build.srcDir}/title`, 'titlebox');
        const titlebutton = await convertImage(index, `${Environment.build.srcDir}/title`, 'titlebutton');

        const b12 = await convertImage(index, `${Environment.build.srcDir}/fonts`, 'b12_full');
        const p11 = await convertImage(index, `${Environment.build.srcDir}/fonts`, 'p11_full');
        const p12 = await convertImage(index, `${Environment.build.srcDir}/fonts`, 'p12_full');
        const q8 = await convertImage(index, `${Environment.build.srcDir}/fonts`, 'q8_full');

        const title = Jagfile.new();
        title.write('title.dat', Packet.load(`${Environment.build.srcDir}/binary/title.jpg`, true));
        title.write('index.dat', index);
        title.write('logo.dat', logo);
        title.write('runes.dat', runes);
        title.write('titlebox.dat', titlebox);
        title.write('titlebutton.dat', titlebutton);
        title.write('b12_full.dat', b12);
        title.write('p11_full.dat', p11);
        title.write('p12_full.dat', p12);
        title.write('q8_full.dat', q8);
        title.save('data/pack/client/title');
    }

    cache.write(0, 1, fs.readFileSync('data/pack/client/title'));
}
