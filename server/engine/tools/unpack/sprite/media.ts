import fs from 'fs';
import path from 'path';

import { Jimp } from 'jimp';

import FileStream from '#/io/FileStream.js';
import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';
import Pix from '#/cache/graphics/Pix.js';
import { BACK_PIECES } from '#tools/pack/sprite/media.js';

const cache = new FileStream('data/unpack');
const media = new Jagfile(new Packet(cache.read(0, 4)!));

fs.mkdirSync(`${Environment.build.srcDir}/sprites`, { recursive: true });

const back = new Jimp({
    width: Math.max(...BACK_PIECES.map(([, x, , w]) => x + w)),
    height: Math.max(...BACK_PIECES.map(([, , y, , h]) => y + h)),
    color: 0xff00ffff
});
for (const [name, x, y] of BACK_PIECES) {
    const piece = Pix.unpackJagToPng(media, name);
    if (!piece) {
        throw new Error(`Unable to unpack ${name}`);
    }
    back.blit({ src: piece, x, y });
}
const backPath: `${string}.${string}` = `${Environment.build.srcDir}/sprites/back.png`;
let writeBack = true;
if (fs.existsSync(backPath)) {
    const existing = await Jimp.read(backPath);
    writeBack = existing.bitmap.width !== back.bitmap.width || existing.bitmap.height !== back.bitmap.height || Buffer.compare(Buffer.from(existing.bitmap.data), Buffer.from(back.bitmap.data)) !== 0;
}
if (writeBack) {
    await back.write(backPath);
}

const backNames = new Set<string>(BACK_PIECES.map(([name]) => name));
for (const name of media.fileName) {
    const safeName = path.basename(name, path.extname(name));
    if (backNames.has(safeName)) {
        const oldPath = `${Environment.build.srcDir}/sprites/${safeName}.png`;
        if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
        }
        continue;
    }
    Pix.unpackFull(media, safeName, `${Environment.build.srcDir}/sprites`);
}
