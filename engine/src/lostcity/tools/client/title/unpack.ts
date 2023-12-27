import fs from 'fs';
import Jimp from 'jimp';

import Jagfile from '#jagex2/io/Jagfile.js';
import { pixSize, countPix, unpackPix } from '#lostcity/util/PixUnpack.js';

const title = Jagfile.load('dump/client/title');

fs.mkdirSync('dump/src/title/meta', { recursive: true });
fs.mkdirSync('dump/src/fonts/meta', { recursive: true });

const jpg = title.read('title.dat');

if (!jpg) {
    throw new Error('no title.dat');
}

jpg.p1(0xFF); // restore JPEG header
jpg.save('dump/src/binary/title.jpg', jpg.length);

const index = title.read('index.dat');

if (!index) {
    throw new Error('no index.dat');
}

for (let i = 0; i < title.fileCount; i++) {
    if (title.fileName[i] === 'index.dat' || title.fileName[i] === 'title.dat') {
        continue;
    }

    const dump = title.read(title.fileName[i]);

    if (!dump) {
        throw new Error(`no ${title.fileName[i]}`);
    }

    const size = pixSize(dump, index);
    const count = countPix(dump, index);
    console.log(title.fileName[i], count, size.width + 'x' + size.height);

    let dest = 'title';
    const safeName = title.fileName[i].replace('.dat', '');
    if (safeName === 'p11' || safeName === 'p12' || safeName === 'b12' || safeName === 'q8' ||
        safeName === 'p11_full' || safeName === 'p12_full' || safeName === 'b12_full' || safeName === 'q8_full') {
        dest = 'fonts';
    }

    if (count === 1) {
        const pix = unpackPix(dump, index);
        await pix.img.writeAsync(`dump/src/${dest}/${safeName}.png`);

        // ----

        const meta = `${pix.cropX},${pix.cropY},${pix.width},${pix.height},${pix.pixelOrder ? 'row' : 'column'}\n`;
        fs.writeFileSync(`dump/src/${dest}/meta/${safeName}.opt`, meta);
    } else {
        // sprite sheet!
        const sprites = [];
        for (let j = 0; j < count; j++) {
            sprites[j] = unpackPix(dump, index, j);
        }

        let width = Math.ceil(Math.sqrt(count));
        let height = Math.ceil(count / width);

        if (width * height > count) {
            let widthTries = 0;

            // wrong aspect ratio, try subtracting from width and adding to height
            while (width * height > count && widthTries < 10) {
                width--;
                height++;
                widthTries++;
            }
        }

        const sheet = new Jimp(width * size.width, height * size.height, 0xFF00FFFF).colorType(2);

        for (let j = 0; j < count; j++) {
            const x = j % width;
            const y = Math.floor(j / width);

            sheet.blit(sprites[j].img, x * size.width, y * size.height, 0, 0, size.width, size.height);
        }

        await sheet.writeAsync(`dump/src/${dest}/${safeName}.png`);

        // ----

        let meta = `${size.width}x${size.height}\n`;

        for (let j = 0; j < count; j++) {
            const sprite = sprites[j];
            meta += `${sprite.cropX},${sprite.cropY},${sprite.width},${sprite.height},${sprite.pixelOrder ? 'row' : 'column'}\n`;
        }

        fs.writeFileSync(`dump/src/${dest}/meta/${safeName}.opt`, meta);
    }
}
