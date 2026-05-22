import fs from 'fs';

import { Jimp } from 'jimp';
import type { Bitmap } from 'jimp';

import Packet from '#/io/Packet.js';

export function generatePixelOrder(img: { bitmap: Bitmap }) {
    let rowMajorScore = 0;
    let columnMajorScore = 0;

    // calculate row-major score
    let prev = 0;
    for (let j = 0; j < img.bitmap.width * img.bitmap.height; j += 4) {
        const pos = j * 4;
        const current = (img.bitmap.data[pos + 0] << 16) | (img.bitmap.data[pos + 1] << 8) | img.bitmap.data[pos + 2];
        rowMajorScore += current - prev;
        prev = current;
    }

    // calculate column-major score
    prev = 0;
    for (let x = 0; x < img.bitmap.width; x++) {
        for (let y = 0; y < img.bitmap.height; y++) {
            const pos = (x + y * img.bitmap.width) * 4;
            const current = (img.bitmap.data[pos + 0] << 16) | (img.bitmap.data[pos + 1] << 8) | img.bitmap.data[pos + 2];
            columnMajorScore += current - prev;
            prev = current;
        }
    }

    return columnMajorScore < rowMajorScore ? 0 : 1;
}

export function writeImage(img: { bitmap: Bitmap }, data: Packet, index: Packet, colors: number[], meta: Sprite | null = null) {
    let left = 0;
    let top = 0;
    let right = img.bitmap.width;
    let bottom = img.bitmap.height;

    if (meta && meta.w && meta.h) {
        left = meta.x;
        top = meta.y;
        right = meta.w;
        bottom = meta.h;
    }

    index.p1(left); // crop x offset
    index.p1(top); // crop y offset
    index.p2(right); // actual width
    index.p2(bottom); // actual height

    let pixelOrder = generatePixelOrder(img);
    if (meta) {
        pixelOrder = meta.pixelOrder;
    }
    index.p1(pixelOrder);

    if (pixelOrder === 0) {
        for (let j = 0; j < img.bitmap.width * img.bitmap.height; j++) {
            const x = j % img.bitmap.width;
            const y = Math.floor(j / img.bitmap.width);
            if (x >= right || y >= bottom) {
                continue;
            }

            const pos = j * 4 + left * 4 + top * img.bitmap.width * 4;

            const red = img.bitmap.data[pos + 0];
            const green = img.bitmap.data[pos + 1];
            const blue = img.bitmap.data[pos + 2];
            const rgb = ((red << 16) | (green << 8) | blue) >>> 0;

            const index = colors.indexOf(rgb);
            if (index === -1) {
                break;
            }

            data.p1(index);
        }
    } else if (pixelOrder === 1) {
        for (let x = 0; x < img.bitmap.width; x++) {
            for (let y = 0; y < img.bitmap.height; y++) {
                if (x >= right || y >= bottom) {
                    continue;
                }

                const pos = (x + y * img.bitmap.width) * 4 + left * 4 + top * img.bitmap.width * 4;

                const red = img.bitmap.data[pos + 0];
                const green = img.bitmap.data[pos + 1];
                const blue = img.bitmap.data[pos + 2];
                const rgb = ((red << 16) | (green << 8) | blue) >>> 0;

                const index = colors.indexOf(rgb);
                if (index === -1) {
                    break;
                }

                data.p1(index);
            }
        }
    }
}

type Sprite = {
    x: number;
    y: number;
    w: number;
    h: number;
    pixelOrder: 0 | 1;
};

function generatePalette(img: { bitmap: Bitmap }) {
    const colors = [0xff00ff];

    for (let j = 0; j < img.bitmap.width * img.bitmap.height; j++) {
        const pos = j * 4;

        const red = img.bitmap.data[pos + 0];
        const green = img.bitmap.data[pos + 1];
        const blue = img.bitmap.data[pos + 2];
        const rgb = ((red << 16) | (green << 8) | blue) >>> 0;
        if (rgb === 0xff00ff) {
            continue;
        }

        if (colors.indexOf(rgb) === -1) {
            colors.push(rgb);
        }
    }

    return colors;
}

export async function convertImage(index: Packet, srcPath: string, safeName: string) {
    const data = Packet.alloc(4);
    data.p2(index.pos);

    const img = await Jimp.read(`${srcPath}/${safeName}.png`);
    let tileX = img.bitmap.width;
    let tileY = img.bitmap.height;

    const sprites: Sprite[] = [];
    const hasMeta = fs.existsSync(`${srcPath}/meta/${safeName}.opt`);
    if (hasMeta) {
        const metadata = fs
            .readFileSync(`${srcPath}/meta/${safeName}.opt`, 'ascii')
            .split(/\r?\n/)
            .filter(x => x.length);

        if (metadata[0].indexOf('x') === -1) {
            const sprite = metadata[0].split(',');

            sprites.push({
                x: parseInt(sprite[0]),
                y: parseInt(sprite[1]),
                w: parseInt(sprite[2]),
                h: parseInt(sprite[3]),
                pixelOrder: sprite[4] === 'row' ? 1 : 0
            });
        } else {
            const tiling = metadata[0].split('x');
            tileX = parseInt(tiling[0]);
            tileY = parseInt(tiling[1]);

            for (let j = 1; j < metadata.length; j++) {
                const sprite = metadata[j].split(',');

                sprites.push({
                    x: parseInt(sprite[0]),
                    y: parseInt(sprite[1]),
                    w: parseInt(sprite[2]),
                    h: parseInt(sprite[3]),
                    pixelOrder: sprite[4] === 'row' ? 1 : 0
                });
            }
        }
    }

    index.p2(tileX);
    index.p2(tileY);

    // todo: we're not producing the color palette in the same way, so this breaks CRC checks.
    //   however, the end result after decoding is the same
    let colors: number[] = generatePalette(img);
    if (colors.length > 255) {
        img.quantize({ colors: 255 });
        colors = generatePalette(img);
    }

    index.p1(colors.length);
    for (let j = 1; j < colors.length; j++) {
        index.p3(colors[j]);
    }

    if (sprites.length > 1) {
        for (let y = 0; y < img.bitmap.height / tileY; y++) {
            for (let x = 0; x < img.bitmap.width / tileX; x++) {
                const tile = img.clone().crop({
                    x: x * tileX,
                    y: y * tileY,
                    w: tileX,
                    h: tileY
                });
                writeImage(tile, data, index, colors, sprites[x + y * (img.bitmap.width / tileX)]);
            }
        }
    } else {
        writeImage(img, data, index, colors, sprites[0]);
    }

    return data;
}
