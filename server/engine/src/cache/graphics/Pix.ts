import fs from 'fs';
import { Jimp } from 'jimp';
import kleur from 'kleur';

import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';
import { printError } from '#/util/Logger.js';

// O(sqrt(n))
function isPrime(num: number) {
    for (let i = 2, s = Math.sqrt(num); i <= s; i++) {
        if (num % i === 0) {
            return false;
        }
    }

    return num > 1;
}

export default class Pix {
    private constructor(
        public pixels: Uint8Array,
        public palette: Int32Array,
        public width: number,
        public height: number,
        public cropLeft: number,
        public cropTop: number,
        public cropRight: number,
        public cropBottom: number,
        public pixelOrder: number
    ) {}

    static async unpackFull(jag: Jagfile, name: string, path: string, overrideName?: string) {
        const all = [];
        for (let i = 0; i < 1000; i++) {
            const pix = Pix.unpackJag(jag, name, i);
            if (!pix) {
                break;
            }

            all.push(pix);
        }

        if (all.length === 0) {
            return;
        }

        const png = Pix.unpackJagToPng(jag, name);
        if (typeof overrideName !== 'undefined') {
            name = overrideName;
        }
        if (png) {
            const file: `${string}.${string}` = `${path}/${name}.png`;
            let write = true;

            if (fs.existsSync(file)) {
                const existing = await Jimp.read(fs.readFileSync(file));
                write = existing.bitmap.width !== png.bitmap.width || existing.bitmap.height !== png.bitmap.height || Buffer.compare(Buffer.from(existing.bitmap.data), Buffer.from(png.bitmap.data)) !== 0;
            }

            if (write) {
                await png.write(file);
            }
        }

        if (!fs.existsSync(`${path}/meta/`)) {
            fs.mkdirSync(`${path}/meta`, { recursive: true });
        }

        const metadataPath = `${path}/meta/${name}.opt`;
        if (all.length > 1) {
            fs.writeFileSync(metadataPath, `${all[0].width}x${all[0].height}\n`);
        } else if (fs.existsSync(metadataPath)) {
            fs.unlinkSync(metadataPath);
        }
    }

    static unpackJag(jag: Jagfile, name: string, index: number = 0): Pix | null {
        const dat = jag.read(name + '.dat');
        const idx = jag.read('index.dat');

        if (!dat || !idx) {
            return null;
        }

        idx.pos = dat.g2();

        if (idx.pos >= idx.length) {
            return null;
        }

        const width = idx.g2();
        const height = idx.g2();

        const paletteCount = idx.g1();
        const palette = new Int32Array(paletteCount);
        for (let i = 0; i < paletteCount - 1; i++) {
            palette[i + 1] = idx.g3();
        }

        if (idx.pos >= idx.length) {
            return null;
        }

        for (let i = 0; i < index; i++) {
            idx.pos += 2; // cropX, cropY
            dat.pos += idx.g2() * idx.g2(); // width, height
            idx.pos++; // pixelOrder
        }

        if (idx.pos >= idx.length || dat.pos >= dat.length) {
            return null;
        }

        const cropLeft = idx.g1();
        const cropTop = idx.g1();
        const cropRight = idx.g2();
        const cropBottom = idx.g2();
        const pixelOrder = idx.g1();

        if (idx.pos > idx.length) {
            return null;
        }

        const len = cropRight * cropBottom;
        const pixels = new Uint8Array(len);

        if (dat.pos + len > dat.length) {
            return null;
        }

        if (pixelOrder === 0) {
            for (let i = 0; i < len; i++) {
                pixels[i] = dat.g1();
            }
        } else if (pixelOrder === 1) {
            for (let x = 0; x < cropRight; x++) {
                for (let y = 0; y < cropBottom; y++) {
                    pixels[y * cropRight + x] = dat.g1();
                }
            }
        }

        return new Pix(pixels, palette, width, height, cropLeft, cropTop, cropRight, cropBottom, pixelOrder);
    }

    static unpackJagToPng(jag: Jagfile, name: string, sheetWidth: number = 0, sheetHeight: number = 0, preferHorizontal: boolean = true) {
        const all = [];

        for (let i = 0; i < 1000; i++) {
            const pix = Pix.unpackJag(jag, name, i);
            if (!pix) {
                break;
            }

            all.push(pix);
        }

        if (!all.length) {
            return null;
        }

        if (all.length === 1) {
            return all[0].packPng();
        }

        const count = all.length;

        if (!sheetWidth || !sheetHeight) {
            if (isPrime(count)) {
                sheetWidth = count;
                sheetHeight = 1;
            } else {
                sheetWidth = Math.ceil(Math.sqrt(count));
                sheetHeight = Math.ceil(count / sheetWidth);
            }

            if (sheetWidth * sheetHeight > count) {
                let widthTries = 0;

                if (preferHorizontal) {
                    while (sheetWidth * sheetHeight > count && widthTries < 10) {
                        sheetWidth++;
                        sheetHeight--;
                        widthTries++;
                    }
                } else {
                    while (sheetWidth * sheetHeight > count && widthTries < 10) {
                        sheetWidth--;
                        sheetHeight++;
                        widthTries++;
                    }
                }
            }
        }

        if (sheetWidth * sheetHeight != count) {
            printError('wrong spritesheet size! you may have to manually define its dimensions: ' + kleur.red(sheetWidth + ' x ' + sheetHeight + ' != ' + count));
            return null;
        }

        const cellWidth = all[0].width;
        const cellHeight = all[0].height;
        const sheet = new Jimp({
            width: sheetWidth * cellWidth,
            height: sheetHeight * cellHeight,
            color: 0xff00ffff
        });

        for (let index = 0; index < count; index++) {
            const pix = all[index];
            const img = pix.packPng();

            const x = index % sheetWidth;
            const y = Math.floor(index / sheetWidth);

            sheet.blit({
                src: img,
                x: x * cellWidth,
                y: y * cellHeight,
                srcX: 0,
                srcY: 0,
                srcW: cellWidth,
                srcH: cellHeight
            });
        }

        return sheet;
    }

    packHeader(dat: Packet, index: Packet) {
        dat.p2(index.pos);

        index.p2(this.width);
        index.p2(this.height);

        index.p1(this.palette.length);
        for (let i = 1; i < this.palette.length; i++) {
            index.p3(this.palette[i]);
        }

        // spritesheets work by packing sprites back to back after the palette
    }

    pack(dat: Packet, index: Packet) {
        index.p1(this.cropLeft);
        index.p1(this.cropTop);
        index.p2(this.cropRight);
        index.p2(this.cropBottom);
        index.p1(this.pixelOrder);

        if (this.pixelOrder === 0) {
            for (let i = 0; i < this.pixels.length; i++) {
                dat.p1(this.pixels[i]);
            }
        } else if (this.pixelOrder === 1) {
            for (let x = 0; x < this.cropRight; x++) {
                for (let y = 0; y < this.cropBottom; y++) {
                    dat.p1(this.pixels[y * this.cropRight + x]);
                }
            }
        }
    }

    packPng() {
        const img = new Jimp({
            width: this.width,
            height: this.height,
            color: 0xff00ffff
        });

        // if we could perform a memcpy this would be <0.05ms instead of 1-2ms
        if (this.pixelOrder === 0) {
            const len = this.cropRight * this.cropBottom;

            for (let i = 0; i < len; i++) {
                const index = this.pixels[i];
                if (index === 0) {
                    continue;
                }

                const startX = this.cropLeft + (i % this.cropRight);
                const startY = this.cropTop + Math.floor(i / this.cropRight);
                const pos = (startX + startY * this.width) * 4;

                const rgb = this.palette[index];
                img.bitmap.data[pos] = (rgb >> 16) & 0xff;
                img.bitmap.data[pos + 1] = (rgb >> 8) & 0xff;
                img.bitmap.data[pos + 2] = rgb & 0xff;
                img.bitmap.data[pos + 3] = 0xff;
            }
        } else if (this.pixelOrder === 1) {
            for (let x = 0; x < this.cropRight; x++) {
                for (let y = 0; y < this.cropBottom; y++) {
                    const index = this.pixels[y * this.cropRight + x];
                    if (index === 0) {
                        continue;
                    }

                    const startX = this.cropLeft + x;
                    const startY = this.cropTop + y;
                    const pos = (startX + startY * this.width) * 4;

                    const rgb = this.palette[index];
                    img.bitmap.data[pos] = (rgb >> 16) & 0xff;
                    img.bitmap.data[pos + 1] = (rgb >> 8) & 0xff;
                    img.bitmap.data[pos + 2] = rgb & 0xff;
                    img.bitmap.data[pos + 3] = 0xff;
                }
            }
        }

        return img;
    }
}
