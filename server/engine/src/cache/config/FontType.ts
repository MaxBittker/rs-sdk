import Jagfile from '#/io/Jagfile.js';

export default class FontType {
    static instances: FontType[] = [];

    static load(dir: string) {
        const title = Jagfile.load(`${dir}/client/title`);

        FontType.instances[0] = new FontType(title, 'p11_full', false);
        FontType.instances[1] = new FontType(title, 'p12_full', false);
        FontType.instances[2] = new FontType(title, 'b12_full', false);
        FontType.instances[3] = new FontType(title, 'q8_full', true);
    }

    static get(id: number) {
        return FontType.instances[id];
    }

    static get count() {
        return this.instances.length;
    }

    // ----

    charMask: Uint8Array[] = new Array(256);
    charMaskWidth: Uint8Array = new Uint8Array(256);
    charMaskHeight: Uint8Array = new Uint8Array(256);
    charOffsetX: Uint8Array = new Uint8Array(256);
    charOffsetY: Uint8Array = new Uint8Array(256);
    charAdvance: Uint8Array = new Uint8Array(256);
    height: number = 0;

    constructor(title: Jagfile, font: string, quill: boolean) {
        const data = title.read(`${font}.dat`);
        const index = title.read('index.dat');
        if (!data || !index) {
            return;
        }

        index.pos = data.g2() + 4;
        const palCount = index.g1();
        if (palCount > 0) {
            index.pos += (palCount - 1) * 3;
        }

        for (let c = 0; c < 256; c++) {
            this.charOffsetX[c] = index.g1();
            this.charOffsetY[c] = index.g1();

            const wi = (this.charMaskWidth[c] = index.g2());
            const hi = (this.charMaskHeight[c] = index.g2());

            const pixelOrder = index.g1();

            const len = wi * hi;
            this.charMask[c] = new Uint8Array(len);

            if (pixelOrder == 0) {
                for (let j = 0; j < len; j++) {
                    this.charMask[c][j] = data.g1();
                }
            } else if (pixelOrder == 1) {
                for (let x = 0; x < wi; x++) {
                    for (let y = 0; y < hi; y++) {
                        this.charMask[c][x + y * wi] = data.g1();
                    }
                }
            }

            if (hi > this.height && c < 128) {
                this.height = hi;
            }

            this.charOffsetX[c] = 1;
            this.charAdvance[c] = wi + 2;

            // ----

            let space = 0;
            for (let y = Math.floor(hi / 7); y < hi; y++) {
                space += this.charMask[c][y * wi];
            }

            if (space <= Math.floor(hi / 7)) {
                this.charAdvance[c]--;
                this.charOffsetX[c] = 0;
            }

            // ----

            space = 0;
            for (let y = Math.floor(hi / 7); y < hi; y++) {
                space += this.charMask[c][wi + y * wi - 1];
            }

            if (space <= Math.floor(hi / 7)) {
                this.charAdvance[c]--;
            }
        }

        if (quill) {
            this.charAdvance[32] = this.charAdvance[73];
        } else {
            this.charAdvance[32] = this.charAdvance[105];
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
                size += this.charAdvance[str.charCodeAt(c)];
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
