import Pix2D from '#/graphics/Pix2D.js';
import Pix8 from '#/graphics/Pix8.js';

import JagFile from '#/io/JagFile.js';
import { Int32Array2d, TypedArray1d } from '#/util/Arrays.js';

export default class Pix3D extends Pix2D {
    static lowMem: boolean = false;
    static lowDetail: boolean = true;

    static divTable: Int32Array = new Int32Array(512);
    static divTable2: Int32Array = new Int32Array(2048);
    static sinTable: Int32Array = new Int32Array(2048);
    static cosTable: Int32Array = new Int32Array(2048);
    static colourTable: Int32Array = new Int32Array(65536);

    static textures: (Pix8 | null)[] = new TypedArray1d(50, null);
    private static texTrans: boolean[] = new TypedArray1d(50, false);
    private static texAverage: Int32Array = new Int32Array(50);
    static activeTexels: (Int32Array | null)[] = new TypedArray1d(50, null);
    static texCycle: Int32Array = new Int32Array(50);
    static texPal: (Int32Array | null)[] = new TypedArray1d(50, null);
    static numTextures: number = 0;
    static originX: number = 0;
    static originY: number = 0;
    static texelPool: (Int32Array | null)[] | null = null;
    static poolSize: number = 0;
    private static opaque: boolean = false;

    static cycle: number = 0;
    static scanline: Int32Array = new Int32Array();
    static hclip: boolean = false;
    static trans: number = 0;

    static {
        for (let i: number = 1; i < 512; i++) {
            this.divTable[i] = (32768 / i) | 0;
        }

        for (let i: number = 1; i < 2048; i++) {
            this.divTable2[i] = (65536 / i) | 0;
        }

        for (let i: number = 0; i < 2048; i++) {
            // angular frequency: 2 * pi / 2048 = 0.0030679615757712823
            // * 65536 = maximum amplitude
            this.sinTable[i] = (Math.sin(i * 0.0030679615757712823) * 65536.0) | 0;
            this.cosTable[i] = (Math.cos(i * 0.0030679615757712823) * 65536.0) | 0;
        }
    }

    static setRenderClipping(): void {
        this.scanline = new Int32Array(Pix2D.height);
        for (let y: number = 0; y < Pix2D.height; y++) {
            this.scanline[y] = Pix2D.width * y;
        }
        this.originX = (Pix2D.width / 2) | 0;
        this.originY = (Pix2D.height / 2) | 0;
    }

    static override setClipping(width: number, height: number): void {
        this.scanline = new Int32Array(height);
        for (let y: number = 0; y < height; y++) {
            this.scanline[y] = width * y;
        }
        this.originX = (width / 2) | 0;
        this.originY = (height / 2) | 0;
    }

    static clearTexels(): void {
        this.texelPool = null;
        this.activeTexels.fill(null);
    }

    static initPool(size: number): void {
        if (this.texelPool) {
            return;
        }

        this.poolSize = size;

        if (this.lowMem) {
            this.texelPool = new Int32Array2d(size, 16384);
        } else {
            this.texelPool = new Int32Array2d(size, 65536);
        }

        this.activeTexels.fill(null);
    }

    static unpackTextures(textures: JagFile): void {
        this.numTextures = 0;

        for (let i: number = 0; i < 50; i++) {
            try {
                this.textures[i] = Pix8.depack(textures, i.toString());

                if (this.lowMem && this.textures[i]?.owi === 128) {
                    this.textures[i]?.halveSize();
                } else {
                    this.textures[i]?.trim();
                }

                this.numTextures++;
            } catch (_e) {
                // empty
            }
        }
    }

    static getTextureAverage(id: number): number {
        if (this.texAverage[id] !== 0) {
            return this.texAverage[id];
        }

        const palette: Int32Array | null = this.texPal[id];
        if (!palette) {
            return 0;
        }

        let r: number = 0;
        let g: number = 0;
        let b: number = 0;
        const length: number = palette.length;
        for (let i: number = 0; i < length; i++) {
            r += (palette[i] >> 16) & 0xff;
            g += (palette[i] >> 8) & 0xff;
            b += palette[i] & 0xff;
        }

        let rgb: number = (((r / length) | 0) << 16) + (((g / length) | 0) << 8) + ((b / length) | 0);
        rgb = this.gammaCorrect(rgb, 1.4);
        if (rgb === 0) {
            rgb = 1;
        }
        this.texAverage[id] = rgb;
        return rgb;
    }

    static pushTexture(id: number): void {
        if (this.activeTexels[id] && this.texelPool) {
            this.texelPool[this.poolSize++] = this.activeTexels[id];
            this.activeTexels[id] = null;
        }
    }

    private static getTexels(id: number): Int32Array | null {
        this.texCycle[id] = this.cycle++;
        if (this.activeTexels[id]) {
            return this.activeTexels[id];
        }

        let texels: Int32Array | null;
        if (this.poolSize > 0 && this.texelPool) {
            texels = this.texelPool[--this.poolSize];
            this.texelPool[this.poolSize] = null;
        } else {
            let cycle: number = 0;
            let selected: number = -1;
            for (let t: number = 0; t < this.numTextures; t++) {
                if (this.activeTexels[t] && (this.texCycle[t] < cycle || selected === -1)) {
                    cycle = this.texCycle[t];
                    selected = t;
                }
            }
            texels = this.activeTexels[selected];
            this.activeTexels[selected] = null;
        }

        this.activeTexels[id] = texels;
        const texture: Pix8 | null = this.textures[id];
        const palette: Int32Array | null = this.texPal[id];

        if (!texels || !texture || !palette) {
            return null;
        }

        if (this.lowMem) {
            this.texTrans[id] = false;
            for (let i: number = 0; i < 4096; i++) {
                const rgb: number = (texels[i] = palette[texture.data[i]] & 0xf8f8ff);
                if (rgb === 0) {
                    this.texTrans[id] = true;
                }
                texels[i + 4096] = (rgb - (rgb >>> 3)) & 0xf8f8ff;
                texels[i + 8192] = (rgb - (rgb >>> 2)) & 0xf8f8ff;
                texels[i + 12288] = (rgb - (rgb >>> 2) - (rgb >>> 3)) & 0xf8f8ff;
            }
        } else {
            if (texture.wi === 64) {
                for (let y: number = 0; y < 128; y++) {
                    for (let x: number = 0; x < 128; x++) {
                        texels[x + ((y << 7) | 0)] = palette[texture.data[(x >> 1) + (((y >> 1) << 6) | 0)]];
                    }
                }
            } else {
                for (let i: number = 0; i < 16384; i++) {
                    texels[i] = palette[texture.data[i]];
                }
            }

            this.texTrans[id] = false;
            for (let i: number = 0; i < 16384; i++) {
                texels[i] &= 0xf8f8ff;
                const rgb: number = texels[i];
                if (rgb === 0) {
                    this.texTrans[id] = true;
                }
                texels[i + 16384] = (rgb - (rgb >>> 3)) & 0xf8f8ff;
                texels[i + 32768] = (rgb - (rgb >>> 2)) & 0xf8f8ff;
                texels[i + 49152] = (rgb - (rgb >>> 2) - (rgb >>> 3)) & 0xf8f8ff;
            }
        }

        return texels;
    }

    static initColourTable(brightness: number): void {
        const randomBrightness: number = brightness + Math.random() * 0.03 - 0.015;

        let offset: number = 0;
        for (let y: number = 0; y < 512; y++) {
            const hue: number = ((y / 8) | 0) / 64.0 + 0.0078125;
            const saturation: number = (y & 0x7) / 8.0 + 0.0625;

            for (let x: number = 0; x < 128; x++) {
                const lightness: number = x / 128.0;
                let r: number = lightness;
                let g: number = lightness;
                let b: number = lightness;

                if (saturation !== 0.0) {
                    let q: number;
                    if (lightness < 0.5) {
                        q = lightness * (saturation + 1.0);
                    } else {
                        q = lightness + saturation - lightness * saturation;
                    }

                    const p: number = lightness * 2.0 - q;
                    let t: number = hue + 0.3333333333333333;
                    if (t > 1.0) {
                        t--;
                    }

                    let d11: number = hue - 0.3333333333333333;
                    if (d11 < 0.0) {
                        d11++;
                    }

                    if (t * 6.0 < 1.0) {
                        r = p + (q - p) * 6.0 * t;
                    } else if (t * 2.0 < 1.0) {
                        r = q;
                    } else if (t * 3.0 < 2.0) {
                        r = p + (q - p) * (0.6666666666666666 - t) * 6.0;
                    } else {
                        r = p;
                    }

                    if (hue * 6.0 < 1.0) {
                        g = p + (q - p) * 6.0 * hue;
                    } else if (hue * 2.0 < 1.0) {
                        g = q;
                    } else if (hue * 3.0 < 2.0) {
                        g = p + (q - p) * (0.6666666666666666 - hue) * 6.0;
                    } else {
                        g = p;
                    }

                    if (d11 * 6.0 < 1.0) {
                        b = p + (q - p) * 6.0 * d11;
                    } else if (d11 * 2.0 < 1.0) {
                        b = q;
                    } else if (d11 * 3.0 < 2.0) {
                        b = p + (q - p) * (0.6666666666666666 - d11) * 6.0;
                    } else {
                        b = p;
                    }
                }

                const intR: number = (r * 256.0) | 0;
                const intG: number = (g * 256.0) | 0;
                const intB: number = (b * 256.0) | 0;
                const rgb: number = (intR << 16) + (intG << 8) + intB;
                this.colourTable[offset++] = this.gammaCorrect(rgb, randomBrightness);
            }
        }

        for (let id: number = 0; id < 50; id++) {
            const texture: Pix8 | null = this.textures[id];
            if (!texture) {
                continue;
            }

            const palette: Int32Array = texture.bpal;
            this.texPal[id] = new Int32Array(palette.length);
            for (let i: number = 0; i < palette.length; i++) {
                const texturePalette: Int32Array | null = this.texPal[id];
                if (!texturePalette) {
                    continue;
                }

                texturePalette[i] = this.gammaCorrect(palette[i], randomBrightness);
            }
        }

        for (let id: number = 0; id < 50; id++) {
            this.pushTexture(id);
        }
    }

    private static gammaCorrect(rgb: number, gamma: number): number {
        const r: number = (rgb >> 16) / 256.0;
        const g: number = ((rgb >> 8) & 0xff) / 256.0;
        const b: number = (rgb & 0xff) / 256.0;

        const powR: number = Math.pow(r, gamma);
        const powG: number = Math.pow(g, gamma);
        const powB: number = Math.pow(b, gamma);

        const intR: number = (powR * 256.0) | 0;
        const intG: number = (powG * 256.0) | 0;
        const intB: number = (powB * 256.0) | 0;
        return (intR << 16) + (intG << 8) + intB;
    }

    static gouraudTriangle(
        xA: number, xB: number, xC: number,
        yA: number, yB: number, yC: number,
        colourA: number, colourB: number, colourC: number
    ): void {
        let xStepAB: number = 0;
        let colourStepAB: number = 0;
        if (yB !== yA) {
            xStepAB = (((xB - xA) << 16) / (yB - yA)) | 0;
            colourStepAB = (((colourB - colourA) << 15) / (yB - yA)) | 0;
        }

        let xStepBC: number = 0;
        let colourStepBC: number = 0;
        if (yC !== yB) {
            xStepBC = (((xC - xB) << 16) / (yC - yB)) | 0;
            colourStepBC = (((colourC - colourB) << 15) / (yC - yB)) | 0;
        }

        let xStepAC: number = 0;
        let colourStepAC: number = 0;
        if (yC !== yA) {
            xStepAC = (((xA - xC) << 16) / (yA - yC)) | 0;
            colourStepAC = (((colourA - colourC) << 15) / (yA - yC)) | 0;
        }

        if (yA <= yB && yA <= yC) {
            if (yA >= Pix2D.clipMaxY) {
                return;
            }

            if (yB > Pix2D.clipMaxY) {
                yB = Pix2D.clipMaxY;
            }

            if (yC > Pix2D.clipMaxY) {
                yC = Pix2D.clipMaxY;
            }

            if (yB < yC) {
                xC = xA <<= 16;
                colourC = colourA <<= 15;

                if (yA < 0) {
                    xC -= xStepAC * yA;
                    xA -= xStepAB * yA;
                    colourC -= colourStepAC * yA;
                    colourA -= colourStepAB * yA;
                    yA = 0;
                }

                xB <<= 16;
                colourB <<= 15;

                if (yB < 0) {
                    xB -= xStepBC * yB;
                    colourB -= colourStepBC * yB;
                    yB = 0;
                }

                if ((yA !== yB && xStepAC < xStepAB) || (yA === yB && xStepAC > xStepBC)) {
                    yC -= yB;
                    yB -= yA;
                    yA = this.scanline[yA];

                    while (true) {
                        yB--;

                        if (yB < 0) {
                            while (true) {
                                yC--;

                                if (yC < 0) {
                                    return;
                                }

                                this.gouraudRaster(xC >> 16, xB >> 16, colourC >> 7, colourB >> 7, Pix2D.pixels, yA, 0);
                                xC += xStepAC;
                                xB += xStepBC;
                                colourC += colourStepAC;
                                colourB += colourStepBC;
                                yA += Pix2D.width;
                            }
                        }

                        this.gouraudRaster(xC >> 16, xA >> 16, colourC >> 7, colourA >> 7, Pix2D.pixels, yA, 0);
                        xC += xStepAC;
                        xA += xStepAB;
                        colourC += colourStepAC;
                        colourA += colourStepAB;
                        yA += Pix2D.width;
                    }
                } else {
                    yC -= yB;
                    yB -= yA;
                    yA = this.scanline[yA];

                    while (true) {
                        yB--;

                        if (yB < 0) {
                            while (true) {
                                yC--;

                                if (yC < 0) {
                                    return;
                                }

                                this.gouraudRaster(xB >> 16, xC >> 16, colourB >> 7, colourC >> 7, Pix2D.pixels, yA, 0);
                                xC += xStepAC;
                                xB += xStepBC;
                                colourC += colourStepAC;
                                colourB += colourStepBC;
                                yA += Pix2D.width;
                            }
                        }

                        this.gouraudRaster(xA >> 16, xC >> 16, colourA >> 7, colourC >> 7, Pix2D.pixels, yA, 0);
                        xC += xStepAC;
                        xA += xStepAB;
                        colourC += colourStepAC;
                        colourA += colourStepAB;
                        yA += Pix2D.width;
                    }
                }
            } else {
                xB = xA <<= 16;
                colourB = colourA <<= 15;

                if (yA < 0) {
                    xB -= xStepAC * yA;
                    xA -= xStepAB * yA;
                    colourB -= colourStepAC * yA;
                    colourA -= colourStepAB * yA;
                    yA = 0;
                }

                xC <<= 16;
                colourC <<= 15;

                if (yC < 0) {
                    xC -= xStepBC * yC;
                    colourC -= colourStepBC * yC;
                    yC = 0;
                }

                if ((yA !== yC && xStepAC < xStepAB) || (yA === yC && xStepBC > xStepAB)) {
                    yB -= yC;
                    yC -= yA;
                    yA = this.scanline[yA];

                    while (true) {
                        yC--;

                        if (yC < 0) {
                            while (true) {
                                yB--;

                                if (yB < 0) {
                                    return;
                                }

                                this.gouraudRaster(xC >> 16, xA >> 16, colourC >> 7, colourA >> 7, Pix2D.pixels, yA, 0);
                                xC += xStepBC;
                                xA += xStepAB;
                                colourC += colourStepBC;
                                colourA += colourStepAB;
                                yA += Pix2D.width;
                            }
                        }

                        this.gouraudRaster(xB >> 16, xA >> 16, colourB >> 7, colourA >> 7, Pix2D.pixels, yA, 0);
                        xB += xStepAC;
                        xA += xStepAB;
                        colourB += colourStepAC;
                        colourA += colourStepAB;
                        yA += Pix2D.width;
                    }
                } else {
                    yB -= yC;
                    yC -= yA;
                    yA = this.scanline[yA];

                    while (true) {
                        yC--;

                        if (yC < 0) {
                            while (true) {
                                yB--;

                                if (yB < 0) {
                                    return;
                                }

                                this.gouraudRaster(xA >> 16, xC >> 16, colourA >> 7, colourC >> 7, Pix2D.pixels, yA, 0);
                                xC += xStepBC;
                                xA += xStepAB;
                                colourC += colourStepBC;
                                colourA += colourStepAB;
                                yA += Pix2D.width;
                            }
                        }

                        this.gouraudRaster(xA >> 16, xB >> 16, colourA >> 7, colourB >> 7, Pix2D.pixels, yA, 0);
                        xB += xStepAC;
                        xA += xStepAB;
                        colourB += colourStepAC;
                        colourA += colourStepAB;
                        yA += Pix2D.width;
                    }
                }
            }
        } else if (yB <= yC) {
            if (yB >= Pix2D.clipMaxY) {
                return;
            }

            if (yC > Pix2D.clipMaxY) {
                yC = Pix2D.clipMaxY;
            }

            if (yA > Pix2D.clipMaxY) {
                yA = Pix2D.clipMaxY;
            }

            if (yC < yA) {
                xA = xB <<= 16;
                colourA = colourB <<= 15;

                if (yB < 0) {
                    xA -= xStepAB * yB;
                    xB -= xStepBC * yB;
                    colourA -= colourStepAB * yB;
                    colourB -= colourStepBC * yB;
                    yB = 0;
                }

                xC <<= 16;
                colourC <<= 15;

                if (yC < 0) {
                    xC -= xStepAC * yC;
                    colourC -= colourStepAC * yC;
                    yC = 0;
                }

                if ((yB !== yC && xStepAB < xStepBC) || (yB === yC && xStepAB > xStepAC)) {
                    yA -= yC;
                    yC -= yB;
                    yB = this.scanline[yB];

                    while (true) {
                        yC--;

                        if (yC < 0) {
                            while (true) {
                                yA--;

                                if (yA < 0) {
                                    return;
                                }

                                this.gouraudRaster(xA >> 16, xC >> 16, colourA >> 7, colourC >> 7, Pix2D.pixels, yB, 0);
                                xA += xStepAB;
                                xC += xStepAC;
                                colourA += colourStepAB;
                                colourC += colourStepAC;
                                yB += Pix2D.width;
                            }
                        }

                        this.gouraudRaster(xA >> 16, xB >> 16, colourA >> 7, colourB >> 7, Pix2D.pixels, yB, 0);
                        xA += xStepAB;
                        xB += xStepBC;
                        colourA += colourStepAB;
                        colourB += colourStepBC;
                        yB += Pix2D.width;
                    }
                } else {
                    yA -= yC;
                    yC -= yB;
                    yB = this.scanline[yB];

                    while (true) {
                        yC--;

                        if (yC < 0) {
                            while (true) {
                                yA--;

                                if (yA < 0) {
                                    return;
                                }

                                this.gouraudRaster(xC >> 16, xA >> 16, colourC >> 7, colourA >> 7, Pix2D.pixels, yB, 0);
                                xA += xStepAB;
                                xC += xStepAC;
                                colourA += colourStepAB;
                                colourC += colourStepAC;
                                yB += Pix2D.width;
                            }
                        }

                        this.gouraudRaster(xB >> 16, xA >> 16, colourB >> 7, colourA >> 7, Pix2D.pixels, yB, 0);
                        xA += xStepAB;
                        xB += xStepBC;
                        colourA += colourStepAB;
                        colourB += colourStepBC;
                        yB += Pix2D.width;
                    }
                }
            } else {
                xC = xB <<= 16;
                colourC = colourB <<= 15;

                if (yB < 0) {
                    xC -= xStepAB * yB;
                    xB -= xStepBC * yB;
                    colourC -= colourStepAB * yB;
                    colourB -= colourStepBC * yB;
                    yB = 0;
                }

                xA <<= 16;
                colourA <<= 15;

                if (yA < 0) {
                    xA -= xStepAC * yA;
                    colourA -= colourStepAC * yA;
                    yA = 0;
                }

                yC -= yA;
                yA -= yB;
                yB = this.scanline[yB];

                if (xStepAB < xStepBC) {
                    while (true) {
                        yA--;

                        if (yA < 0) {
                            while (true) {
                                yC--;

                                if (yC < 0) {
                                    return;
                                }

                                this.gouraudRaster(xA >> 16, xB >> 16, colourA >> 7, colourB >> 7, Pix2D.pixels, yB, 0);
                                xA += xStepAC;
                                xB += xStepBC;
                                colourA += colourStepAC;
                                colourB += colourStepBC;
                                yB += Pix2D.width;
                            }
                        }

                        this.gouraudRaster(xC >> 16, xB >> 16, colourC >> 7, colourB >> 7, Pix2D.pixels, yB, 0);
                        xC += xStepAB;
                        xB += xStepBC;
                        colourC += colourStepAB;
                        colourB += colourStepBC;
                        yB += Pix2D.width;
                    }
                } else {
                    while (true) {
                        yA--;

                        if (yA < 0) {
                            while (true) {
                                yC--;

                                if (yC < 0) {
                                    return;
                                }

                                this.gouraudRaster(xB >> 16, xA >> 16, colourB >> 7, colourA >> 7, Pix2D.pixels, yB, 0);
                                xA += xStepAC;
                                xB += xStepBC;
                                colourA += colourStepAC;
                                colourB += colourStepBC;
                                yB += Pix2D.width;
                            }
                        }

                        this.gouraudRaster(xB >> 16, xC >> 16, colourB >> 7, colourC >> 7, Pix2D.pixels, yB, 0);
                        xC += xStepAB;
                        xB += xStepBC;
                        colourC += colourStepAB;
                        colourB += colourStepBC;
                        yB += Pix2D.width;
                    }
                }
            }
        } else {
            if (yC >= Pix2D.clipMaxY) {
                return;
            }

            if (yA > Pix2D.clipMaxY) {
                yA = Pix2D.clipMaxY;
            }

            if (yB > Pix2D.clipMaxY) {
                yB = Pix2D.clipMaxY;
            }

            if (yA < yB) {
                xB = xC <<= 16;
                colourB = colourC <<= 15;

                if (yC < 0) {
                    xB -= xStepBC * yC;
                    xC -= xStepAC * yC;
                    colourB -= colourStepBC * yC;
                    colourC -= colourStepAC * yC;
                    yC = 0;
                }

                xA <<= 16;
                colourA <<= 15;

                if (yA < 0) {
                    xA -= xStepAB * yA;
                    colourA -= colourStepAB * yA;
                    yA = 0;
                }

                yB -= yA;
                yA -= yC;
                yC = this.scanline[yC];

                if (xStepBC < xStepAC) {
                    while (true) {
                        yA--;

                        if (yA < 0) {
                            while (true) {
                                yB--;

                                if (yB < 0) {
                                    return;
                                }

                                this.gouraudRaster(xB >> 16, xA >> 16, colourB >> 7, colourA >> 7, Pix2D.pixels, yC, 0);
                                xB += xStepBC;
                                xA += xStepAB;
                                colourB += colourStepBC;
                                colourA += colourStepAB;
                                yC += Pix2D.width;
                            }
                        }

                        this.gouraudRaster(xB >> 16, xC >> 16, colourB >> 7, colourC >> 7, Pix2D.pixels, yC, 0);
                        xB += xStepBC;
                        xC += xStepAC;
                        colourB += colourStepBC;
                        colourC += colourStepAC;
                        yC += Pix2D.width;
                    }
                } else {
                    while (true) {
                        yA--;

                        if (yA < 0) {
                            while (true) {
                                yB--;

                                if (yB < 0) {
                                    return;
                                }

                                this.gouraudRaster(xA >> 16, xB >> 16, colourA >> 7, colourB >> 7, Pix2D.pixels, yC, 0);
                                xB += xStepBC;
                                xA += xStepAB;
                                colourB += colourStepBC;
                                colourA += colourStepAB;
                                yC += Pix2D.width;
                            }
                        }

                        this.gouraudRaster(xC >> 16, xB >> 16, colourC >> 7, colourB >> 7, Pix2D.pixels, yC, 0);
                        xB += xStepBC;
                        xC += xStepAC;
                        colourB += colourStepBC;
                        colourC += colourStepAC;
                        yC += Pix2D.width;
                    }
                }
            } else {
                xA = xC <<= 16;
                colourA = colourC <<= 15;

                if (yC < 0) {
                    xA -= xStepBC * yC;
                    xC -= xStepAC * yC;
                    colourA -= colourStepBC * yC;
                    colourC -= colourStepAC * yC;
                    yC = 0;
                }

                xB <<= 16;
                colourB <<= 15;

                if (yB < 0) {
                    xB -= xStepAB * yB;
                    colourB -= colourStepAB * yB;
                    yB = 0;
                }

                yA -= yB;
                yB -= yC;
                yC = this.scanline[yC];

                if (xStepBC < xStepAC) {
                    while (true) {
                        yB--;

                        if (yB < 0) {
                            while (true) {
                                yA--;

                                if (yA < 0) {
                                    return;
                                }

                                this.gouraudRaster(xB >> 16, xC >> 16, colourB >> 7, colourC >> 7, Pix2D.pixels, yC, 0);
                                xB += xStepAB;
                                xC += xStepAC;
                                colourB += colourStepAB;
                                colourC += colourStepAC;
                                yC += Pix2D.width;
                            }
                        }

                        this.gouraudRaster(xA >> 16, xC >> 16, colourA >> 7, colourC >> 7, Pix2D.pixels, yC, 0);
                        xA += xStepBC;
                        xC += xStepAC;
                        colourA += colourStepBC;
                        colourC += colourStepAC;
                        yC += Pix2D.width;
                    }
                } else {
                    while (true) {
                        yB--;

                        if (yB < 0) {
                            while (true) {
                                yA--;

                                if (yA < 0) {
                                    return;
                                }

                                this.gouraudRaster(xC >> 16, xB >> 16, colourC >> 7, colourB >> 7, Pix2D.pixels, yC, 0);
                                xB += xStepAB;
                                xC += xStepAC;
                                colourB += colourStepAB;
                                colourC += colourStepAC;
                                yC += Pix2D.width;
                            }
                        }

                        this.gouraudRaster(xC >> 16, xA >> 16, colourC >> 7, colourA >> 7, Pix2D.pixels, yC, 0);
                        xA += xStepBC;
                        xC += xStepAC;
                        colourA += colourStepBC;
                        colourC += colourStepAC;
                        yC += Pix2D.width;
                    }
                }
            }
        }
    }

    private static gouraudRaster(
        xA: number, xB: number,
        colourA: number, colourB: number,
        dst: Int32Array, off: number, len: number
    ): void {
        let rgb: number;

        if (this.lowDetail) {
            let colourStep: number;

            if (this.hclip) {
                if (xB - xA > 3) {
                    colourStep = ((colourB - colourA) / (xB - xA)) | 0;
                } else {
                    colourStep = 0;
                }

                if (xB > Pix2D.sizeX) {
                    xB = Pix2D.sizeX;
                }

                if (xA < 0) {
                    colourA -= xA * colourStep;
                    xA = 0;
                }

                if (xA >= xB) {
                    return;
                }

                off += xA;
                len = (xB - xA) >> 2;
                colourStep <<= 2;
            } else if (xA < xB) {
                off += xA;
                len = (xB - xA) >> 2;

                if (len > 0) {
                    colourStep = ((colourB - colourA) * this.divTable[len]) >> 15;
                } else {
                    colourStep = 0;
                }
            } else {
                return;
            }

            if (this.trans === 0) {
                while (true) {
                    len--;

                    if (len < 0) {
                        len = (xB - xA) & 0x3;

                        if (len > 0) {
                            rgb = this.colourTable[colourA >> 8];

                            do {
                                dst[off++] = rgb;
                                len--;
                            } while (len > 0);

                            return;
                        }

                        break;
                    }

                    rgb = this.colourTable[colourA >> 8];
                    colourA += colourStep;
                    dst[off++] = rgb;
                    dst[off++] = rgb;
                    dst[off++] = rgb;
                    dst[off++] = rgb;
                }
            } else {
                const alpha: number = this.trans;
                const invAlpha: number = 256 - this.trans;

                while (true) {
                    len--;

                    if (len < 0) {
                        len = (xB - xA) & 0x3;

                        if (len > 0) {
                            rgb = this.colourTable[colourA >> 8];
                            rgb = ((((rgb & 0xff00ff) * invAlpha) >> 8) & 0xff00ff) + ((((rgb & 0xff00) * invAlpha) >> 8) & 0xff00);

                            do {
                                dst[off++] = rgb + ((((dst[off] & 0xff00ff) * alpha) >> 8) & 0xff00ff) + ((((dst[off] & 0xff00) * alpha) >> 8) & 0xff00);
                                len--;
                            } while (len > 0);
                        }

                        break;
                    }

                    rgb = this.colourTable[colourA >> 8];
                    colourA += colourStep;
                    rgb = ((((rgb & 0xff00ff) * invAlpha) >> 8) & 0xff00ff) + ((((rgb & 0xff00) * invAlpha) >> 8) & 0xff00);

                    dst[off++] = rgb + ((((dst[off] & 0xff00ff) * alpha) >> 8) & 0xff00ff) + ((((dst[off] & 0xff00) * alpha) >> 8) & 0xff00);
                    dst[off++] = rgb + ((((dst[off] & 0xff00ff) * alpha) >> 8) & 0xff00ff) + ((((dst[off] & 0xff00) * alpha) >> 8) & 0xff00);
                    dst[off++] = rgb + ((((dst[off] & 0xff00ff) * alpha) >> 8) & 0xff00ff) + ((((dst[off] & 0xff00) * alpha) >> 8) & 0xff00);
                    dst[off++] = rgb + ((((dst[off] & 0xff00ff) * alpha) >> 8) & 0xff00ff) + ((((dst[off] & 0xff00) * alpha) >> 8) & 0xff00);
                }
            }
        } else if (xA < xB) {
            const colourStep: number = ((colourB - colourA) / (xB - xA)) | 0;

            if (this.hclip) {
                if (xB > Pix2D.sizeX) {
                    xB = Pix2D.sizeX;
                }

                if (xA < 0) {
                    colourA -= xA * colourStep;
                    xA = 0;
                }

                if (xA >= xB) {
                    return;
                }
            }

            off += xA;
            len = xB - xA;

            if (this.trans === 0) {
                do {
                    dst[off++] = this.colourTable[colourA >> 8];
                    colourA += colourStep;
                    len--;
                } while (len > 0);
            } else {
                const alpha: number = this.trans;
                const invAlpha: number = 256 - this.trans;

                do {
                    rgb = this.colourTable[colourA >> 8];
                    colourA += colourStep;
                    rgb = ((((rgb & 0xff00ff) * invAlpha) >> 8) & 0xff00ff) + ((((rgb & 0xff00) * invAlpha) >> 8) & 0xff00);

                    dst[off++] = rgb + ((((dst[off] & 0xff00ff) * alpha) >> 8) & 0xff00ff) + ((((dst[off] & 0xff00) * alpha) >> 8) & 0xff00);
                    len--;
                } while (len > 0);
            }
        }
    }

    static flatTriangle(
        xA: number, xB: number, xC: number,
        yA: number, yB: number, yC: number,
        colour: number
    ): void {
        let xStepAB: number = 0;
        if (yB !== yA) {
            xStepAB = (((xB - xA) << 16) / (yB - yA)) | 0;
        }

        let xStepBC: number = 0;
        if (yC !== yB) {
            xStepBC = (((xC - xB) << 16) / (yC - yB)) | 0;
        }

        let xStepAC: number = 0;
        if (yC !== yA) {
            xStepAC = (((xA - xC) << 16) / (yA - yC)) | 0;
        }

        if (yA <= yB && yA <= yC) {
            if (yA >= Pix2D.clipMaxY) {
                return;
            }

            if (yB > Pix2D.clipMaxY) {
                yB = Pix2D.clipMaxY;
            }

            if (yC > Pix2D.clipMaxY) {
                yC = Pix2D.clipMaxY;
            }

            if (yB < yC) {
                xC = xA <<= 16;

                if (yA < 0) {
                    xC -= xStepAC * yA;
                    xA -= xStepAB * yA;
                    yA = 0;
                }

                xB <<= 16;

                if (yB < 0) {
                    xB -= xStepBC * yB;
                    yB = 0;
                }

                if ((yA !== yB && xStepAC < xStepAB) || (yA === yB && xStepAC > xStepBC)) {
                    yC -= yB;
                    yB -= yA;
                    yA = this.scanline[yA];

                    while (true) {
                        yB--;

                        if (yB < 0) {
                            while (true) {
                                yC--;

                                if (yC < 0) {
                                    return;
                                }

                                this.flatRaster(xC >> 16, xB >> 16, Pix2D.pixels, yA, colour);
                                xC += xStepAC;
                                xB += xStepBC;
                                yA += Pix2D.width;
                            }
                        }

                        this.flatRaster(xC >> 16, xA >> 16, Pix2D.pixels, yA, colour);
                        xC += xStepAC;
                        xA += xStepAB;
                        yA += Pix2D.width;
                    }
                } else {
                    yC -= yB;
                    yB -= yA;
                    yA = this.scanline[yA];

                    while (true) {
                        yB--;

                        if (yB < 0) {
                            while (true) {
                                yC--;

                                if (yC < 0) {
                                    return;
                                }

                                this.flatRaster(xB >> 16, xC >> 16, Pix2D.pixels, yA, colour);
                                xC += xStepAC;
                                xB += xStepBC;
                                yA += Pix2D.width;
                            }
                        }

                        this.flatRaster(xA >> 16, xC >> 16, Pix2D.pixels, yA, colour);
                        xC += xStepAC;
                        xA += xStepAB;
                        yA += Pix2D.width;
                    }
                }
            } else {
                xB = xA <<= 16;

                if (yA < 0) {
                    xB -= xStepAC * yA;
                    xA -= xStepAB * yA;
                    yA = 0;
                }

                xC <<= 16;

                if (yC < 0) {
                    xC -= xStepBC * yC;
                    yC = 0;
                }

                if ((yA !== yC && xStepAC < xStepAB) || (yA === yC && xStepBC > xStepAB)) {
                    yB -= yC;
                    yC -= yA;
                    yA = this.scanline[yA];

                    while (true) {
                        yC--;

                        if (yC < 0) {
                            while (true) {
                                yB--;

                                if (yB < 0) {
                                    return;
                                }

                                this.flatRaster(xC >> 16, xA >> 16, Pix2D.pixels, yA, colour);
                                xC += xStepBC;
                                xA += xStepAB;
                                yA += Pix2D.width;
                            }
                        }

                        this.flatRaster(xB >> 16, xA >> 16, Pix2D.pixels, yA, colour);
                        xB += xStepAC;
                        xA += xStepAB;
                        yA += Pix2D.width;
                    }
                } else {
                    yB -= yC;
                    yC -= yA;
                    yA = this.scanline[yA];

                    while (true) {
                        yC--;

                        if (yC < 0) {
                            while (true) {
                                yB--;

                                if (yB < 0) {
                                    return;
                                }

                                this.flatRaster(xA >> 16, xC >> 16, Pix2D.pixels, yA, colour);
                                xC += xStepBC;
                                xA += xStepAB;
                                yA += Pix2D.width;
                            }
                        }

                        this.flatRaster(xA >> 16, xB >> 16, Pix2D.pixels, yA, colour);
                        xB += xStepAC;
                        xA += xStepAB;
                        yA += Pix2D.width;
                    }
                }
            }
        } else if (yB <= yC) {
            if (yB >= Pix2D.clipMaxY) {
                return;
            }

            if (yC > Pix2D.clipMaxY) {
                yC = Pix2D.clipMaxY;
            }

            if (yA > Pix2D.clipMaxY) {
                yA = Pix2D.clipMaxY;
            }

            if (yC < yA) {
                xA = xB <<= 16;

                if (yB < 0) {
                    xA -= xStepAB * yB;
                    xB -= xStepBC * yB;
                    yB = 0;
                }

                xC <<= 16;

                if (yC < 0) {
                    xC -= xStepAC * yC;
                    yC = 0;
                }

                if ((yB !== yC && xStepAB < xStepBC) || (yB === yC && xStepAB > xStepAC)) {
                    yA -= yC;
                    yC -= yB;
                    yB = this.scanline[yB];

                    while (true) {
                        yC--;

                        if (yC < 0) {
                            while (true) {
                                yA--;

                                if (yA < 0) {
                                    return;
                                }

                                this.flatRaster(xA >> 16, xC >> 16, Pix2D.pixels, yB, colour);
                                xA += xStepAB;
                                xC += xStepAC;
                                yB += Pix2D.width;
                            }
                        }

                        this.flatRaster(xA >> 16, xB >> 16, Pix2D.pixels, yB, colour);
                        xA += xStepAB;
                        xB += xStepBC;
                        yB += Pix2D.width;
                    }
                } else {
                    yA -= yC;
                    yC -= yB;
                    yB = this.scanline[yB];

                    while (true) {
                        yC--;

                        if (yC < 0) {
                            while (true) {
                                yA--;

                                if (yA < 0) {
                                    return;
                                }

                                this.flatRaster(xC >> 16, xA >> 16, Pix2D.pixels, yB, colour);
                                xA += xStepAB;
                                xC += xStepAC;
                                yB += Pix2D.width;
                            }
                        }

                        this.flatRaster(xB >> 16, xA >> 16, Pix2D.pixels, yB, colour);
                        xA += xStepAB;
                        xB += xStepBC;
                        yB += Pix2D.width;
                    }
                }
            } else {
                xC = xB <<= 16;

                if (yB < 0) {
                    xC -= xStepAB * yB;
                    xB -= xStepBC * yB;
                    yB = 0;
                }

                xA <<= 16;

                if (yA < 0) {
                    xA -= xStepAC * yA;
                    yA = 0;
                }

                yC -= yA;
                yA -= yB;
                yB = this.scanline[yB];

                if (xStepAB < xStepBC) {
                    while (true) {
                        yA--;

                        if (yA < 0) {
                            while (true) {
                                yC--;

                                if (yC < 0) {
                                    return;
                                }

                                this.flatRaster(xA >> 16, xB >> 16, Pix2D.pixels, yB, colour);
                                xA += xStepAC;
                                xB += xStepBC;
                                yB += Pix2D.width;
                            }
                        }

                        this.flatRaster(xC >> 16, xB >> 16, Pix2D.pixels, yB, colour);
                        xC += xStepAB;
                        xB += xStepBC;
                        yB += Pix2D.width;
                    }
                } else {
                    while (true) {
                        yA--;

                        if (yA < 0) {
                            while (true) {
                                yC--;

                                if (yC < 0) {
                                    return;
                                }

                                this.flatRaster(xB >> 16, xA >> 16, Pix2D.pixels, yB, colour);
                                xA += xStepAC;
                                xB += xStepBC;
                                yB += Pix2D.width;
                            }
                        }

                        this.flatRaster(xB >> 16, xC >> 16, Pix2D.pixels, yB, colour);
                        xC += xStepAB;
                        xB += xStepBC;
                        yB += Pix2D.width;
                    }
                }
            }
        } else {
            if (yC >= Pix2D.clipMaxY) {
                return;
            }

            if (yA > Pix2D.clipMaxY) {
                yA = Pix2D.clipMaxY;
            }

            if (yB > Pix2D.clipMaxY) {
                yB = Pix2D.clipMaxY;
            }

            if (yA < yB) {
                xB = xC <<= 16;

                if (yC < 0) {
                    xB -= xStepBC * yC;
                    xC -= xStepAC * yC;
                    yC = 0;
                }

                xA <<= 16;

                if (yA < 0) {
                    xA -= xStepAB * yA;
                    yA = 0;
                }

                yB -= yA;
                yA -= yC;
                yC = this.scanline[yC];

                if (xStepBC < xStepAC) {
                    while (true) {
                        yA--;

                        if (yA < 0) {
                            while (true) {
                                yB--;

                                if (yB < 0) {
                                    return;
                                }

                                this.flatRaster(xB >> 16, xA >> 16, Pix2D.pixels, yC, colour);
                                xB += xStepBC;
                                xA += xStepAB;
                                yC += Pix2D.width;
                            }
                        }

                        this.flatRaster(xB >> 16, xC >> 16, Pix2D.pixels, yC, colour);
                        xB += xStepBC;
                        xC += xStepAC;
                        yC += Pix2D.width;
                    }
                } else {
                    while (true) {
                        yA--;

                        if (yA < 0) {
                            while (true) {
                                yB--;

                                if (yB < 0) {
                                    return;
                                }

                                this.flatRaster(xA >> 16, xB >> 16, Pix2D.pixels, yC, colour);
                                xB += xStepBC;
                                xA += xStepAB;
                                yC += Pix2D.width;
                            }
                        }

                        this.flatRaster(xC >> 16, xB >> 16, Pix2D.pixels, yC, colour);
                        xB += xStepBC;
                        xC += xStepAC;
                        yC += Pix2D.width;
                    }
                }
            } else {
                xA = xC <<= 16;

                if (yC < 0) {
                    xA -= xStepBC * yC;
                    xC -= xStepAC * yC;
                    yC = 0;
                }

                xB <<= 16;

                if (yB < 0) {
                    xB -= xStepAB * yB;
                    yB = 0;
                }

                yA -= yB;
                yB -= yC;
                yC = this.scanline[yC];

                if (xStepBC < xStepAC) {
                    while (true) {
                        yB--;

                        if (yB < 0) {
                            while (true) {
                                yA--;

                                if (yA < 0) {
                                    return;
                                }

                                this.flatRaster(xB >> 16, xC >> 16, Pix2D.pixels, yC, colour);
                                xB += xStepAB;
                                xC += xStepAC;
                                yC += Pix2D.width;
                            }
                        }

                        this.flatRaster(xA >> 16, xC >> 16, Pix2D.pixels, yC, colour);
                        xA += xStepBC;
                        xC += xStepAC;
                        yC += Pix2D.width;
                    }
                } else {
                    while (true) {
                        yB--;

                        if (yB < 0) {
                            while (true) {
                                yA--;

                                if (yA < 0) {
                                    return;
                                }

                                this.flatRaster(xC >> 16, xB >> 16, Pix2D.pixels, yC, colour);
                                xB += xStepAB;
                                xC += xStepAC;
                                yC += Pix2D.width;
                            }
                        }

                        this.flatRaster(xC >> 16, xA >> 16, Pix2D.pixels, yC, colour);
                        xA += xStepBC;
                        xC += xStepAC;
                        yC += Pix2D.width;
                    }
                }
            }
        }
    }

    private static flatRaster(
        xA: number, xB: number,
        dst: Int32Array, off: number,
        colour: number
    ): void {
        if (this.hclip) {
            if (xB > Pix2D.sizeX) {
                xB = Pix2D.sizeX;
            }

            if (xA < 0) {
                xA = 0;
            }
        }

        if (xA >= xB) {
            return;
        }

        off += xA;
        let len: number = (xB - xA) >> 2;

        if (this.trans === 0) {
            while (true) {
                len--;

                if (len < 0) {
                    len = (xB - xA) & 0x3;

                    while (true) {
                        len--;

                        if (len < 0) {
                            return;
                        }

                        dst[off++] = colour;
                    }
                }

                dst[off++] = colour;
                dst[off++] = colour;
                dst[off++] = colour;
                dst[off++] = colour;
            }
        } else {
            const alpha: number = this.trans;
            const invAlpha: number = 256 - this.trans;
            colour = ((((colour & 0xff00ff) * invAlpha) >> 8) & 0xff00ff) + ((((colour & 0xff00) * invAlpha) >> 8) & 0xff00);

            while (true) {
                len--;

                if (len < 0) {
                    len = (xB - xA) & 0x3;

                    while (true) {
                        len--;

                        if (len < 0) {
                            return;
                        }

                        dst[off++] = colour + ((((dst[off] & 0xff00ff) * alpha) >> 8) & 0xff00ff) + ((((dst[off] & 0xff00) * alpha) >> 8) & 0xff00);
                    }
                }

                dst[off++] = colour + ((((dst[off] & 0xff00ff) * alpha) >> 8) & 0xff00ff) + ((((dst[off] & 0xff00) * alpha) >> 8) & 0xff00);
                dst[off++] = colour + ((((dst[off] & 0xff00ff) * alpha) >> 8) & 0xff00ff) + ((((dst[off] & 0xff00) * alpha) >> 8) & 0xff00);
                dst[off++] = colour + ((((dst[off] & 0xff00ff) * alpha) >> 8) & 0xff00ff) + ((((dst[off] & 0xff00) * alpha) >> 8) & 0xff00);
                dst[off++] = colour + ((((dst[off] & 0xff00ff) * alpha) >> 8) & 0xff00ff) + ((((dst[off] & 0xff00) * alpha) >> 8) & 0xff00);
            }
        }
    }

    static textureTriangle(
        xA: number, xB: number, xC: number,
        yA: number, yB: number, yC: number,
        shadeA: number, shadeB: number, shadeC: number,
        originX: number, originY: number, originZ: number,
        txB: number, txC: number,
        tyB: number, tyC: number,
        tzB: number, tzC: number,
        texture: number
    ): void {
        const texels: Int32Array | null = this.getTexels(texture);
        this.opaque = !this.texTrans[texture];

        const verticalX: number = originX - txB;
        const verticalY: number = originY - tyB;
        const verticalZ: number = originZ - tzB;

        const horizontalX: number = txC - originX;
        const horizontalY: number = tyC - originY;
        const horizontalZ: number = tzC - originZ;

        let u: number = (horizontalX * originY - horizontalY * originX) << 14;
        const uStride: number = (horizontalY * originZ - horizontalZ * originY) << 8;
        const uStepVertical: number = (horizontalZ * originX - horizontalX * originZ) << 5;

        let v: number = (verticalX * originY - verticalY * originX) << 14;
        const vStride: number = (verticalY * originZ - verticalZ * originY) << 8;
        const vStepVertical: number = (verticalZ * originX - verticalX * originZ) << 5;

        let w: number = (verticalY * horizontalX - verticalX * horizontalY) << 14;
        const wStride: number = (verticalZ * horizontalY - verticalY * horizontalZ) << 8;
        const wStepVertical: number = (verticalX * horizontalZ - verticalZ * horizontalX) << 5;

        let xStepAB: number = 0;
        let shadeStepAB: number = 0;
        if (yB !== yA) {
            xStepAB = (((xB - xA) << 16) / (yB - yA)) | 0;
            shadeStepAB = (((shadeB - shadeA) << 16) / (yB - yA)) | 0;
        }

        let xStepBC: number = 0;
        let shadeStepBC: number = 0;
        if (yC !== yB) {
            xStepBC = (((xC - xB) << 16) / (yC - yB)) | 0;
            shadeStepBC = (((shadeC - shadeB) << 16) / (yC - yB)) | 0;
        }

        let xStepAC: number = 0;
        let shadeStepAC: number = 0;
        if (yC !== yA) {
            xStepAC = (((xA - xC) << 16) / (yA - yC)) | 0;
            shadeStepAC = (((shadeA - shadeC) << 16) / (yA - yC)) | 0;
        }

        if (yA <= yB && yA <= yC) {
            if (yA >= Pix2D.clipMaxY) {
                return;
            }

            if (yB > Pix2D.clipMaxY) {
                yB = Pix2D.clipMaxY;
            }

            if (yC > Pix2D.clipMaxY) {
                yC = Pix2D.clipMaxY;
            }

            if (yB < yC) {
                xC = xA <<= 16;
                shadeC = shadeA <<= 16;

                if (yA < 0) {
                    xC -= xStepAC * yA;
                    xA -= xStepAB * yA;
                    shadeC -= shadeStepAC * yA;
                    shadeA -= shadeStepAB * yA;
                    yA = 0;
                }

                xB <<= 16;
                shadeB <<= 16;

                if (yB < 0) {
                    xB -= xStepBC * yB;
                    shadeB -= shadeStepBC * yB;
                    yB = 0;
                }

                const dy: number = yA - this.originY;
                u += uStepVertical * dy;
                v += vStepVertical * dy;
                w += wStepVertical * dy;
                u |= 0;
                v |= 0;
                w |= 0;

                if ((yA !== yB && xStepAC < xStepAB) || (yA === yB && xStepAC > xStepBC)) {
                    yC -= yB;
                    yB -= yA;
                    yA = this.scanline[yA];

                    while (true) {
                        yB--;

                        if (yB < 0) {
                            while (true) {
                                yC--;

                                if (yC < 0) {
                                    return;
                                }

                                this.textureRaster(xC >> 16, xB >> 16, Pix2D.pixels, yA, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeC >> 8, shadeB >> 8);
                                xC += xStepAC;
                                xB += xStepBC;
                                shadeC += shadeStepAC;
                                shadeB += shadeStepBC;
                                yA += Pix2D.width;
                                u += uStepVertical;
                                v += vStepVertical;
                                w += wStepVertical;
                                u |= 0;
                                v |= 0;
                                w |= 0;
                            }
                        }

                        this.textureRaster(xC >> 16, xA >> 16, Pix2D.pixels, yA, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeC >> 8, shadeA >> 8);
                        xC += xStepAC;
                        xA += xStepAB;
                        shadeC += shadeStepAC;
                        shadeA += shadeStepAB;
                        yA += Pix2D.width;
                        u += uStepVertical;
                        v += vStepVertical;
                        w += wStepVertical;
                        u |= 0;
                        v |= 0;
                        w |= 0;
                    }
                } else {
                    yC -= yB;
                    yB -= yA;
                    yA = this.scanline[yA];

                    while (true) {
                        yB--;

                        if (yB < 0) {
                            while (true) {
                                yC--;

                                if (yC < 0) {
                                    return;
                                }

                                this.textureRaster(xB >> 16, xC >> 16, Pix2D.pixels, yA, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeB >> 8, shadeC >> 8);
                                xC += xStepAC;
                                xB += xStepBC;
                                shadeC += shadeStepAC;
                                shadeB += shadeStepBC;
                                yA += Pix2D.width;
                                u += uStepVertical;
                                v += vStepVertical;
                                w += wStepVertical;
                                u |= 0;
                                v |= 0;
                                w |= 0;
                            }
                        }

                        this.textureRaster(xA >> 16, xC >> 16, Pix2D.pixels, yA, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeA >> 8, shadeC >> 8);
                        xC += xStepAC;
                        xA += xStepAB;
                        shadeC += shadeStepAC;
                        shadeA += shadeStepAB;
                        yA += Pix2D.width;
                        u += uStepVertical;
                        v += vStepVertical;
                        w += wStepVertical;
                        u |= 0;
                        v |= 0;
                        w |= 0;
                    }
                }
            } else {
                xB = xA <<= 16;
                shadeB = shadeA <<= 16;

                if (yA < 0) {
                    xB -= xStepAC * yA;
                    xA -= xStepAB * yA;
                    shadeB -= shadeStepAC * yA;
                    shadeA -= shadeStepAB * yA;
                    yA = 0;
                }

                xC <<= 16;
                shadeC <<= 16;

                if (yC < 0) {
                    xC -= xStepBC * yC;
                    shadeC -= shadeStepBC * yC;
                    yC = 0;
                }

                const dy: number = yA - this.originY;
                u += uStepVertical * dy;
                v += vStepVertical * dy;
                w += wStepVertical * dy;
                u |= 0;
                v |= 0;
                w |= 0;

                if ((yA === yC || xStepAC >= xStepAB) && (yA !== yC || xStepBC <= xStepAB)) {
                    yB -= yC;
                    yC -= yA;
                    yA = this.scanline[yA];

                    while (true) {
                        yC--;

                        if (yC < 0) {
                            while (true) {
                                yB--;

                                if (yB < 0) {
                                    return;
                                }

                                this.textureRaster(xA >> 16, xC >> 16, Pix2D.pixels, yA, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeA >> 8, shadeC >> 8);
                                xC += xStepBC;
                                xA += xStepAB;
                                shadeC += shadeStepBC;
                                shadeA += shadeStepAB;
                                yA += Pix2D.width;
                                u += uStepVertical;
                                v += vStepVertical;
                                w += wStepVertical;
                                u |= 0;
                                v |= 0;
                                w |= 0;
                            }
                        }

                        this.textureRaster(xA >> 16, xB >> 16, Pix2D.pixels, yA, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeA >> 8, shadeB >> 8);
                        xB += xStepAC;
                        xA += xStepAB;
                        shadeB += shadeStepAC;
                        shadeA += shadeStepAB;
                        yA += Pix2D.width;
                        u += uStepVertical;
                        v += vStepVertical;
                        w += wStepVertical;
                        u |= 0;
                        v |= 0;
                        w |= 0;
                    }
                } else {
                    yB -= yC;
                    yC -= yA;
                    yA = this.scanline[yA];

                    while (true) {
                        yC--;

                        if (yC < 0) {
                            while (true) {
                                yB--;

                                if (yB < 0) {
                                    return;
                                }

                                this.textureRaster(xC >> 16, xA >> 16, Pix2D.pixels, yA, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeC >> 8, shadeA >> 8);
                                xC += xStepBC;
                                xA += xStepAB;
                                shadeC += shadeStepBC;
                                shadeA += shadeStepAB;
                                yA += Pix2D.width;
                                u += uStepVertical;
                                v += vStepVertical;
                                w += wStepVertical;
                                u |= 0;
                                v |= 0;
                                w |= 0;
                            }
                        }

                        this.textureRaster(xB >> 16, xA >> 16, Pix2D.pixels, yA, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeB >> 8, shadeA >> 8);
                        xB += xStepAC;
                        xA += xStepAB;
                        shadeB += shadeStepAC;
                        shadeA += shadeStepAB;
                        yA += Pix2D.width;
                        u += uStepVertical;
                        v += vStepVertical;
                        w += wStepVertical;
                        u |= 0;
                        v |= 0;
                        w |= 0;
                    }
                }
            }
        } else if (yB <= yC) {
            if (yB >= Pix2D.clipMaxY) {
                return;
            }

            if (yC > Pix2D.clipMaxY) {
                yC = Pix2D.clipMaxY;
            }

            if (yA > Pix2D.clipMaxY) {
                yA = Pix2D.clipMaxY;
            }

            if (yC < yA) {
                xA = xB <<= 16;
                shadeA = shadeB <<= 16;

                if (yB < 0) {
                    xA -= xStepAB * yB;
                    xB -= xStepBC * yB;
                    shadeA -= shadeStepAB * yB;
                    shadeB -= shadeStepBC * yB;
                    yB = 0;
                }

                xC <<= 16;
                shadeC <<= 16;

                if (yC < 0) {
                    xC -= xStepAC * yC;
                    shadeC -= shadeStepAC * yC;
                    yC = 0;
                }

                const dy: number = yB - this.originY;
                u += uStepVertical * dy;
                v += vStepVertical * dy;
                w += wStepVertical * dy;
                u |= 0;
                v |= 0;
                w |= 0;

                if ((yB !== yC && xStepAB < xStepBC) || (yB === yC && xStepAB > xStepAC)) {
                    yA -= yC;
                    yC -= yB;
                    yB = this.scanline[yB];

                    while (true) {
                        yC--;

                        if (yC < 0) {
                            while (true) {
                                yA--;

                                if (yA < 0) {
                                    return;
                                }

                                this.textureRaster(xA >> 16, xC >> 16, Pix2D.pixels, yB, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeA >> 8, shadeC >> 8);
                                xA += xStepAB;
                                xC += xStepAC;
                                shadeA += shadeStepAB;
                                shadeC += shadeStepAC;
                                yB += Pix2D.width;
                                u += uStepVertical;
                                v += vStepVertical;
                                w += wStepVertical;
                                u |= 0;
                                v |= 0;
                                w |= 0;
                            }
                        }

                        this.textureRaster(xA >> 16, xB >> 16, Pix2D.pixels, yB, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeA >> 8, shadeB >> 8);
                        xA += xStepAB;
                        xB += xStepBC;
                        shadeA += shadeStepAB;
                        shadeB += shadeStepBC;
                        yB += Pix2D.width;
                        u += uStepVertical;
                        v += vStepVertical;
                        w += wStepVertical;
                        u |= 0;
                        v |= 0;
                        w |= 0;
                    }
                } else {
                    yA -= yC;
                    yC -= yB;
                    yB = this.scanline[yB];

                    while (true) {
                        yC--;

                        if (yC < 0) {
                            while (true) {
                                yA--;

                                if (yA < 0) {
                                    return;
                                }

                                this.textureRaster(xC >> 16, xA >> 16, Pix2D.pixels, yB, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeC >> 8, shadeA >> 8);
                                xA += xStepAB;
                                xC += xStepAC;
                                shadeA += shadeStepAB;
                                shadeC += shadeStepAC;
                                yB += Pix2D.width;
                                u += uStepVertical;
                                v += vStepVertical;
                                w += wStepVertical;
                                u |= 0;
                                v |= 0;
                                w |= 0;
                            }
                        }

                        this.textureRaster(xB >> 16, xA >> 16, Pix2D.pixels, yB, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeB >> 8, shadeA >> 8);
                        xA += xStepAB;
                        xB += xStepBC;
                        shadeA += shadeStepAB;
                        shadeB += shadeStepBC;
                        yB += Pix2D.width;
                        u += uStepVertical;
                        v += vStepVertical;
                        w += wStepVertical;
                        u |= 0;
                        v |= 0;
                        w |= 0;
                    }
                }
            } else {
                xC = xB <<= 16;
                shadeC = shadeB <<= 16;

                if (yB < 0) {
                    xC -= xStepAB * yB;
                    xB -= xStepBC * yB;
                    shadeC -= shadeStepAB * yB;
                    shadeB -= shadeStepBC * yB;
                    yB = 0;
                }

                xA <<= 16;
                shadeA <<= 16;

                if (yA < 0) {
                    xA -= xStepAC * yA;
                    shadeA -= shadeStepAC * yA;
                    yA = 0;
                }

                const dy: number = yB - this.originY;
                u += uStepVertical * dy;
                v += vStepVertical * dy;
                w += wStepVertical * dy;
                u |= 0;
                v |= 0;
                w |= 0;

                yC -= yA;
                yA -= yB;
                yB = this.scanline[yB];

                if (xStepAB < xStepBC) {
                    while (true) {
                        yA--;

                        if (yA < 0) {
                            while (true) {
                                yC--;

                                if (yC < 0) {
                                    return;
                                }

                                this.textureRaster(xA >> 16, xB >> 16, Pix2D.pixels, yB, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeA >> 8, shadeB >> 8);
                                xA += xStepAC;
                                xB += xStepBC;
                                shadeA += shadeStepAC;
                                shadeB += shadeStepBC;
                                yB += Pix2D.width;
                                u += uStepVertical;
                                v += vStepVertical;
                                w += wStepVertical;
                                u |= 0;
                                v |= 0;
                                w |= 0;
                            }
                        }

                        this.textureRaster(xC >> 16, xB >> 16, Pix2D.pixels, yB, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeC >> 8, shadeB >> 8);
                        xC += xStepAB;
                        xB += xStepBC;
                        shadeC += shadeStepAB;
                        shadeB += shadeStepBC;
                        yB += Pix2D.width;
                        u += uStepVertical;
                        v += vStepVertical;
                        w += wStepVertical;
                        u |= 0;
                        v |= 0;
                        w |= 0;
                    }
                } else {
                    while (true) {
                        yA--;

                        if (yA < 0) {
                            while (true) {
                                yC--;

                                if (yC < 0) {
                                    return;
                                }

                                this.textureRaster(xB >> 16, xA >> 16, Pix2D.pixels, yB, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeB >> 8, shadeA >> 8);
                                xA += xStepAC;
                                xB += xStepBC;
                                shadeA += shadeStepAC;
                                shadeB += shadeStepBC;
                                yB += Pix2D.width;
                                u += uStepVertical;
                                v += vStepVertical;
                                w += wStepVertical;
                                u |= 0;
                                v |= 0;
                                w |= 0;
                            }
                        }

                        this.textureRaster(xB >> 16, xC >> 16, Pix2D.pixels, yB, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeB >> 8, shadeC >> 8);
                        xC += xStepAB;
                        xB += xStepBC;
                        shadeC += shadeStepAB;
                        shadeB += shadeStepBC;
                        yB += Pix2D.width;
                        u += uStepVertical;
                        v += vStepVertical;
                        w += wStepVertical;
                        u |= 0;
                        v |= 0;
                        w |= 0;
                    }
                }
            }
        } else {
            if (yC >= Pix2D.clipMaxY) {
                return;
            }

            if (yA > Pix2D.clipMaxY) {
                yA = Pix2D.clipMaxY;
            }

            if (yB > Pix2D.clipMaxY) {
                yB = Pix2D.clipMaxY;
            }

            if (yA < yB) {
                xB = xC <<= 16;
                shadeB = shadeC <<= 16;

                if (yC < 0) {
                    xB -= xStepBC * yC;
                    xC -= xStepAC * yC;
                    shadeB -= shadeStepBC * yC;
                    shadeC -= shadeStepAC * yC;
                    yC = 0;
                }

                xA <<= 16;
                shadeA <<= 16;

                if (yA < 0) {
                    xA -= xStepAB * yA;
                    shadeA -= shadeStepAB * yA;
                    yA = 0;
                }

                const dy: number = yC - this.originY;
                u += uStepVertical * dy;
                v += vStepVertical * dy;
                w += wStepVertical * dy;
                u |= 0;
                v |= 0;
                w |= 0;

                yB -= yA;
                yA -= yC;
                yC = this.scanline[yC];

                if (xStepBC < xStepAC) {
                    while (true) {
                        yA--;

                        if (yA < 0) {
                            while (true) {
                                yB--;

                                if (yB < 0) {
                                    return;
                                }

                                this.textureRaster(xB >> 16, xA >> 16, Pix2D.pixels, yC, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeB >> 8, shadeA >> 8);
                                xB += xStepBC;
                                xA += xStepAB;
                                shadeB += shadeStepBC;
                                shadeA += shadeStepAB;
                                yC += Pix2D.width;
                                u += uStepVertical;
                                v += vStepVertical;
                                w += wStepVertical;
                                u |= 0;
                                v |= 0;
                                w |= 0;
                            }
                        }

                        this.textureRaster(xB >> 16, xC >> 16, Pix2D.pixels, yC, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeB >> 8, shadeC >> 8);
                        xB += xStepBC;
                        xC += xStepAC;
                        shadeB += shadeStepBC;
                        shadeC += shadeStepAC;
                        yC += Pix2D.width;
                        u += uStepVertical;
                        v += vStepVertical;
                        w += wStepVertical;
                        u |= 0;
                        v |= 0;
                        w |= 0;
                    }
                } else {
                    while (true) {
                        yA--;

                        if (yA < 0) {
                            while (true) {
                                yB--;

                                if (yB < 0) {
                                    return;
                                }

                                this.textureRaster(xA >> 16, xB >> 16, Pix2D.pixels, yC, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeA >> 8, shadeB >> 8);
                                xB += xStepBC;
                                xA += xStepAB;
                                shadeB += shadeStepBC;
                                shadeA += shadeStepAB;
                                yC += Pix2D.width;
                                u += uStepVertical;
                                v += vStepVertical;
                                w += wStepVertical;
                                u |= 0;
                                v |= 0;
                                w |= 0;
                            }
                        }

                        this.textureRaster(xC >> 16, xB >> 16, Pix2D.pixels, yC, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeC >> 8, shadeB >> 8);
                        xB += xStepBC;
                        xC += xStepAC;
                        shadeB += shadeStepBC;
                        shadeC += shadeStepAC;
                        yC += Pix2D.width;
                        u += uStepVertical;
                        v += vStepVertical;
                        w += wStepVertical;
                        u |= 0;
                        v |= 0;
                        w |= 0;
                    }
                }
            } else {
                xA = xC <<= 16;
                shadeA = shadeC <<= 16;

                if (yC < 0) {
                    xA -= xStepBC * yC;
                    xC -= xStepAC * yC;
                    shadeA -= shadeStepBC * yC;
                    shadeC -= shadeStepAC * yC;
                    yC = 0;
                }

                xB <<= 16;
                shadeB <<= 16;

                if (yB < 0) {
                    xB -= xStepAB * yB;
                    shadeB -= shadeStepAB * yB;
                    yB = 0;
                }

                const dy: number = yC - this.originY;
                u += uStepVertical * dy;
                v += vStepVertical * dy;
                w += wStepVertical * dy;
                u |= 0;
                v |= 0;
                w |= 0;

                yA -= yB;
                yB -= yC;
                yC = this.scanline[yC];

                if (xStepBC < xStepAC) {
                    while (true) {
                        yB--;

                        if (yB < 0) {
                            while (true) {
                                yA--;

                                if (yA < 0) {
                                    return;
                                }

                                this.textureRaster(xB >> 16, xC >> 16, Pix2D.pixels, yC, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeB >> 8, shadeC >> 8);
                                xB += xStepAB;
                                xC += xStepAC;
                                shadeB += shadeStepAB;
                                shadeC += shadeStepAC;
                                yC += Pix2D.width;
                                u += uStepVertical;
                                v += vStepVertical;
                                w += wStepVertical;
                                u |= 0;
                                v |= 0;
                                w |= 0;
                            }
                        }

                        this.textureRaster(xA >> 16, xC >> 16, Pix2D.pixels, yC, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeA >> 8, shadeC >> 8);
                        xA += xStepBC;
                        xC += xStepAC;
                        shadeA += shadeStepBC;
                        shadeC += shadeStepAC;
                        yC += Pix2D.width;
                        u += uStepVertical;
                        v += vStepVertical;
                        w += wStepVertical;
                        u |= 0;
                        v |= 0;
                        w |= 0;
                    }
                } else {
                    while (true) {
                        yB--;

                        if (yB < 0) {
                            while (true) {
                                yA--;

                                if (yA < 0) {
                                    return;
                                }

                                this.textureRaster(xC >> 16, xB >> 16, Pix2D.pixels, yC, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeC >> 8, shadeB >> 8);
                                xB += xStepAB;
                                xC += xStepAC;
                                shadeB += shadeStepAB;
                                shadeC += shadeStepAC;
                                yC += Pix2D.width;
                                u += uStepVertical;
                                v += vStepVertical;
                                w += wStepVertical;
                                u |= 0;
                                v |= 0;
                                w |= 0;
                            }
                        }

                        this.textureRaster(xC >> 16, xA >> 16, Pix2D.pixels, yC, texels, 0, 0, u, v, w, uStride, vStride, wStride, shadeC >> 8, shadeA >> 8);
                        xA += xStepBC;
                        xC += xStepAC;
                        shadeA += shadeStepBC;
                        shadeC += shadeStepAC;
                        yC += Pix2D.width;
                        u += uStepVertical;
                        v += vStepVertical;
                        w += wStepVertical;
                        u |= 0;
                        v |= 0;
                        w |= 0;
                    }
                }
            }
        }
    }

    private static textureRaster(
        xA: number, xB: number,
        dst: Int32Array, off: number,
        texels: Int32Array | null,
        curU: number, curV: number,
        u: number, v: number, w: number,
        uStride: number, vStride: number, wStride: number,
        shadeA: number, shadeB: number
    ): void {
        if (!texels) {
            return;
        }

        if (xA >= xB) {
            return;
        }

        let shadeStrides: number;
        let strides: number;
        if (this.hclip) {
            shadeStrides = ((shadeB - shadeA) / (xB - xA)) | 0;

            if (xB > Pix2D.sizeX) {
                xB = Pix2D.sizeX;
            }

            if (xA < 0) {
                shadeA -= xA * shadeStrides;
                xA = 0;
            }

            if (xA >= xB) {
                return;
            }

            strides = (xB - xA) >> 3;
            shadeStrides <<= 12;
        } else {
            if (xB - xA > 7) {
                strides = (xB - xA) >> 3;
                shadeStrides = ((shadeB - shadeA) * this.divTable[strides]) >> 6;
            } else {
                strides = 0;
                shadeStrides = 0;
            }
        }

        shadeA <<= 9;
        off += xA;

        let nextU: number;
        let nextV: number;
        let curW: number;
        let dx: number;
        let stepU: number;
        let stepV: number;
        let shadeShift: number;

        if (this.lowMem) {
            nextU = 0;
            nextV = 0;

            dx = xA - this.originX;
            u = u + (uStride >> 3) * dx;
            v = v + (vStride >> 3) * dx;
            w = w + (wStride >> 3) * dx;
            u |= 0;
            v |= 0;
            w |= 0;

            curW = w >> 12;

            if (curW !== 0) {
                curU = (u / curW) | 0;
                curV = (v / curW) | 0;

                if (curU < 0) {
                    curU = 0;
                } else if (curU > 4032) {
                    curU = 4032;
                }
            }

            u = u + uStride;
            v = v + vStride;
            w = w + wStride;
            u |= 0;
            v |= 0;
            w |= 0;

            curW = w >> 12;

            if (curW !== 0) {
                nextU = (u / curW) | 0;
                nextV = (v / curW) | 0;

                if (nextU < 7) {
                    nextU = 7;
                } else if (nextU > 4032) {
                    nextU = 4032;
                }
            }

            stepU = (nextU - curU) >> 3;
            stepV = (nextV - curV) >> 3;
            curU += (shadeA >> 3) & 0xc0000;
            shadeShift = shadeA >> 23;

            if (this.opaque) {
                while (strides-- > 0) {
                    dst[off++] = texels[(curV & 0xfc0) + (curU >> 6)] >>> shadeShift;
                    curU += stepU;
                    curV += stepV;

                    dst[off++] = texels[(curV & 0xfc0) + (curU >> 6)] >>> shadeShift;
                    curU += stepU;
                    curV += stepV;

                    dst[off++] = texels[(curV & 0xfc0) + (curU >> 6)] >>> shadeShift;
                    curU += stepU;
                    curV += stepV;

                    dst[off++] = texels[(curV & 0xfc0) + (curU >> 6)] >>> shadeShift;
                    curU += stepU;
                    curV += stepV;

                    dst[off++] = texels[(curV & 0xfc0) + (curU >> 6)] >>> shadeShift;
                    curU += stepU;
                    curV += stepV;

                    dst[off++] = texels[(curV & 0xfc0) + (curU >> 6)] >>> shadeShift;
                    curU += stepU;
                    curV += stepV;

                    dst[off++] = texels[(curV & 0xfc0) + (curU >> 6)] >>> shadeShift;
                    curU += stepU;
                    curV += stepV;

                    dst[off++] = texels[(curV & 0xfc0) + (curU >> 6)] >>> shadeShift;
                    curU = nextU;
                    curV = nextV;

                    u += uStride;
                    v += vStride;
                    w += wStride;
                    u |= 0;
                    v |= 0;
                    w |= 0;

                    curW = w >> 12;

                    if (curW !== 0) {
                        nextU = (u / curW) | 0;
                        nextV = (v / curW) | 0;

                        if (nextU < 7) {
                            nextU = 7;
                        } else if (nextU > 4032) {
                            nextU = 4032;
                        }
                    }

                    stepU = (nextU - curU) >> 3;
                    stepV = (nextV - curV) >> 3;
                    shadeA += shadeStrides;
                    curU += (shadeA >> 3) & 0xc0000;
                    shadeShift = shadeA >> 23;
                }

                strides = (xB - xA) & 0x7;

                while (strides-- > 0) {
                    dst[off++] = texels[(curV & 0xfc0) + (curU >> 6)] >>> shadeShift;
                    curU += stepU;
                    curV += stepV;
                }
            } else {
                while (strides-- > 0) {
                    let rgb: number;
                    if ((rgb = texels[(curV & 0xfc0) + (curU >> 6)] >>> shadeShift) !== 0) {
                        dst[off] = rgb;
                    }
                    off++;
                    curU += stepU;
                    curV += stepV;

                    if ((rgb = texels[(curV & 0xfc0) + (curU >> 6)] >>> shadeShift) !== 0) {
                        dst[off] = rgb;
                    }
                    off++;
                    curU += stepU;
                    curV += stepV;

                    if ((rgb = texels[(curV & 0xfc0) + (curU >> 6)] >>> shadeShift) !== 0) {
                        dst[off] = rgb;
                    }
                    off++;
                    curU += stepU;
                    curV += stepV;

                    if ((rgb = texels[(curV & 0xfc0) + (curU >> 6)] >>> shadeShift) !== 0) {
                        dst[off] = rgb;
                    }
                    off++;
                    curU += stepU;
                    curV += stepV;

                    if ((rgb = texels[(curV & 0xfc0) + (curU >> 6)] >>> shadeShift) !== 0) {
                        dst[off] = rgb;
                    }
                    off++;
                    curU += stepU;
                    curV += stepV;

                    if ((rgb = texels[(curV & 0xfc0) + (curU >> 6)] >>> shadeShift) !== 0) {
                        dst[off] = rgb;
                    }
                    off++;
                    curU += stepU;
                    curV += stepV;

                    if ((rgb = texels[(curV & 0xfc0) + (curU >> 6)] >>> shadeShift) !== 0) {
                        dst[off] = rgb;
                    }
                    off++;
                    curU += stepU;
                    curV += stepV;

                    if ((rgb = texels[(curV & 0xfc0) + (curU >> 6)] >>> shadeShift) !== 0) {
                        dst[off] = rgb;
                    }
                    off++;
                    curU = nextU;
                    curV = nextV;

                    u += uStride;
                    v += vStride;
                    w += wStride;
                    u |= 0;
                    v |= 0;
                    w |= 0;

                    curW = w >> 12;

                    if (curW !== 0) {
                        nextU = (u / curW) | 0;
                        nextV = (v / curW) | 0;

                        if (nextU < 7) {
                            nextU = 7;
                        } else if (nextU > 4032) {
                            nextU = 4032;
                        }
                    }

                    stepU = (nextU - curU) >> 3;
                    stepV = (nextV - curV) >> 3;
                    shadeA += shadeStrides;
                    curU += (shadeA >> 3) & 0xc0000;
                    shadeShift = shadeA >> 23;
                }

                strides = (xB - xA) & 0x7;

                while (strides-- > 0) {
                    let rgb: number;
                    if ((rgb = texels[(curV & 0xfc0) + (curU >> 6)] >>> shadeShift) !== 0) {
                        dst[off] = rgb;
                    }
                    off++;
                    curU += stepU;
                    curV += stepV;
                }
            }
        } else {
            nextU = 0;
            nextV = 0;

            dx = xA - this.originX;
            u = u + (uStride >> 3) * dx;
            v = v + (vStride >> 3) * dx;
            w = w + (wStride >> 3) * dx;
            u |= 0;
            v |= 0;
            w |= 0;

            curW = w >> 14;

            if (curW !== 0) {
                curU = (u / curW) | 0;
                curV = (v / curW) | 0;

                if (curU < 0) {
                    curU = 0;
                } else if (curU > 16256) {
                    curU = 16256;
                }
            }

            u = u + uStride;
            v = v + vStride;
            w = w + wStride;
            u |= 0;
            v |= 0;
            w |= 0;

            curW = w >> 14;

            if (curW !== 0) {
                nextU = (u / curW) | 0;
                nextV = (v / curW) | 0;

                if (nextU < 7) {
                    nextU = 7;
                } else if (nextU > 16256) {
                    nextU = 16256;
                }
            }

            stepU = (nextU - curU) >> 3;
            stepV = (nextV - curV) >> 3;
            curU += shadeA & 0x600000;
            shadeShift = shadeA >> 23;

            if (this.opaque) {
                while (strides-- > 0) {
                    dst[off++] = texels[(curV & 0x3f80) + (curU >> 7)] >>> shadeShift;
                    curU += stepU;
                    curV += stepV;

                    dst[off++] = texels[(curV & 0x3f80) + (curU >> 7)] >>> shadeShift;
                    curU += stepU;
                    curV += stepV;

                    dst[off++] = texels[(curV & 0x3f80) + (curU >> 7)] >>> shadeShift;
                    curU += stepU;
                    curV += stepV;

                    dst[off++] = texels[(curV & 0x3f80) + (curU >> 7)] >>> shadeShift;
                    curU += stepU;
                    curV += stepV;

                    dst[off++] = texels[(curV & 0x3f80) + (curU >> 7)] >>> shadeShift;
                    curU += stepU;
                    curV += stepV;

                    dst[off++] = texels[(curV & 0x3f80) + (curU >> 7)] >>> shadeShift;
                    curU += stepU;
                    curV += stepV;

                    dst[off++] = texels[(curV & 0x3f80) + (curU >> 7)] >>> shadeShift;
                    curU += stepU;
                    curV += stepV;

                    dst[off++] = texels[(curV & 0x3f80) + (curU >> 7)] >>> shadeShift;
                    curU = nextU;
                    curV = nextV;

                    u += uStride;
                    v += vStride;
                    w += wStride;
                    u |= 0;
                    v |= 0;
                    w |= 0;

                    curW = w >> 14;

                    if (curW !== 0) {
                        nextU = (u / curW) | 0;
                        nextV = (v / curW) | 0;

                        if (nextU < 7) {
                            nextU = 7;
                        } else if (nextU > 16256) {
                            nextU = 16256;
                        }
                    }

                    stepU = (nextU - curU) >> 3;
                    stepV = (nextV - curV) >> 3;
                    shadeA += shadeStrides;
                    curU += shadeA & 0x600000;
                    shadeShift = shadeA >> 23;
                }

                strides = (xB - xA) & 0x7;

                while (strides-- > 0) {
                    dst[off++] = texels[(curV & 0x3f80) + (curU >> 7)] >>> shadeShift;
                    curU += stepU;
                    curV += stepV;
                }
            } else {
                while (strides-- > 0 && texels) {
                    let rgb: number;
                    if ((rgb = texels[(curV & 0x3f80) + (curU >> 7)] >>> shadeShift) !== 0) {
                        dst[off] = rgb;
                    }
                    off++;
                    curU += stepU;
                    curV += stepV;

                    if ((rgb = texels[(curV & 0x3f80) + (curU >> 7)] >>> shadeShift) !== 0) {
                        dst[off] = rgb;
                    }
                    off++;
                    curU += stepU;
                    curV += stepV;

                    if ((rgb = texels[(curV & 0x3f80) + (curU >> 7)] >>> shadeShift) !== 0) {
                        dst[off] = rgb;
                    }
                    off++;
                    curU += stepU;
                    curV += stepV;

                    if ((rgb = texels[(curV & 0x3f80) + (curU >> 7)] >>> shadeShift) !== 0) {
                        dst[off] = rgb;
                    }
                    off++;
                    curU += stepU;
                    curV += stepV;

                    if ((rgb = texels[(curV & 0x3f80) + (curU >> 7)] >>> shadeShift) !== 0) {
                        dst[off] = rgb;
                    }
                    off++;
                    curU += stepU;
                    curV += stepV;

                    if ((rgb = texels[(curV & 0x3f80) + (curU >> 7)] >>> shadeShift) !== 0) {
                        dst[off] = rgb;
                    }
                    off++;
                    curU += stepU;
                    curV += stepV;

                    if ((rgb = texels[(curV & 0x3f80) + (curU >> 7)] >>> shadeShift) !== 0) {
                        dst[off] = rgb;
                    }
                    off++;
                    curU += stepU;
                    curV += stepV;

                    if ((rgb = texels[(curV & 0x3f80) + (curU >> 7)] >>> shadeShift) !== 0) {
                        dst[off] = rgb;
                    }
                    off++;
                    curU = nextU;
                    curV = nextV;

                    u += uStride;
                    v += vStride;
                    w += wStride;
                    u |= 0;
                    v |= 0;
                    w |= 0;

                    curW = w >> 14;

                    if (curW !== 0) {
                        nextU = (u / curW) | 0;
                        nextV = (v / curW) | 0;

                        if (nextU < 7) {
                            nextU = 7;
                        } else if (nextU > 16256) {
                            nextU = 16256;
                        }
                    }

                    stepU = (nextU - curU) >> 3;
                    stepV = (nextV - curV) >> 3;
                    shadeA += shadeStrides;
                    curU += shadeA & 0x600000;
                    shadeShift = shadeA >> 23;
                }

                strides = (xB - xA) & 0x7;

                while (strides-- > 0 && texels) {
                    let rgb: number;
                    if ((rgb = texels[(curV & 0x3f80) + (curU >> 7)] >>> shadeShift) !== 0) {
                        dst[off] = rgb;
                    }
                    off++;
                    curU += stepU;
                    curV += stepV;
                }
            }
        }
    }
}
