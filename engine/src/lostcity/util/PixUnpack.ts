import Jimp from 'jimp';

import Packet from '#jagex2/io/Packet.js';

export function pixSize(dat: Packet, idx: Packet) {
    dat.pos = 0;
    idx.pos = dat.g2();

    const width = idx.g2();
    const height = idx.g2();

    return { width, height };
}

export function countPix(dat: Packet, idx: Packet) {
    dat.pos = 0;
    idx.pos = dat.g2();

    if (idx.pos > idx.data.length) {
        // console.error('not pix encoding');
        return 0;
    }

    const cropW = idx.g2();
    const cropH = idx.g2();

    const paletteCount = idx.g1();
    for (let i = 0; i < paletteCount - 1; i++) {
        idx.g3();
    }

    let count = 0;
    for (let i = 0; i < 512; i++) {
        if (dat.available <= 0) {
            break;
        }

        const cropX = idx.g1();
        const cropY = idx.g1();
        if (cropX > cropW || cropY > cropH) {
            // console.error('invalid crop');
            break;
        }

        const width = idx.g2();
        const height = idx.g2();
        if (width === 0 || height === 0 || width > cropW - cropX || height > cropH - cropY) {
            // console.error('invalid size');
            break;
        }

        dat.pos += width * height;
        if (dat.pos > dat.data.length) {
            // console.error('out of bounds');
            break;
        }

        const pixelOrder = idx.g1();
        if (pixelOrder > 1) {
            // console.error('invalid order');
            break;
        }

        count++;
    }

    return count;
}

export function unpackPix(dat: Packet, idx: Packet, id = 0) {
    dat.pos = 0;
    idx.pos = dat.g2();

    const cropW = idx.g2();
    const cropH = idx.g2();

    const paletteCount = idx.g1();
    const palette = [0xff00ff];
    for (let i = 0; i < paletteCount - 1; i++) {
        palette[i + 1] = idx.g3();
    }

    for (let i = 0; i < id; i++) {
        idx.pos += 2;
        dat.pos += idx.g2() * idx.g2();
        idx.pos++;
    }

    const cropX = idx.g1();
    const cropY = idx.g1();
    const width = idx.g2();
    const height = idx.g2();

    const img = new Jimp(cropW, cropH, 0xff00ffff).colorType(2);

    const pixelOrder = idx.g1();
    if (pixelOrder === 0) {
        for (let i = 0; i < width * height; i++) {
            const index = dat.g1();
            if (index === 0) {
                continue;
            }

            const startX = cropX + (i % width);
            const startY = cropY + Math.floor(i / width);
            const pos = (startX + startY * cropW) * 4;

            const pixel = palette[index];
            img.bitmap.data[pos] = (pixel >> 16) & 0xff;
            img.bitmap.data[pos + 1] = (pixel >> 8) & 0xff;
            img.bitmap.data[pos + 2] = pixel & 0xff;
            img.bitmap.data[pos + 3] = 0xff;
        }
    } else if (pixelOrder === 1) {
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                const index = dat.g1();
                if (index === 0) {
                    continue;
                }

                const startX = cropX + x;
                const startY = cropY + y;
                const pos = (startX + startY * cropW) * 4;

                const pixel = palette[index];
                img.bitmap.data[pos] = (pixel >> 16) & 0xff;
                img.bitmap.data[pos + 1] = (pixel >> 8) & 0xff;
                img.bitmap.data[pos + 2] = pixel & 0xff;
                img.bitmap.data[pos + 3] = 0xff;
            }
        }
    }

    return {
        img,
        cropW,
        cropH,
        cropX,
        cropY,
        width,
        height,
        pixelOrder,
        palette
    };
}
