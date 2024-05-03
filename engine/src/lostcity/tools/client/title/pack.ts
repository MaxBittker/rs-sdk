import Jagfile from '#jagex2/io/Jagfile.js';
import Packet from '#jagex2/io/Packet.js';
import { shouldBuildFileAny } from '#lostcity/util/PackFile.js';

import { convertImage } from '#lostcity/util/PixPack.js';

export async function packClientTitle() {
    if (!shouldBuildFileAny('data/src/binary', 'data/pack/client/title') &&
        !shouldBuildFileAny('data/src/fonts', 'data/pack/client/title') &&
        !shouldBuildFileAny('data/src/title', 'data/pack/client/title')) {
        return;
    }

    console.log('Packing title.jag');
    //console.time('title.jag');

    const order = ['p11.dat', 'p12.dat', 'titlebox.dat', 'title.dat', 'runes.dat', 'q8.dat', 'index.dat', 'titlebutton.dat', 'logo.dat', 'b12.dat'];

    const files: Record<string, Packet> = {};

    const title = Packet.load('data/src/binary/title.jpg');
    title.pos = title.data.length;

    files['title.dat'] = title;

    // ----

    const index = Packet.alloc(1);

    // TODO (jkm) check for presence , rather than using `!`

    const p11 = await convertImage(index, 'data/src/fonts', 'p11');
    files['p11.dat'] = p11!;

    const p12 = await convertImage(index, 'data/src/fonts', 'p12');
    files['p12.dat'] = p12!;

    const b12 = await convertImage(index, 'data/src/fonts', 'b12');
    files['b12.dat'] = b12!;

    const q8 = await convertImage(index, 'data/src/fonts', 'q8');
    files['q8.dat'] = q8!;

    const logo = await convertImage(index, 'data/src/title', 'logo');
    files['logo.dat'] = logo!;

    const titlebox = await convertImage(index, 'data/src/title', 'titlebox');
    files['titlebox.dat'] = titlebox!;

    const titlebutton = await convertImage(index, 'data/src/title', 'titlebutton');
    files['titlebutton.dat'] = titlebutton!;

    const runes = await convertImage(index, 'data/src/title', 'runes');
    files['runes.dat'] = runes!;

    files['index.dat'] = index;

    // ----

    const jag = new Jagfile();

    for (let i = 0; i < order.length; i++) {
        const name = order[i];
        const data = files[name];
        // data.save(`dump/title/${name}`, data.length);
        jag.write(name, data);
    }

    jag.save('data/pack/client/title');
    for (const packet of Object.values(files)) {
        packet.release();
    }
    //console.timeEnd('title.jag');
}
