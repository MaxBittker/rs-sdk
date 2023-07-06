import fs from 'fs';
import Jimp from 'jimp';

import Packet from '#jagex2/io/Packet.js';

export function generatePixelOrder(img) {
    let rowMajorScore = 0;
    let columnMajorScore = 0;

    // calculate row-major score
    let prev = 0;
    for (let j = 0; j < img.bitmap.width * img.bitmap.height; j += 4) {
        let pos = j * 4;
        let current = img.bitmap.data[pos + 0] << 16 | img.bitmap.data[pos + 1] << 8 | img.bitmap.data[pos + 2];
        rowMajorScore += current - prev;
        prev = current;
    }

    // calculate column-major score
    prev = 0;
    for (let x = 0; x < img.bitmap.width; x++) {
        for (let y = 0; y < img.bitmap.height; y++) {
            let pos = (x + (y * img.bitmap.width)) * 4;
            let current = img.bitmap.data[pos + 0] << 16 | img.bitmap.data[pos + 1] << 8 | img.bitmap.data[pos + 2];
            columnMajorScore += current - prev;
            prev = current;
        }
    }

    return columnMajorScore < rowMajorScore ? 0 : 1;
}

export function writeImage(img, data, index, colors, meta = null) {
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

    // console.log('\t', left, top, '-', right, bottom, '-', img.bitmap.width, img.bitmap.height);

    let pixelOrder = generatePixelOrder(img);
    if (meta) {
        pixelOrder = meta.pixelOrder;
    }
    index.p1(pixelOrder);
    // console.log('\t', pixelOrder ? 'row' : 'column');

    if (pixelOrder === 0) {
        for (let j = 0; j < img.bitmap.width * img.bitmap.height; j++) {
            let x = j % img.bitmap.width;
            let y = Math.floor(j / img.bitmap.width);
            if (x >= right || y >= bottom) {
                continue;
            }

            let pos = (j * 4) + (left * 4) + (top * img.bitmap.width * 4);

            let red = img.bitmap.data[pos + 0];
            let green = img.bitmap.data[pos + 1];
            let blue = img.bitmap.data[pos + 2];
            let rgb = ((red << 16) | (green << 8) | blue) >>> 0;

            let index = colors.indexOf(rgb);
            if (index === -1) {
                console.error('color not found in palette', rgb.toString(16), colors.map(x => x.toString(16)));
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

                let pos = ((x + (y * img.bitmap.width)) * 4) + (left * 4) + (top * img.bitmap.width * 4);

                let red = img.bitmap.data[pos + 0];
                let green = img.bitmap.data[pos + 1];
                let blue = img.bitmap.data[pos + 2];
                let rgb = ((red << 16) | (green << 8) | blue) >>> 0;

                let index = colors.indexOf(rgb);
                if (index === -1) {
                    console.error('color not found in palette', rgb);
                    break;
                }

                data.p1(index);
            }
        }
    }
}

export async function convertImage(index, srcPath, safeName) {
    let data = new Packet();
    data.p2(index.pos);

    let img = await Jimp.read(`${srcPath}/${safeName}.png`);
    let tileX = img.bitmap.width;
    let tileY = img.bitmap.height;

    let sprites = [];
    let hasMeta = fs.existsSync(`${srcPath}/meta/${safeName}.opt`);
    if (hasMeta) {
        let metadata = fs.readFileSync(`${srcPath}/meta/${safeName}.opt`, 'ascii').replace(/\r/g, '').split('\n').filter(x => x.length);

        if (metadata[0].indexOf('x') === -1) {
            let sprite = metadata[0].split(',');

            sprites.push({
                x: parseInt(sprite[0]),
                y: parseInt(sprite[1]),
                w: parseInt(sprite[2]),
                h: parseInt(sprite[3]),
                pixelOrder: sprite[4] === 'row' ? 1 : 0
            });
        } else {
            let tiling = metadata[0].split('x');
            tileX = parseInt(tiling[0]);
            tileY = parseInt(tiling[1]);

            for (let j = 1; j < metadata.length; j++) {
                let sprite = metadata[j].split(',');

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

    let colors = [ 0xFF00FF ]; // reserved for transparency
    if (fs.existsSync(`${srcPath}/meta/${safeName}.pal.png`)) {
        // read color palette from file to preserve order
        let pal = await Jimp.read(`${srcPath}/meta/${safeName}.pal.png`);

        for (let j = 0; j < pal.bitmap.width * pal.bitmap.height; j++) {
            let pos = j * 4;

            let red = pal.bitmap.data[pos + 0];
            let green = pal.bitmap.data[pos + 1];
            let blue = pal.bitmap.data[pos + 2];
            let rgb = ((red << 16) | (green << 8) | blue) >>> 0;
            if (rgb === 0xFF00FF) {
                continue;
            }

            colors[j] = rgb;
        }
    } else {
        // generate color palette by counting unique colors

        // console.log('generating color palette', safeName);
        for (let j = 0; j < img.bitmap.width * img.bitmap.height; j++) {
            let pos = j * 4;

            let red = img.bitmap.data[pos + 0];
            let green = img.bitmap.data[pos + 1];
            let blue = img.bitmap.data[pos + 2];
            let rgb = ((red << 16) | (green << 8) | blue) >>> 0;
            if (rgb === 0xFF00FF) {
                continue;
            }

            if (colors.indexOf(rgb) === -1) {
                colors.push(rgb);
            }
        }
    }

    if (colors.length > 255) {
        // TODO: automatic color quantization based on variable limit?
        console.error('error: too many colors', colors.length);
        return;
    }

    index.p1(colors.length);
    for (let j = 1; j < colors.length; j++) {
        index.p3(colors[j]);
    }

    if (sprites.length > 1) {
        for (let y = 0; y < img.bitmap.height / tileY; y++) {
            for (let x = 0; x < img.bitmap.width / tileX; x++) {
                let tile = img.clone().crop(x * tileX, y * tileY, tileX, tileY);
                writeImage(tile, data, index, colors, sprites[x + (y * (img.bitmap.width / tileX))]);
            }
        }
    } else {
        writeImage(img, data, index, colors, sprites[0]);
    }

    return data;
}
