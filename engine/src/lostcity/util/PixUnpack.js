import Jimp from 'jimp';

export function pixSize(dat, idx) {
    dat.pos = 0;
    idx.pos = dat.g2();

    let width = idx.g2();
    let height = idx.g2();

    return { width, height };
}

export function countPix(dat, idx) {
    dat.pos = 0;
    idx.pos = dat.g2();

    if (idx.pos > idx.length) {
        // console.error('not pix encoding');
        return 0;
    }

    let cropW = idx.g2();
    let cropH = idx.g2();

    let paletteCount = idx.g1();
    for (let i = 0; i < paletteCount - 1; i++) {
        idx.g3();
    }

    let count = 0;
    for (let i = 0; i < 512; i++) {
        if (dat.available <= 0) {
            break;
        }

        let cropX = idx.g1();
        let cropY = idx.g1();
        if (cropX > cropW || cropY > cropH) {
            // console.error('invalid crop');
            break;
        }

        let width = idx.g2();
        let height = idx.g2();
        if (width === 0 || height === 0 || width > (cropW - cropX) || height > (cropH - cropY)) {
            // console.error('invalid size');
            break;
        }

        dat.pos += width * height;
        if (dat.pos > dat.length) {
            // console.error('out of bounds');
            break;
        }

        let pixelOrder = idx.g1();
        if (pixelOrder > 1) {
            // console.error('invalid order');
            break;
        }

        count++;
    }

    return count;
}

export function unpackPix(dat, idx, id = 0) {
    dat.pos = 0;
    idx.pos = dat.g2();

    let cropW = idx.g2();
    let cropH = idx.g2();

    let paletteCount = idx.g1();
    let palette = [ 0xFF00FF ];
    for (let i = 0; i < paletteCount - 1; i++) {
        palette[i + 1] = idx.g3();
    }

    for (let i = 0; i < id; i++) {
        idx.pos += 2;
        dat.pos += idx.g2() * idx.g2();
        idx.pos++;
    }

    let cropX = idx.g1();
    let cropY = idx.g1();
    let width = idx.g2();
    let height = idx.g2();

    let img = new Jimp(cropW, cropH, 0xFF00FFFF).colorType(2);

    let pixelOrder = idx.g1();
    if (pixelOrder === 0) {
        for (let i = 0; i < width * height; i++) {
            let index = dat.g1();
            if (index === 0) {
                continue;
            }

            let startX = cropX + (i % width);
            let startY = cropY + Math.floor(i / width);
            let pos = (startX + (startY * cropW)) * 4;

            let pixel = palette[index];
            img.bitmap.data[pos] = (pixel >> 16) & 0xFF;
            img.bitmap.data[pos + 1] = (pixel >> 8) & 0xFF;
            img.bitmap.data[pos + 2] = pixel & 0xFF;
            img.bitmap.data[pos + 3] = 0xFF;
        }
    } else if (pixelOrder === 1) {
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                let index = dat.g1();
                if (index === 0) {
                    continue;
                }

                let startX = cropX + x;
                let startY = cropY + y;
                let pos = (startX + (startY * cropW)) * 4;

                let pixel = palette[index];
                img.bitmap.data[pos] = (pixel >> 16) & 0xFF;
                img.bitmap.data[pos + 1] = (pixel >> 8) & 0xFF;
                img.bitmap.data[pos + 2] = pixel & 0xFF;
                img.bitmap.data[pos + 3] = 0xFF;
            }
        }
    }

    return { img, cropW, cropH, cropX, cropY, width, height, pixelOrder, palette };
}
