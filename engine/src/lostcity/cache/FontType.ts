import Jagfile from '#jagex2/io/Jagfile.js';

export default class FontType {
    static CHAR_LOOKUP: number[] = [];
    static instances: FontType[] = [];

    static {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!"£$%^&*()-_=+[{]};:\'@#~,<.>/?\\| ';

        for (let i = 0; i < 256; i++) {
            let c = charset.indexOf(String.fromCharCode(i));
            if (c == -1) {
                c = 74;
            }

            FontType.CHAR_LOOKUP[i] = c;
        }
    }

    static load(dir: string) {
        const title = Jagfile.load(`${dir}/title`);

        FontType.instances[0] = new FontType(title, 'p11');
        FontType.instances[1] = new FontType(title, 'p12');
        FontType.instances[2] = new FontType(title, 'b12');
        FontType.instances[3] = new FontType(title, 'q8');
    }

    static get(id: number) {
        return FontType.instances[id];
    }

    // ----

    charMask: Uint8Array[] = new Array(94);
    charMaskWidth: Uint8Array = new Uint8Array(94);
    charMaskHeight: Uint8Array = new Uint8Array(94);
    charOffsetX: Uint8Array = new Uint8Array(94);
    charOffsetY: Uint8Array = new Uint8Array(94);
    charAdvance: Uint8Array = new Uint8Array(95);
    drawWidth: Uint8Array = new Uint8Array(256);
    height: number = 0;

    constructor(title: Jagfile, font: string) {
        const dat = title.read(`${font}.dat`);
        const idx = title.read('index.dat');
        if (!dat || !idx) {
            return;
        }

        idx.pos = dat.g2() + 4;
        const off = idx.g1();
        if (off > 0) {
            idx.pos += (off - 1) * 3;
        }

        for (let i = 0; i < 94; i++) {
            this.charOffsetX[i] = idx.g1();
            this.charOffsetY[i] = idx.g1();

            const w = (this.charMaskWidth[i] = idx.g2());
            const h = (this.charMaskHeight[i] = idx.g2());

            const type = idx.g1();
            const len = w * h;

            this.charMask[i] = new Uint8Array(len);

            if (type == 0) {
                for (let j = 0; j < len; j++) {
                    this.charMask[i][j] = dat.g1();
                }
            } else if (type == 1) {
                for (let x = 0; x < w; x++) {
                    for (let y = 0; y < h; y++) {
                        this.charMask[i][x + y * w] = dat.g1();
                    }
                }
            }

            if (h > this.height) {
                this.height = h;
            }

            this.charOffsetX[i] = 1;
            this.charAdvance[i] = w + 2;

            // ----

            let space = 0;
            for (let y = Math.floor(h / 7); y < h; y++) {
                space += this.charMask[i][y * w];
            }

            if (space <= Math.floor(h / 7)) {
                this.charAdvance[i]--;
                this.charOffsetX[i] = 0;
            }

            // ----

            space = 0;
            for (let y = Math.floor(h / 7); y < h; y++) {
                space += this.charMask[i][w + y * w - 1];
            }

            if (space <= Math.floor(h / 7)) {
                this.charAdvance[i]--;
            }
        }

        this.charAdvance[94] = this.charAdvance[8];
        for (let c = 0; c < 256; c++) {
            this.drawWidth[c] = this.charAdvance[FontType.CHAR_LOOKUP[c]];
        }
    }

    stringWidth(str: string) {
        if (str == null) {
            return 0;
        }

        let size = 0;
        for (let c = 0; c < str.length; c++) {
            if (str.charAt(c) == '@' && c + 4 < str.length && str.charAt(c + 4) == '@') {
                c += 4;
            } else {
                size += this.drawWidth[str.charCodeAt(c)];
            }
        }

        return size;
    }

    split(str: string, maxWidth: number): string[] {
        if (str.length === 0) {
            // special case for empty string
            return [str];
        }

        const lines: string[] = [];
        while (str.length > 0) {
            // check if the string even needs to be broken up
            const width = this.stringWidth(str);
            if (width <= maxWidth && str.indexOf('|') === -1) {
                lines.push(str);
                break;
            }

            // we need to split on the next word boundary
            let splitIndex = str.length;

            // check the width at every space to see where we can cut the line
            for (let i = 0; i < str.length; i++) {
                if (str[i] === ' ') {
                    const w = this.stringWidth(str.substring(0, i));
                    if (w > maxWidth) {
                        break;
                    }
                    splitIndex = i;
                } else if (str[i] === '|') {
                    splitIndex = i;
                    break;
                }
            }

            lines.push(str.substring(0, splitIndex));
            str = str.substring(splitIndex + 1);
        }
        return lines;
    }
}
