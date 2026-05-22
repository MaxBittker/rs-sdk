import fs from 'fs';
import path from 'path';

import FileStream from '#/io/FileStream.js';
import Packet from '#/io/Packet.js';
import Jagfile from '#/io/Jagfile.js';
import { listFilesExt } from '#tools/pack/Parse.js';
import Environment from '#/util/Environment.js';
import { loadOrder } from '#tools/pack/NameMap.js';
import { SynthPack, shouldBuildFile, shouldBuildFileAny } from '#tools/pack/PackFile.js';

export function packClientSound(cache: FileStream) {
    const rebuild =
        shouldBuildFileAny(`${Environment.build.srcDir}/synth`, 'data/pack/client/sounds') ||
        shouldBuildFile(`${Environment.build.srcDir}/pack/synth.order`, 'data/pack/client/sounds') ||
        shouldBuildFile(`${Environment.build.srcDir}/pack/synth.pack`, 'data/pack/client/sounds') ||
        shouldBuildFileAny('tools/pack/sound', 'data/pack/client/sounds');

    if (!rebuild && cache.has(0, 8)) {
        return;
    }

    if (rebuild) {
        const order = loadOrder(`${Environment.build.srcDir}/pack/synth.order`);
        const files = listFilesExt(`${Environment.build.srcDir}/synth`, '.synth');

        const nameToFile = new Map();
        for (const file of files) {
            const name = path.basename(file, path.extname(file));
            const id = SynthPack.getByName(name);
            if (id === -1) {
                continue;
            }

            nameToFile.set(name, file);
        }

        const jag = Jagfile.new();

        const out = Packet.alloc(5);
        for (const id of order) {
            const name = SynthPack.getById(id);
            if (!name) {
                continue;
            }

            const file = nameToFile.get(name);
            if (!file) {
                continue;
            }

            out.p2(id);
            const data = fs.readFileSync(file);
            out.pdata(data, 0, data.length);
        }
        out.p2(-1);

        if (Environment.build.verify && !Packet.checkcrc(out.data, 0, out.pos, 2127412105)) {
            throw new Error('.synth checksum mismatch!\nYou can disable this safety check by setting BUILD_VERIFY=false');
        }

        jag.write('sounds.dat', out);
        jag.save('data/pack/client/sounds');
        out.release();
    }

    cache.write(0, 8, fs.readFileSync('data/pack/client/sounds'));
}
