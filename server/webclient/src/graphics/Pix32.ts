import Pix2D from '#/graphics/Pix2D.js';
import { decodeJpeg } from '#/graphics/Jpeg.js';
import Pix8 from '#/graphics/Pix8.js';

import JagFile from '#/io/JagFile.js';
import Packet from '#/io/Packet.js';

export default class Pix32 extends Pix2D {
    data: Int32Array;
    wi: number; // width
    hi: number; // height
    xof: number; // x offset
    yof: number; // y offset
    owi: number; // original width
    ohi: number; // original height

    constructor(width: number, height: number) {
        super();

        this.data = new Int32Array(width * height);
        this.wi = this.owi = width;
        this.hi = this.ohi = height;
        this.xof = this.yof = 0;
    }

    static async fromJpeg(archive: JagFile, name: string): Promise<Pix32> {
        const dat: Uint8Array | null = archive.read(name);
        if (!dat) {
            throw new Error();
        }

        const jpeg: ImageData = await decodeJpeg(dat);
        const image: Pix32 = new Pix32(jpeg.width, jpeg.height);

        const data: Uint32Array = new Uint32Array(jpeg.data.buffer);
        for (let i: number = 0; i < image.data.length; i++) {
            const pixel: number = data[i];
            image.data[i] = (((pixel >> 24) & 0xff) << 24) | ((pixel & 0xff) << 16) | (((pixel >> 8) & 0xff) << 8) | ((pixel >> 16) & 0xff);
        }
        return image;
    }

    static depack(jag: JagFile, name: string, sprite: number = 0): Pix32 {
        const dat: Packet = new Packet(jag.read(name + '.dat'));
        const index: Packet = new Packet(jag.read('index.dat'));

        index.pos = dat.g2();
        const owi: number = index.g2();
        const ohi: number = index.g2();

        const bpalCount: number = index.g1();
        const bpal: Int32Array = new Int32Array(bpalCount);

        for (let i: number = 0; i < bpalCount - 1; i++) {
            bpal[i + 1] = index.g3();

            if (bpal[i + 1] === 0) {
                bpal[i + 1] = 1;
            }
        }

        for (let i: number = 0; i < sprite; i++) {
            index.pos += 2;
            dat.pos += index.g2() * index.g2();
            index.pos += 1;
        }

        if (dat.pos > dat.length || index.pos > index.length) {
            throw new Error();
        }

        const xof: number = index.g1();
        const yof: number = index.g1();
        const wi: number = index.g2();
        const hi: number = index.g2();

        const image: Pix32 = new Pix32(wi, hi);
        image.xof = xof;
        image.yof = yof;
        image.owi = owi;
        image.ohi = ohi;

        const encoding: number = index.g1();
        if (encoding === 0) {
            for (let i: number = 0; i < image.wi * image.hi; i++) {
                image.data[i] = bpal[dat.g1()];
            }
        } else if (encoding === 1) {
            for (let x: number = 0; x < image.wi; x++) {
                for (let y: number = 0; y < image.hi; y++) {
                    image.data[x + y * image.wi] = bpal[dat.g1()];
                }
            }
        }

        return image;
    }

    setPixels(): void {
        Pix2D.setPixels(this.data, this.wi, this.hi);
    }

    rgbAdjust(r: number, g: number, b: number): void {
        for (let i: number = 0; i < this.data.length; i++) {
            const rgb: number = this.data[i];

            if (rgb !== 0) {
                let red: number = (rgb >> 16) & 0xff;
                red += r;
                if (red < 1) {
                    red = 1;
                } else if (red > 255) {
                    red = 255;
                }

                let green: number = (rgb >> 8) & 0xff;
                green += g;
                if (green < 1) {
                    green = 1;
                } else if (green > 255) {
                    green = 255;
                }

                let blue: number = rgb & 0xff;
                blue += b;
                if (blue < 1) {
                    blue = 1;
                } else if (blue > 255) {
                    blue = 255;
                }

                this.data[i] = (red << 16) + (green << 8) + blue;
            }
        }
    }

    trim(): void {
        const pixels = new Int32Array(this.owi * this.ohi);
        for (let y = 0; y < this.hi; y++) {
            for (let x = 0; x < this.wi; x++) {
                pixels[(this.yof + y) * this.owi + this.xof + x] = this.data[this.wi * y + x];
            }
        }

        this.data = pixels;
        this.wi = this.owi;
        this.hi = this.ohi;
        this.xof = 0;
        this.yof = 0;
    }

    hflip(): void {
        const pixels: Int32Array = this.data;
        const width: number = this.wi;
        const height: number = this.hi;

        for (let y: number = 0; y < height; y++) {
            const div: number = (width / 2) | 0;
            for (let x: number = 0; x < div; x++) {
                const off1: number = x + y * width;
                const off2: number = width - x - 1 + y * width;

                const tmp: number = pixels[off1];
                pixels[off1] = pixels[off2];
                pixels[off2] = tmp;
            }
        }
    }

    vflip(): void {
        const pixels: Int32Array = this.data;
        const width: number = this.wi;
        const height: number = this.hi;

        for (let y: number = 0; y < ((height / 2) | 0); y++) {
            for (let x: number = 0; x < width; x++) {
                const off1: number = x + y * width;
                const off2: number = x + (height - y - 1) * width;

                const tmp: number = pixels[off1];
                pixels[off1] = pixels[off2];
                pixels[off2] = tmp;
            }
        }
    }

    quickPlotSprite(x: number, y: number): void {
        x |= 0;
        y |= 0;

        x += this.xof;
        y += this.yof;

        let dstOff: number = x + y * Pix2D.width;
        let srcOff: number = 0;

        let h: number = this.hi;
        let w: number = this.wi;

        let dstStep: number = Pix2D.width - w;
        let srcStep: number = 0;

        if (y < Pix2D.clipMinY) {
            const cutoff: number = Pix2D.clipMinY - y;
            h -= cutoff;
            y = Pix2D.clipMinY;
            srcOff += cutoff * w;
            dstOff += cutoff * Pix2D.width;
        }

        if (y + h > Pix2D.clipMaxY) {
            h -= y + h - Pix2D.clipMaxY;
        }

        if (x < Pix2D.clipMinX) {
            const cutoff: number = Pix2D.clipMinX - x;
            w -= cutoff;
            x = Pix2D.clipMinX;
            srcOff += cutoff;
            dstOff += cutoff;
            srcStep += cutoff;
            dstStep += cutoff;
        }

        if (x + w > Pix2D.clipMaxX) {
            const cutoff: number = x + w - Pix2D.clipMaxX;
            w -= cutoff;
            srcStep += cutoff;
            dstStep += cutoff;
        }

        if (w > 0 && h > 0) {
            this.plotQuick(w, h, this.data, srcOff, srcStep, Pix2D.pixels, dstOff, dstStep);
        }
    }

    private plotQuick(w: number, h: number, src: Int32Array, srcOff: number, srcStep: number, dst: Int32Array, dstOff: number, dstStep: number): void {
        const qw: number = -(w >> 2);
        w = -(w & 0x3);

        for (let y: number = -h; y < 0; y++) {
            for (let x: number = qw; x < 0; x++) {
                dst[dstOff++] = src[srcOff++];
                dst[dstOff++] = src[srcOff++];
                dst[dstOff++] = src[srcOff++];
                dst[dstOff++] = src[srcOff++];
            }

            for (let x: number = w; x < 0; x++) {
                dst[dstOff++] = src[srcOff++];
            }

            dstOff += dstStep;
            srcOff += srcStep;
        }
    }

    plotSprite(x: number, y: number): void {
        x |= 0;
        y |= 0;

        x += this.xof;
        y += this.yof;

        let dstOff: number = x + y * Pix2D.width;
        let srcOff: number = 0;

        let h: number = this.hi;
        let w: number = this.wi;

        let dstStep: number = Pix2D.width - w;
        let srcStep: number = 0;

        if (y < Pix2D.clipMinY) {
            const cutoff: number = Pix2D.clipMinY - y;
            h -= cutoff;
            y = Pix2D.clipMinY;
            srcOff += cutoff * w;
            dstOff += cutoff * Pix2D.width;
        }

        if (y + h > Pix2D.clipMaxY) {
            h -= y + h - Pix2D.clipMaxY;
        }

        if (x < Pix2D.clipMinX) {
            const cutoff: number = Pix2D.clipMinX - x;
            w -= cutoff;
            x = Pix2D.clipMinX;
            srcOff += cutoff;
            dstOff += cutoff;
            srcStep += cutoff;
            dstStep += cutoff;
        }

        if (x + w > Pix2D.clipMaxX) {
            const cutoff: number = x + w - Pix2D.clipMaxX;
            w -= cutoff;
            srcStep += cutoff;
            dstStep += cutoff;
        }

        if (w > 0 && h > 0) {
            this.plot(w, h, this.data, srcOff, srcStep, Pix2D.pixels, dstOff, dstStep);
        }
    }

    private plot(w: number, h: number, src: Int32Array, srcOff: number, srcStep: number, dst: Int32Array, dstOff: number, dstStep: number): void {
        const qw: number = -(w >> 2);
        w = -(w & 0x3);

        for (let y: number = -h; y < 0; y++) {
            for (let x: number = qw; x < 0; x++) {
                let rgb: number = src[srcOff++];
                if (rgb === 0) {
                    dstOff++;
                } else {
                    dst[dstOff++] = rgb;
                }

                rgb = src[srcOff++];
                if (rgb === 0) {
                    dstOff++;
                } else {
                    dst[dstOff++] = rgb;
                }

                rgb = src[srcOff++];
                if (rgb === 0) {
                    dstOff++;
                } else {
                    dst[dstOff++] = rgb;
                }

                rgb = src[srcOff++];
                if (rgb === 0) {
                    dstOff++;
                } else {
                    dst[dstOff++] = rgb;
                }
            }

            for (let x: number = w; x < 0; x++) {
                const rgb: number = src[srcOff++];
                if (rgb === 0) {
                    dstOff++;
                } else {
                    dst[dstOff++] = rgb;
                }
            }

            dstOff += dstStep;
            srcOff += srcStep;
        }
    }

    transPlotSprite(x: number, y: number, alpha: number): void {
        x |= 0;
        y |= 0;

        x += this.xof;
        y += this.yof;

        let dstStep: number = x + y * Pix2D.width;
        let srcStep: number = 0;
        let h: number = this.hi;
        let w: number = this.wi;
        let dstOff: number = Pix2D.width - w;
        let srcOff: number = 0;

        if (y < Pix2D.clipMinY) {
            const cutoff: number = Pix2D.clipMinY - y;
            h -= cutoff;
            y = Pix2D.clipMinY;
            srcStep += cutoff * w;
            dstStep += cutoff * Pix2D.width;
        }

        if (y + h > Pix2D.clipMaxY) {
            h -= y + h - Pix2D.clipMaxY;
        }

        if (x < Pix2D.clipMinX) {
            const cutoff: number = Pix2D.clipMinX - x;
            w -= cutoff;
            x = Pix2D.clipMinX;
            srcStep += cutoff;
            dstStep += cutoff;
            srcOff += cutoff;
            dstOff += cutoff;
        }

        if (x + w > Pix2D.clipMaxX) {
            const cutoff: number = x + w - Pix2D.clipMaxX;
            w -= cutoff;
            srcOff += cutoff;
            dstOff += cutoff;
        }

        if (w > 0 && h > 0) {
            this.tranSprite(Pix2D.pixels, this.data, srcStep, dstStep, w, h, dstOff, srcOff, alpha);
        }
    }

    private tranSprite(dst: Int32Array, src: Int32Array, srcOff: number, dstOff: number, w: number, h: number, dstStep: number, srcStep: number, alpha: number): void {
        const invAlpha: number = 256 - alpha;

        for (let y: number = -h; y < 0; y++) {
            for (let x: number = -w; x < 0; x++) {
                const rgb: number = src[srcOff++];
                if (rgb === 0) {
                    dstOff++;
                } else {
                    const dstRgb: number = dst[dstOff];
                    dst[dstOff++] = ((((rgb & 0xff00ff) * alpha + (dstRgb & 0xff00ff) * invAlpha) & 0xff00ff00) + (((rgb & 0xff00) * alpha + (dstRgb & 0xff00) * invAlpha) & 0xff0000)) >> 8;
                }
            }

            dstOff += dstStep;
            srcOff += srcStep;
        }
    }

    scanlineRotatePlotSprite(x: number, y: number, w: number, h: number, anchorX: number, anchorY: number, theta: number, zoom: number, lineStart: Int32Array, lineWidth: Int32Array): void {
        x |= 0;
        y |= 0;
        w |= 0;
        h |= 0;

        try {
            const centerX: number = (-w / 2) | 0;
            const centerY: number = (-h / 2) | 0;

            const sin: number = (Math.sin(theta / 326.11) * 65536.0) | 0;
            const cos: number = (Math.cos(theta / 326.11) * 65536.0) | 0;
            const sinZoom: number = (sin * zoom) >> 8;
            const cosZoom: number = (cos * zoom) >> 8;

            let leftX: number = (anchorX << 16) + centerY * sinZoom + centerX * cosZoom;
            let leftY: number = (anchorY << 16) + (centerY * cosZoom - centerX * sinZoom);
            let leftOff: number = x + y * Pix2D.width;

            for (let i: number = 0; i < h; i++) {
                const dstOff: number = lineStart[i];
                let dstX: number = leftOff + dstOff;

                let srcX: number = leftX + cosZoom * dstOff;
                let srcY: number = leftY - sinZoom * dstOff;

                for (let j: number = -lineWidth[i]; j < 0; j++) {
                    Pix2D.pixels[dstX++] = this.data[(srcX >> 16) + (srcY >> 16) * this.wi];
                    srcX += cosZoom;
                    srcY -= sinZoom;
                }

                leftX += sinZoom;
                leftY += cosZoom;
                leftOff += Pix2D.width;
            }
        } catch (_e) {
            // empty
        }
    }

    rotatePlotSprite(x: number, y: number, w: number, h: number, anchorX: number, anchorY: number, theta: number, zoom: number): void {
        x |= 0;
        y |= 0;
        w |= 0;
        h |= 0;

        try {
            const centerX: number = (-w / 2) | 0;
            const centerY: number = (-h / 2) | 0;

            const sin: number = (Math.sin(theta) * 65536.0) | 0;
            const cos: number = (Math.cos(theta) * 65536.0) | 0;
            const sinZoom: number = (sin * zoom) >> 8;
            const cosZoom: number = (cos * zoom) >> 8;

            let leftX: number = (anchorX << 16) + (centerY * sinZoom + centerX * cosZoom);
            let leftY: number = (anchorY << 16) + (centerY * cosZoom - centerX * sinZoom);
            let leftOff: number = x + y * Pix2D.width;

            for (let i: number = 0; i < h; i++) {
                let dstX: number = leftOff;
                let srcX: number = leftX;
                let srcY: number = leftY;

                for (let j: number = -w; j < 0; j++) {
                    const rgb = this.data[(srcX >> 16) + (srcY >> 16) * this.owi];
                    if (rgb == 0) {
                        dstX++;
                    } else {
                        Pix2D.pixels[dstX++] = rgb;
                    }

                    srcX += cosZoom;
                    srcY -= sinZoom;
                }

                leftX += sinZoom;
                leftY += cosZoom;
                leftOff += Pix2D.width;
            }
        } catch (_e) {
            // empty
        }
    }

    scanlinePlotSprite(mask: Pix8, x: number, y: number): void {
        x |= 0;
        y |= 0;

        x += this.xof;
        y += this.yof;

        let dstStep: number = x + y * Pix2D.width;
        let srcStep: number = 0;
        let h: number = this.hi;
        let w: number = this.wi;
        let dstOff: number = Pix2D.width - w;
        let srcOff: number = 0;

        if (y < Pix2D.clipMinY) {
            const cutoff: number = Pix2D.clipMinY - y;
            h -= cutoff;
            y = Pix2D.clipMinY;
            srcStep += cutoff * w;
            dstStep += cutoff * Pix2D.width;
        }

        if (y + h > Pix2D.clipMaxY) {
            h -= y + h - Pix2D.clipMaxY;
        }

        if (x < Pix2D.clipMinX) {
            const cutoff: number = Pix2D.clipMinX - x;
            w -= cutoff;
            x = Pix2D.clipMinX;
            srcStep += cutoff;
            dstStep += cutoff;
            srcOff += cutoff;
            dstOff += cutoff;
        }

        if (x + w > Pix2D.clipMaxX) {
            const cutoff: number = x + w - Pix2D.clipMaxX;
            w -= cutoff;
            srcOff += cutoff;
            dstOff += cutoff;
        }

        if (w > 0 && h > 0) {
            this.plotScanline(Pix2D.pixels, this.data, srcStep, dstStep, w, h, dstOff, srcOff, mask.data);
        }
    }

    private plotScanline(dst: Int32Array, src: Int32Array, srcOff: number, dstOff: number, w: number, h: number, dstStep: number, srcStep: number, mask: Int8Array): void {
        const qw: number = -(w >> 2);
        w = -(w & 0x3);

        for (let y: number = -h; y < 0; y++) {
            for (let x: number = qw; x < 0; x++) {
                let rgb: number = src[srcOff++];
                if (rgb !== 0 && mask[dstOff] === 0) {
                    dst[dstOff++] = rgb;
                } else {
                    dstOff++;
                }

                rgb = src[srcOff++];
                if (rgb !== 0 && mask[dstOff] === 0) {
                    dst[dstOff++] = rgb;
                } else {
                    dstOff++;
                }

                rgb = src[srcOff++];
                if (rgb !== 0 && mask[dstOff] === 0) {
                    dst[dstOff++] = rgb;
                } else {
                    dstOff++;
                }

                rgb = src[srcOff++];
                if (rgb !== 0 && mask[dstOff] === 0) {
                    dst[dstOff++] = rgb;
                } else {
                    dstOff++;
                }
            }

            for (let x: number = w; x < 0; x++) {
                const rgb: number = src[srcOff++];
                if (rgb !== 0 && mask[dstOff] === 0) {
                    dst[dstOff++] = rgb;
                } else {
                    dstOff++;
                }
            }

            dstOff += dstStep;
            srcOff += srcStep;
        }
    }
}
