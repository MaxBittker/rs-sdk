import fs from 'fs';

import { Jimp } from 'jimp';
import type { Bitmap, JimpInstance } from 'jimp';

import Packet from '#/io/Packet.js';

function generatePixelOrder(img: { bitmap: Bitmap }, left: number, top: number, width: number, height: number) {
    let rowTransitions = 0;
    let columnTransitions = 0;
    let previousRow = -1;
    let previousColumn = -1;

    for (let i = 0; i < width * height; i++) {
        const rowPos = (left + (i % width) + (top + Math.floor(i / width)) * img.bitmap.width) * 4;
        const columnPos = (left + Math.floor(i / height) + (top + (i % height)) * img.bitmap.width) * 4;
        const row = (img.bitmap.data[rowPos] << 16) | (img.bitmap.data[rowPos + 1] << 8) | img.bitmap.data[rowPos + 2];
        const column = (img.bitmap.data[columnPos] << 16) | (img.bitmap.data[columnPos + 1] << 8) | img.bitmap.data[columnPos + 2];

        if (i > 0) {
            rowTransitions += row !== previousRow ? 1 : 0;
            columnTransitions += column !== previousColumn ? 1 : 0;
        }
        previousRow = row;
        previousColumn = column;
    }

    return columnTransitions < rowTransitions ? 1 : 0;
}

function getPixelBounds(img: { bitmap: Bitmap }) {
    let left = img.bitmap.width;
    let top = img.bitmap.height;
    let right = -1;
    let bottom = -1;

    for (let y = 0; y < img.bitmap.height; y++) {
        for (let x = 0; x < img.bitmap.width; x++) {
            const pos = (x + y * img.bitmap.width) * 4;
            if (img.bitmap.data[pos] === 0xff && img.bitmap.data[pos + 1] === 0 && img.bitmap.data[pos + 2] === 0xff) {
                continue;
            }

            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
        }
    }

    return right === -1 ? { left: 0, top: 0, width: img.bitmap.width, height: img.bitmap.height } : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

export function writeImage(img: { bitmap: Bitmap }, data: Packet, index: Packet, colors: number[]) {
    const { left, top, width, height } = getPixelBounds(img);
    const pixelOrder = generatePixelOrder(img, left, top, width, height);

    index.p1(left); // crop x offset
    index.p1(top); // crop y offset
    index.p2(width); // actual width
    index.p2(height); // actual height
    index.p1(pixelOrder);

    const outer = pixelOrder === 1 ? width : height;
    const inner = pixelOrder === 1 ? height : width;
    for (let a = 0; a < outer; a++) {
        for (let b = 0; b < inner; b++) {
            const x = pixelOrder === 1 ? a : b;
            const y = pixelOrder === 1 ? b : a;
            const pos = (x + left + (y + top) * img.bitmap.width) * 4;
            const rgb = ((img.bitmap.data[pos] << 16) | (img.bitmap.data[pos + 1] << 8) | img.bitmap.data[pos + 2]) >>> 0;
            data.p1(colors.indexOf(rgb));
        }
    }
}

export function generatePalette(img: { bitmap: Bitmap }) {
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

export async function convertImage(index: Packet, srcPath: string, safeName: string, source?: { bitmap: Bitmap }, palette?: number[]) {
    const data = Packet.alloc(4);
    data.p2(index.pos);

    const img = source ?? (await Jimp.read(`${srcPath}/${safeName}.png`));
    let tileX = img.bitmap.width;
    let tileY = img.bitmap.height;

    const metadataPath = `${srcPath}/meta/${safeName}.opt`;
    if (fs.existsSync(metadataPath)) {
        [tileX, tileY] = fs.readFileSync(metadataPath, 'ascii').split(/\r?\n/, 1)[0].trim().split('x').map(Number);
    }

    if (!Number.isInteger(tileX) || !Number.isInteger(tileY) || img.bitmap.width % tileX !== 0 || img.bitmap.height % tileY !== 0) {
        throw new Error(`Invalid image metadata: ${metadataPath}`);
    }

    index.p2(tileX);
    index.p2(tileY);

    let colors: number[] = palette ?? generatePalette(img);
    if (!palette && colors.length > 255) {
        (img as JimpInstance).quantize({ colors: 255 });
        colors = generatePalette(img);
    }

    index.p1(colors.length);
    for (let j = 1; j < colors.length; j++) {
        index.p3(colors[j]);
    }

    if (tileX !== img.bitmap.width || tileY !== img.bitmap.height) {
        for (let y = 0; y < img.bitmap.height / tileY; y++) {
            for (let x = 0; x < img.bitmap.width / tileX; x++) {
                const tile = (img as JimpInstance).clone().crop({
                    x: x * tileX,
                    y: y * tileY,
                    w: tileX,
                    h: tileY
                });
                writeImage(tile, data, index, colors);
            }
        }
    } else {
        writeImage(img, data, index, colors);
    }

    return data;
}
