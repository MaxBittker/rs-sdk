import Pix2D from '#/graphics/Pix2D.js';
import type JagFile from '#/io/JagFile.js';
import { TypedArray1d } from '#/util/Arrays.js';

export default class WorldMapFont extends Pix2D {
    private static readonly CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!\"£$%^&*()-_=+[{]};:'@#~,<.>/?\\| ";
    private static readonly fontChar: number[] = new TypedArray1d(256, 0);
    private static readonly fonts = 'Arial, Helvetica, sans-serif';

    static {
        for (let i = 0; i < 256; i++) {
            let c = WorldMapFont.CHARSET.indexOf(String.fromCharCode(i));
            if (c === -1) {
                c = 'J'.charCodeAt(0);
            }

            WorldMapFont.fontChar[i] = c * 9;
        }
    }

    private fontCharTrans: boolean = false; // detects antialiasing
    private fontCharPos: number = 0;
    private fontCharInfo: Uint8Array<ArrayBufferLike> = new Uint8Array(100_000);

    private canvas!: HTMLCanvasElement;
    private ctx!: CanvasRenderingContext2D;

    // dumped from another system that guarantees no antialiasing was used
    static load(jag: JagFile, name: string) {
        const font = new WorldMapFont();
        const fm = jag.read(`${name}.dat`);
        if (!fm) {
            throw new Error();
        }

        font.fontCharTrans = false;
        font.fontCharInfo = fm;
        font.fontCharPos = fm.length;
        return font;
    }

    static fromSystem(size: number, bold: boolean) {
        const font = new WorldMapFont();
        font.fontCharPos = 855;
        font.fontCharTrans = false;

        font.canvas = document.createElement('canvas');
        font.canvas.width = size + 50;
        font.canvas.height = size + 50;
        font.ctx = font.canvas.getContext('2d', { willReadFrequently: true })!;

        const style = bold ? 'bold' : '';
        font.ctx.font = `${style} ${size}px ${WorldMapFont.fonts}`;

        for (let i = 0; i < 95; i++) {
            font.loadGlyph(WorldMapFont.CHARSET[i], i, false);
        }

        if (bold && font.fontCharTrans) {
            font.ctx.font = `${size}px ${WorldMapFont.fonts}`;

            for (let i = 0; i < 95; i++) {
                font.loadGlyph(WorldMapFont.CHARSET[i], i, false);
            }

            if (!font.fontCharTrans) {
                font.fontCharPos = 855;
                font.fontCharTrans = false;

                for (let i = 0; i < 95; i++) {
                    font.loadGlyph(WorldMapFont.CHARSET[i], i, true);
                }
            }
        }

        font.fontCharInfo = font.fontCharInfo.slice(0, font.fontCharPos);
        return font;
    }

    private loadGlyph(c: string, id: number, offset: boolean) {
        const metrics = this.ctx.measureText(c);
        let width = Math.ceil(metrics.width);
        const initialWidth = width;

        if (offset) {
            if (c === '/') {
                offset = false;
            }

            if (c === 'f' || c === 't' || c === 'w' || c === 'v' || c === 'k' || c === 'x' || c === 'y' || c === 'A' || c === 'V' || c === 'W') {
                width++;
            }
        }

        const maxAscent = Math.ceil(metrics.actualBoundingBoxAscent);
        const maxDescent = Math.ceil(metrics.actualBoundingBoxDescent);
        const totalDescent = maxAscent + maxDescent;
        const height = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;

        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, width, height);

        this.ctx.fillStyle = 'white';
        this.ctx.fillText(c, 0, maxAscent);

        if (offset) {
            this.ctx.fillText(c, 1, maxAscent);
        }

        const imageData = this.ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;

        let top = totalDescent;
        let left = width;
        let bottom = 0;
        let right = 0;

        for (let y = 0; y < totalDescent; y++) {
            for (let x = 0; x < width; x++) {
                const alpha = pixels[(x + y * width) * 4];
                if (alpha !== 0) {
                    top = Math.min(top, y);
                    bottom = Math.max(bottom, y + 1);
                    left = Math.min(left, x);
                    right = Math.max(right, x + 1);
                }
            }
        }

        // header
        this.fontCharInfo[id * 9 + 0] = this.fontCharPos >> 14;
        this.fontCharInfo[id * 9 + 1] = (this.fontCharPos >> 7) & 0x7f;
        this.fontCharInfo[id * 9 + 2] = this.fontCharPos & 0x7f;
        this.fontCharInfo[id * 9 + 3] = right - left;
        this.fontCharInfo[id * 9 + 4] = bottom - top;
        this.fontCharInfo[id * 9 + 5] = left;
        this.fontCharInfo[id * 9 + 6] = maxAscent - top;
        this.fontCharInfo[id * 9 + 7] = initialWidth;
        this.fontCharInfo[id * 9 + 8] = height;

        for (let y = top; y < bottom; y++) {
            for (let x = left; x < right; x++) {
                const alpha = pixels[(x + y * width) * 4] & 0xFF;

                if (alpha > 30 && alpha < 230) {
                    this.fontCharTrans = true;
                }

                this.fontCharInfo[this.fontCharPos++] = alpha;
            }
        }
    }

    centreString(str: string, x: number, y: number, rgb: number, shadowed: boolean) {
        this.drawString(str, x - ((this.stringWid(str) / 2) | 0), y, rgb, shadowed);
    }

    stringWid(str: string): number {
        const length: number = str.length;

        let w: number = 0;
        for (let i: number = 0; i < length; i++) {
            if (str.charAt(i) === '@' && i + 4 < length && str.charAt(i + 4) === '@') {
                i += 4;
            } else if (str.charAt(i) === '~' && i + 4 < length && str.charAt(i + 4) === '~') {
                i += 4;
            } else {
                const c = WorldMapFont.fontChar[str.charCodeAt(i)];
                w += this.fontCharInfo[c + 7];
            }
        }

        return w;
    }

    drawString(str: string, x: number, y: number, rgb: number, shadowed: boolean) {
        if (this.fontCharTrans || rgb === 0) {
            shadowed = false;
        }

        for (let i = 0; i < str.length; i++) {
            const c = WorldMapFont.fontChar[str.charCodeAt(i)];

            if (shadowed) {
                this.drawChar(c, x + 1, y, 0);
                this.drawChar(c, x, y + 1, 0);
            }

            this.drawChar(c, x, y, rgb);
            x += this.fontCharInfo[c + 7];
        }
    }

    private drawChar(c: number, x: number, y: number, rgb: number) {
        const info = this.fontCharInfo;

        let dx = x + info[c + 5];
        let dy = y - info[c + 6];

        let w = info[c + 3];
        let h = info[c + 4];

        let srcOff = (info[c] << 14) | (info[c + 1] << 7) | info[c + 2];
        let srcStep = 0;

        let dstOff = dx + dy * Pix2D.width;
        let dstStep = Pix2D.width - w;

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
            if (this.fontCharTrans) {
                this.plotLetterTrans(w, h, info, rgb, srcOff, srcStep, Pix2D.pixels, dstOff, dstStep);
            } else {
                this.plotLetter(w, h, info, rgb, srcOff, srcStep, Pix2D.pixels, dstOff, dstStep);
            }
        }
    }

    private plotLetter(w: number, h: number, mask: Uint8Array, rgb: number, srcOff: number, srcStep: number, dst: Int32Array, dstOff: number, dstStep: number) {
        const qw: number = -(w >> 2);
        w = -(w & 0x3);

        for (let y: number = -h; y < 0; y++) {
            for (let x: number = qw; x < 0; x++) {
                if (mask[srcOff++] === 0) {
                    dstOff++;
                } else {
                    dst[dstOff++] = rgb;
                }

                if (mask[srcOff++] === 0) {
                    dstOff++;
                } else {
                    dst[dstOff++] = rgb;
                }

                if (mask[srcOff++] === 0) {
                    dstOff++;
                } else {
                    dst[dstOff++] = rgb;
                }

                if (mask[srcOff++] === 0) {
                    dstOff++;
                } else {
                    dst[dstOff++] = rgb;
                }
            }

            for (let x: number = w; x < 0; x++) {
                if (mask[srcOff++] === 0) {
                    dstOff++;
                } else {
                    dst[dstOff++] = rgb;
                }
            }

            dstOff += dstStep;
            srcOff += srcStep;
        }
    }

    private plotLetterTrans(w: number, h: number, mask: Uint8Array, rgb: number, srcOff: number, srcStep: number, dst: Int32Array, dstOff: number, dstStep: number) {
        for (let y: number = -h; y < 0; y++) {
            for (let x: number = -w; x < 0; x++) {
                const trans = mask[srcOff++] & 0xFF;
                if (trans === 0) {
                    dstOff++;
                } else if (trans >= 230) {
                    dst[dstOff++] = rgb;
                } else {
                    const dstRgb: number = dst[dstOff];
                    dst[dstOff++] = ((((rgb & 0xff00ff) * trans + (dstRgb & 0xff00ff) * (256 - trans)) & 0xff00ff00) + (((rgb & 0xff00) * trans + (dstRgb & 0xff00) * (256 - trans)) & 0xff0000)) >> 8;
                }
            }

            dstOff += dstStep;
            srcOff += srcStep;
        }
    }

    getHeight() {
        return this.fontCharInfo[8] - 1;
    }

    getYOffset() {
        return this.fontCharInfo[6];
    }
}
