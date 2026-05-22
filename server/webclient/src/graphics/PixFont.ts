import Linkable2 from '#/datastruct/Linkable2.js';

import { Colour } from '#/graphics/Colour.js';
import Pix2D from '#/graphics/Pix2D.js';

import JagFile from '#/io/JagFile.js';
import Packet from '#/io/Packet.js';

import JavaRandom from '#/util/JavaRandom.js';

export default class PixFont extends Linkable2 {
    charMask: Int8Array[] = new Array(256);
    charMaskWidth: Int32Array = new Int32Array(256);
    charMaskHeight: Int32Array = new Int32Array(256);
    charOffsetX: Int32Array = new Int32Array(256);
    charOffsetY: Int32Array = new Int32Array(256);
    charAdvance: Int32Array = new Int32Array(256);

    rand: JavaRandom = new JavaRandom(Date.now());
    strikeout: boolean = false;
    height: number = 0;

    static depack(archive: JagFile, name: string, quill: boolean): PixFont {
        const dat: Packet = new Packet(archive.read(name + '.dat'));
        const idx: Packet = new Packet(archive.read('index.dat'));
        idx.pos = dat.g2() + 4;

        const palCount: number = idx.g1();
        if (palCount > 0) {
            idx.pos += (palCount - 1) * 3;
        }

        const font: PixFont = new PixFont();
        for (let c: number = 0; c < 256; c++) {
            font.charOffsetX[c] = idx.g1();
            font.charOffsetY[c] = idx.g1();
            const wi: number = (font.charMaskWidth[c] = idx.g2());
            const hi: number = (font.charMaskHeight[c] = idx.g2());
            const pixelOrder: number = idx.g1();

            const len: number = wi * hi;
            font.charMask[c] = new Int8Array(len);

            if (pixelOrder === 0) {
                for (let j: number = 0; j < wi * hi; j++) {
                    font.charMask[c][j] = dat.g1b();
                }
            } else if (pixelOrder === 1) {
                for (let x: number = 0; x < wi; x++) {
                    for (let y: number = 0; y < hi; y++) {
                        font.charMask[c][x + y * wi] = dat.g1b();
                    }
                }
            }

            if (hi > font.height && c < 128) {
                font.height = hi;
            }

            font.charOffsetX[c] = 1;
            font.charAdvance[c] = wi + 2;

            {
                let space: number = 0;
                for (let y: number = (hi / 7) | 0; y < hi; y++) {
                    space += font.charMask[c][y * wi];
                }

                if (space <= ((hi / 7) | 0)) {
                    font.charAdvance[c]--;
                    font.charOffsetX[c] = 0;
                }
            }

            {
                let space: number = 0;
                for (let y: number = (hi / 7) | 0; y < hi; y++) {
                    space += font.charMask[c][wi + y * wi - 1];
                }

                if (space <= ((hi / 7) | 0)) {
                    font.charAdvance[c]--;
                }
            }
        }

        if (quill) {
            // ' '  = 'I'
            font.charAdvance[32] = font.charAdvance[73];
        } else {
            // ' ' = 'i'
            font.charAdvance[32] = font.charAdvance[105];
        }

        return font;
    }

    centreString(str: string | null, x: number, y: number, rgb: number): void {
        if (str === null) {
            return;
        }

        x |= 0;
        y |= 0;

        this.drawString(str, x - ((this.stringWid(str) / 2) | 0), y, rgb);
    }

    centreStringTag(str: string, x: number, y: number, rgb: number, shadowed: boolean): void {
        x |= 0;
        y |= 0;

        this.drawStringTag(str, x - ((this.stringWid(str) / 2) | 0), y, rgb, shadowed);
    }

    stringWid(str: string | null): number {
        if (str === null) {
            return 0;
        }

        const length: number = str.length;
        let w: number = 0;
        for (let c: number = 0; c < length; c++) {
            if (str.charAt(c) === '@' && c + 4 < length && str.charAt(c + 4) === '@') {
                c += 4;
            } else {
                w += this.charAdvance[str.charCodeAt(c)];
            }
        }

        return w;
    }

    drawString(str: string | null, x: number, y: number, rgb: number): void {
        if (str === null) {
            return;
        }

        x |= 0;
        y |= 0;

        y -= this.height;

        for (let i: number = 0; i < str.length; i++) {
            const c: number = str.charCodeAt(i);

            if (c !== 32) {
                this.plotLetter(this.charMask[c], x + this.charOffsetX[c], y + this.charOffsetY[c], this.charMaskWidth[c], this.charMaskHeight[c], rgb);
            }

            x += this.charAdvance[c];
        }
    }

    centreStringWave(str: string | null, x: number, y: number, rgb: number, phase: number): void {
        if (str === null) {
            return;
        }

        x |= 0;
        y |= 0;

        x -= (this.stringWid(str) / 2) | 0;
        const offY: number = y - this.height;

        for (let i: number = 0; i < str.length; i++) {
            const c: number = str.charCodeAt(i);

            if (c != 32) {
                this.plotLetter(this.charMask[c], x + this.charOffsetX[c], offY + this.charOffsetY[c] + ((Math.sin(i / 2.0 + phase / 5.0) * 5.0) | 0), this.charMaskWidth[c], this.charMaskHeight[c], rgb);
            }

            x += this.charAdvance[c];
        }
    }

    drawStringTag(str: string, x: number, y: number, rgb: number, shadowed: boolean): void {
        x |= 0;
        y |= 0;

        this.strikeout = false;
        const startX = x;

        const length: number = str.length;
        y -= this.height;
        for (let i: number = 0; i < length; i++) {
            if (str.charAt(i) === '@' && i + 4 < length && str.charAt(i + 4) === '@') {
                const tag = this.updateState(str.substring(i + 1, i + 4));
                if (tag !== -1) {
                    rgb = tag;
                }
                i += 4;
            } else {
                const c: number = str.charCodeAt(i);

                if (c !== 32) {
                    if (shadowed) {
                        this.plotLetter(this.charMask[c], x + this.charOffsetX[c] + 1, y + this.charOffsetY[c] + 1, this.charMaskWidth[c], this.charMaskHeight[c], Colour.BLACK);
                    }
                    this.plotLetter(this.charMask[c], x + this.charOffsetX[c], y + this.charOffsetY[c], this.charMaskWidth[c], this.charMaskHeight[c], rgb);
                }

                x += this.charAdvance[c];
            }
        }

        if (this.strikeout) {
            Pix2D.hline(startX, y + ((this.height * 0.7) | 0), x - startX, Colour.DARKRED);
        }
    }

    drawStringAntiMacro(str: string, x: number, y: number, rgb: number, shadowed: boolean, seed: number): void {
        x |= 0;
        y |= 0;

        this.rand.setSeed(seed);

        const rand: number = (this.rand.nextInt() & 0x1f) + 192;
        const offY: number = y - this.height;
        for (let i: number = 0; i < str.length; i++) {
            if (str.charAt(i) === '@' && i + 4 < str.length && str.charAt(i + 4) === '@') {
                const tag = this.updateState(str.substring(i + 1, i + 4));
                if (tag !== -1) {
                    rgb = tag;
                }
                i += 4;
            } else {
                const c: number = str.charCodeAt(i);
                if (c !== 32) {
                    if (shadowed) {
                        this.plotLetterTrans(this.charMask[c], x + this.charOffsetX[c] + 1, offY + this.charOffsetY[c] + 1, this.charMaskWidth[c], this.charMaskHeight[c], Colour.BLACK, 192);
                    }

                    this.plotLetterTrans(this.charMask[c], x + this.charOffsetX[c], offY + this.charOffsetY[c], this.charMaskWidth[c], this.charMaskHeight[c], rgb, rand);
                }

                x += this.charAdvance[c];
                if ((this.rand.nextInt() & 0x3) === 0) {
                    x++;
                }
            }
        }
    }

    updateState(tag: string): number {
        if (tag === 'red') {
            return Colour.RED;
        } else if (tag === 'gre') {
            return Colour.GREEN;
        } else if (tag === 'blu') {
            return Colour.BLUE;
        } else if (tag === 'yel') {
            return Colour.YELLOW;
        } else if (tag === 'cya') {
            return Colour.CYAN;
        } else if (tag === 'mag') {
            return Colour.MAGENTA;
        } else if (tag === 'whi') {
            return Colour.WHITE;
        } else if (tag === 'bla') {
            return Colour.BLACK;
        } else if (tag === 'lre') {
            return Colour.LIGHTRED;
        } else if (tag === 'dre') {
            return Colour.DARKRED;
        } else if (tag === 'dbl') {
            return Colour.DARKBLUE;
        } else if (tag === 'or1') {
            return Colour.ORANGE1;
        } else if (tag === 'or2') {
            return Colour.ORANGE2;
        } else if (tag === 'or3') {
            return Colour.ORANGE3;
        } else if (tag === 'gr1') {
            return Colour.GREEN1;
        } else if (tag === 'gr2') {
            return Colour.GREEN2;
        } else if (tag === 'gr3') {
            return Colour.GREEN3;
        } else {
            if (tag === 'str') {
                this.strikeout = true;
            }

            return -1;
        }
    }

    drawStringRight(str: string, x: number, y: number, rgb: number, shadowed: boolean = true): void {
        x |= 0;
        y |= 0;

        if (shadowed) {
            this.drawString(str, x - this.stringWid(str) + 1, y + 1, Colour.BLACK);
        }
        this.drawString(str, x - this.stringWid(str), y, rgb);
    }

    plotLetter(data: Int8Array, x: number, y: number, w: number, h: number, rgb: number): void {
        x |= 0;
        y |= 0;
        w |= 0;
        h |= 0;

        let dstOff: number = x + y * Pix2D.width;
        let dstStep: number = Pix2D.width - w;

        let srcStep: number = 0;
        let srcOff: number = 0;

        if (y < Pix2D.clipMinY) {
            const cutoff: number = Pix2D.clipMinY - y;
            h -= cutoff;
            y = Pix2D.clipMinY;
            srcOff += cutoff * w;
            dstOff += cutoff * Pix2D.width;
        }

        if (y + h >= Pix2D.clipMaxY) {
            h -= y + h + 1 - Pix2D.clipMaxY;
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

        if (x + w >= Pix2D.clipMaxX) {
            const cutoff: number = x + w + 1 - Pix2D.clipMaxX;
            w -= cutoff;
            srcStep += cutoff;
            dstStep += cutoff;
        }

        if (w > 0 && h > 0) {
            this.plot(Pix2D.pixels, data, rgb, srcOff, dstOff, w, h, dstStep, srcStep);
        }
    }

    private plot(dst: Int32Array, src: Int8Array, rgb: number, srcOff: number, dstOff: number, w: number, h: number, dstStep: number, srcStep: number): void {
        w |= 0;
        h |= 0;

        const hw: number = -(w >> 2);
        w = -(w & 0x3);

        for (let y: number = -h; y < 0; y++) {
            for (let x: number = hw; x < 0; x++) {
                if (src[srcOff++] === 0) {
                    dstOff++;
                } else {
                    dst[dstOff++] = rgb;
                }

                if (src[srcOff++] === 0) {
                    dstOff++;
                } else {
                    dst[dstOff++] = rgb;
                }

                if (src[srcOff++] === 0) {
                    dstOff++;
                } else {
                    dst[dstOff++] = rgb;
                }

                if (src[srcOff++] === 0) {
                    dstOff++;
                } else {
                    dst[dstOff++] = rgb;
                }
            }

            for (let x: number = w; x < 0; x++) {
                if (src[srcOff++] === 0) {
                    dstOff++;
                } else {
                    dst[dstOff++] = rgb;
                }
            }

            dstOff += dstStep;
            srcOff += srcStep;
        }
    }

    plotLetterTrans(data: Int8Array, x: number, y: number, w: number, h: number, rgb: number, alpha: number): void {
        x |= 0;
        y |= 0;
        w |= 0;
        h |= 0;

        let dstOff: number = x + y * Pix2D.width;
        let dstStep: number = Pix2D.width - w;

        let srcStep: number = 0;
        let srcOff: number = 0;

        if (y < Pix2D.clipMinY) {
            const cutoff: number = Pix2D.clipMinY - y;
            h -= cutoff;
            y = Pix2D.clipMinY;
            srcOff += cutoff * w;
            dstOff += cutoff * Pix2D.width;
        }

        if (y + h >= Pix2D.clipMaxY) {
            h -= y + h + 1 - Pix2D.clipMaxY;
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

        if (x + w >= Pix2D.clipMaxX) {
            const cutoff: number = x + w + 1 - Pix2D.clipMaxX;
            w -= cutoff;
            srcStep += cutoff;
            dstStep += cutoff;
        }

        if (w > 0 && h > 0) {
            this.plotTrans(Pix2D.pixels, data, rgb, srcOff, dstOff, w, h, dstStep, srcStep, alpha);
        }
    }

    private plotTrans(dst: Int32Array, src: Int8Array, rgb: number, srcOff: number, dstOff: number, w: number, h: number, dstStep: number, srcStep: number, alpha: number): void {
        w |= 0;
        h |= 0;

        const mixed: number = ((((rgb & 0xff00ff) * alpha) & 0xff00ff00) + (((rgb & 0xff00) * alpha) & 0xff0000)) >> 8;
        const invAlpha: number = 256 - alpha;

        for (let y: number = -h; y < 0; y++) {
            for (let x: number = -w; x < 0; x++) {
                if (src[srcOff++] === 0) {
                    dstOff++;
                } else {
                    const dstRgb: number = dst[dstOff];
                    dst[dstOff++] = (((((dstRgb & 0xff00ff) * invAlpha) & 0xff00ff00) + (((dstRgb & 0xff00) * invAlpha) & 0xff0000)) >> 8) + mixed;
                }
            }

            dstOff += dstStep;
            srcOff += srcStep;
        }
    }
}
