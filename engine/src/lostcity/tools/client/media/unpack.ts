import fs from 'fs';
import Jimp from 'jimp';

import Jagfile from '#jagex2/io/Jagfile.js';
import { pixSize, countPix, unpackPix } from '#lostcity/util/PixUnpack.js';

fs.mkdirSync('dump/src/sprites/meta', { recursive: true });

const media = Jagfile.load('dump/client/media');

function isPrime(val: number) {
    if (val === 1) {
        // not prime but good enough for this function's purpose
        return true;
    }

    for (let i = 2; i < val; i++) {
        if (val % i === 0) {
            return false;
        }
    }

    return true;
}

const index = media.read('index.dat');

if (!index) {
    throw new Error('no index.dat');
}

for (let i = 0; i < media.fileCount; i++) {
    if (media.fileName[i] === 'index.dat') {
        continue;
    }

    const data = media.read(media.fileName[i]);

    if (!data) {
        throw new Error(`no ${media.fileName[i]}`);
    }

    const size = pixSize(data, index);
    const count = countPix(data, index);
    console.log(media.fileName[i], count, size.width + 'x' + size.height);

    const safeName = media.fileName[i].replace('.dat', '');
    if (count === 1) {
        const pix = unpackPix(data, index);
        await pix.img.writeAsync(`dump/src/sprites/${safeName}.png`);

        // ----

        const meta = `${pix.cropX},${pix.cropY},${pix.width},${pix.height},${pix.pixelOrder ? 'row' : 'column'}\n`;
        fs.writeFileSync(`dump/src/sprites/meta/${safeName}.opt`, meta);

        // ----

        const pal = new Jimp(16, 16, 0xff00ffff).colorType(2);

        for (let j = 1; j < pix.palette.length; j++) {
            const x = j % 16;
            const y = Math.floor(j / 16);

            const color = pix.palette[j];

            const pos = (x + y * 16) * 4;
            pal.bitmap.data[pos] = (color >> 16) & 0xff;
            pal.bitmap.data[pos + 1] = (color >> 8) & 0xff;
            pal.bitmap.data[pos + 2] = color & 0xff;
        }

        await pal.writeAsync(`dump/src/sprites/meta/${safeName}.pal.png`);
    } else {
        // sprite sheet!
        const sprites = [];
        for (let j = 0; j < count; j++) {
            sprites[j] = unpackPix(data, index, j);
        }

        let width = Math.ceil(Math.sqrt(count));
        let height = Math.ceil(count / width);

        const override: Record<string, { width: number; height: number }> = {
            mapdots: { width: 4, height: 1 }
        };

        if (override[safeName]) {
            width = override[safeName].width;
            height = override[safeName].height;
        } else if (isPrime(count)) {
            width = count;
            height = 1;
        }
        if (width * height != count) {
            let heightTries = 0;

            // wrong aspect ratio, try subtracting from height and adding to width
            while (width * height != count && heightTries < 10) {
                height--;
                width++;
                heightTries++;
            }

            if (width * height != count) {
                width = Math.ceil(Math.sqrt(count));
                height = Math.ceil(count / width);

                // because we do width second, we're biased towards a wider spritesheet
                let widthTries = 0;

                // wrong aspect ratio, try subtracting from width and adding to height
                while (width * height != count && widthTries < 10) {
                    width--;
                    height++;
                    widthTries++;
                }

                if (width * height != count) {
                    // oh well, we tried
                    width = count;
                    height = 1;
                }
            }
        }

        if (width * height != count) {
            console.log('Could not determine size of spritesheet', safeName, width, height, count);
        }

        const sheet = new Jimp(width * size.width, height * size.height, 0xff00ffff).colorType(2);

        for (let j = 0; j < count; j++) {
            const x = j % width;
            const y = Math.floor(j / width);

            sheet.blit(sprites[j].img, x * size.width, y * size.height, 0, 0, size.width, size.height);
        }

        await sheet.writeAsync(`dump/src/sprites/${safeName}.png`);

        // ----

        let meta = `${size.width}x${size.height}\n`;

        for (let j = 0; j < count; j++) {
            const sprite = sprites[j];
            meta += `${sprite.cropX},${sprite.cropY},${sprite.width},${sprite.height},${sprite.pixelOrder ? 'row' : 'column'}\n`;
        }

        fs.writeFileSync(`dump/src/sprites/meta/${safeName}.opt`, meta);

        // ----

        const pal = new Jimp(16, 16, 0xff00ffff).colorType(2);

        for (let j = 1; j < sprites[0].palette.length; j++) {
            const x = j % 16;
            const y = Math.floor(j / 16);

            const color = sprites[0].palette[j];

            const pos = (x + y * 16) * 4;
            pal.bitmap.data[pos] = (color >> 16) & 0xff;
            pal.bitmap.data[pos + 1] = (color >> 8) & 0xff;
            pal.bitmap.data[pos + 2] = color & 0xff;
        }

        await pal.writeAsync(`dump/src/sprites/meta/${safeName}.pal.png`);
    }
}
