import { Client } from '#/client/Client.js';

import { Colour } from '#/graphics/Colour.js';
import Pix8 from '#/graphics/Pix8.js';
import Pix32 from '#/graphics/Pix32.js';
import PixMap from '#/graphics/PixMap.js';

const FLAME_WIDTH = 128;
const FLAME_HEIGHT = 256;
const TITLE_FLAME_PIXELS = 33920;

export default class TitleFlames {
    private readonly runes: Pix8[];

    active: boolean = false;
    private titleLeft: PixMap | null = null;
    private titleRight: PixMap | null = null;
    private flameLeft: Pix32 | null = null;
    private flameRight: Pix32 | null = null;
    private flameBuffer1: Int32Array | null = null;
    private flameBuffer0: Int32Array | null = null;
    private flameBuffer3: Int32Array | null = null;
    private flameBuffer2: Int32Array | null = null;
    private flameGradient: Int32Array | null = null;
    private flameGradient0: Int32Array | null = null;
    private flameGradient1: Int32Array | null = null;
    private flameGradient2: Int32Array | null = null;
    private flameLineOffset: Int32Array = new Int32Array(FLAME_HEIGHT);
    cycle: number = 0;
    coolingCycle: number = 0;
    private flameGradientCycle0: number = 0;
    private flameGradientCycle1: number = 0;
    private flamesInterval: ReturnType<typeof setInterval> | null = null;

    constructor(runes: Pix8[]) {
        this.runes = runes;
    }

    setupFire(titleLeft: PixMap, titleRight: PixMap): void {
        this.titleLeft = titleLeft;
        this.titleRight = titleRight;
        this.flameLeft = new Pix32(FLAME_WIDTH, 265);
        this.flameRight = new Pix32(FLAME_WIDTH, 265);

        this.flameLeft.data.set(titleLeft.data.subarray(0, TITLE_FLAME_PIXELS));
        this.flameRight.data.set(titleRight.data.subarray(0, TITLE_FLAME_PIXELS));

        this.flameGradient0 = new Int32Array(256);
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient0[index] = index * 262144;
        }
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient0[index + 64] = index * 1024 + Colour.RED;
        }
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient0[index + 128] = index * 4 + Colour.YELLOW;
        }
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient0[index + 192] = Colour.WHITE;
        }

        this.flameGradient1 = new Int32Array(256);
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient1[index] = index * 1024;
        }
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient1[index + 64] = index * 4 + Colour.GREEN;
        }
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient1[index + 128] = index * 262144 + Colour.CYAN;
        }
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient1[index + 192] = Colour.WHITE;
        }

        this.flameGradient2 = new Int32Array(256);
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient2[index] = index * 4;
        }
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient2[index + 64] = index * 262144 + Colour.BLUE;
        }
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient2[index + 128] = index * 1024 + Colour.MAGENTA;
        }
        for (let index: number = 0; index < 64; index++) {
            this.flameGradient2[index + 192] = Colour.WHITE;
        }

        this.flameGradient = new Int32Array(256);
        this.flameBuffer0 = new Int32Array(32768);
        this.flameBuffer1 = new Int32Array(32768);
        this.generateFlameCoolingMap(null);
        this.flameBuffer3 = new Int32Array(32768);
        this.flameBuffer2 = new Int32Array(32768);
    }

    start(): void {
        if (this.active) {
            return;
        }

        this.active = true;
        this.flamesInterval = setInterval((): void => {
            this.renderFlames();
        }, 35);
    }

    close(): void {
        this.active = false;

        if (this.flamesInterval) {
            clearInterval(this.flamesInterval);
            this.flamesInterval = null;
        }

        this.titleLeft = null;
        this.titleRight = null;
        this.flameLeft = null;
        this.flameRight = null;
        this.flameGradient = null;
        this.flameGradient0 = null;
        this.flameGradient1 = null;
        this.flameGradient2 = null;
        this.flameBuffer0 = null;
        this.flameBuffer1 = null;
        this.flameBuffer3 = null;
        this.flameBuffer2 = null;
    }

    renderFlames(): void {
        if (!this.active) {
            return;
        }

        this.cycle++;
        this.updateFlames();
        this.updateFlames();
        this.drawFlames();
    }

    updateFlames(): void {
        if (!this.flameBuffer3 || !this.flameBuffer2 || !this.flameBuffer0) {
            return;
        }

        for (let x: number = 10; x < 117; x++) {
            const rand: number = (Math.random() * 100.0) | 0;
            if (rand < 50) this.flameBuffer3[x + ((FLAME_HEIGHT - 2) << 7)] = 255;
        }

        for (let l: number = 0; l < 100; l++) {
            const x: number = ((Math.random() * 124.0) | 0) + 2;
            const y: number = ((Math.random() * 128.0) | 0) + 128;
            const index: number = x + (y << 7);
            this.flameBuffer3[index] = 192;
        }

        for (let y: number = 1; y < FLAME_HEIGHT - 1; y++) {
            for (let x: number = 1; x < 127; x++) {
                const index: number = x + (y << 7);
                this.flameBuffer2[index] = ((this.flameBuffer3[index - 1] + this.flameBuffer3[index + 1] + this.flameBuffer3[index - 128] + this.flameBuffer3[index + 128]) / 4) | 0;
            }
        }

        this.coolingCycle += 128;
        if (this.coolingCycle > this.flameBuffer0.length) {
            this.coolingCycle -= this.flameBuffer0.length;
            this.generateFlameCoolingMap(this.runes[(Math.random() * 12.0) | 0]);
        }

        for (let y: number = 1; y < FLAME_HEIGHT - 1; y++) {
            for (let x: number = 1; x < 127; x++) {
                const index: number = x + (y << 7);
                let intensity: number = this.flameBuffer2[index + 128] - ((this.flameBuffer0[(index + this.coolingCycle) & (this.flameBuffer0.length - 1)] / 5) | 0);
                if (intensity < 0) {
                    intensity = 0;
                }
                this.flameBuffer3[index] = intensity;
            }
        }

        this.flameLineOffset.copyWithin(0, 1, FLAME_HEIGHT);
        this.flameLineOffset[FLAME_HEIGHT - 1] = (Math.sin(Client.loopCycle / 14.0) * 16.0 + Math.sin(Client.loopCycle / 15.0) * 14.0 + Math.sin(Client.loopCycle / 16.0) * 12.0) | 0;

        if (this.flameGradientCycle0 > 0) {
            this.flameGradientCycle0 -= 4;
        }

        if (this.flameGradientCycle1 > 0) {
            this.flameGradientCycle1 -= 4;
        }

        if (this.flameGradientCycle0 === 0 && this.flameGradientCycle1 === 0) {
            const rand: number = (Math.random() * 2000.0) | 0;

            if (rand === 0) {
                this.flameGradientCycle0 = 1024;
            } else if (rand === 1) {
                this.flameGradientCycle1 = 1024;
            }
        }
    }

    generateFlameCoolingMap(image: Pix8 | null): void {
        if (!this.flameBuffer0 || !this.flameBuffer1) {
            return;
        }

        this.flameBuffer0.fill(0);

        for (let i: number = 0; i < 5000; i++) {
            const rand: number = (Math.random() * FLAME_WIDTH * FLAME_HEIGHT) | 0;
            this.flameBuffer0[rand] = (Math.random() * 256.0) | 0;
        }

        for (let i: number = 0; i < 20; i++) {
            for (let y: number = 1; y < FLAME_HEIGHT - 1; y++) {
                for (let x: number = 1; x < 127; x++) {
                    const index: number = x + (y << 7);
                    this.flameBuffer1[index] = ((this.flameBuffer0[index - 1] + this.flameBuffer0[index + 1] + this.flameBuffer0[index - 128] + this.flameBuffer0[index + 128]) / 4) | 0;
                }
            }

            const last: Int32Array = this.flameBuffer0;
            this.flameBuffer0 = this.flameBuffer1;
            this.flameBuffer1 = last;
        }

        if (image) {
            let off: number = 0;

            for (let y: number = 0; y < image.hi; y++) {
                for (let x: number = 0; x < image.wi; x++) {
                    if (image.data[off++] !== 0) {
                        const x0: number = x + image.xof + 16;
                        const y0: number = y + image.yof + 16;
                        const index: number = x0 + (y0 << 7);
                        this.flameBuffer0[index] = 0;
                    }
                }
            }
        }
    }

    drawFlames(): void {
        if (!this.flameGradient || !this.flameGradient0 || !this.flameGradient1 || !this.flameGradient2 || !this.titleLeft || !this.titleRight || !this.flameLeft || !this.flameRight || !this.flameBuffer3) {
            return;
        }

        if (this.flameGradientCycle0 > 0) {
            this.doBlend(this.flameGradientCycle0, this.flameGradient1);
        } else if (this.flameGradientCycle1 > 0) {
            this.doBlend(this.flameGradientCycle1, this.flameGradient2);
        } else {
            this.flameGradient.set(this.flameGradient0);
        }

        this.drawSingleFlame(this.titleLeft, this.flameLeft, 0);
        this.titleLeft.draw(0, 0);

        this.drawSingleFlame(this.titleRight, this.flameRight, 1);
        this.titleRight.draw(637, 0);
    }

    drawSingleFlame(title: PixMap, base: Pix32, side: number): void {
        if (!this.flameGradient || !this.flameBuffer3) {
            return;
        }

        title.data.set(base.data.subarray(0, TITLE_FLAME_PIXELS));

        let srcOffset: number = 0;
        let dstOffset: number = side === 0 ? 1152 : 1176;

        for (let y: number = 1; y < FLAME_HEIGHT - 1; y++) {
            const offset: number = ((this.flameLineOffset[y] * (FLAME_HEIGHT - y)) / FLAME_HEIGHT) | 0;

            if (side === 0) {
                let step: number = offset + 22;
                if (step < 0) {
                    step = 0;
                }

                srcOffset += step;

                for (let x: number = step; x < FLAME_WIDTH; x++) {
                    dstOffset = this.blendPixel(title, srcOffset++, dstOffset);
                }

                dstOffset += step;
            } else {
                const step: number = 103 - offset;
                dstOffset += offset;

                for (let x: number = 0; x < step; x++) {
                    dstOffset = this.blendPixel(title, srcOffset++, dstOffset);
                }

                srcOffset += FLAME_WIDTH - step;
                dstOffset += FLAME_WIDTH - step - offset;
            }
        }
    }

    doBlend(cycle: number, target: Int32Array): void {
        if (!this.flameGradient || !this.flameGradient0) {
            return;
        }

        for (let i: number = 0; i < 256; i++) {
            if (cycle > 768) {
                this.flameGradient[i] = TitleFlames.merge(this.flameGradient0[i], target[i], 1024 - cycle);
            } else if (cycle > 256) {
                this.flameGradient[i] = target[i];
            } else {
                this.flameGradient[i] = TitleFlames.merge(target[i], this.flameGradient0[i], 256 - cycle);
            }
        }
    }

    static merge(src: number, dst: number, alpha: number): number {
        const invAlpha: number = 256 - alpha;
        return ((((src & 0xff00ff) * invAlpha + (dst & 0xff00ff) * alpha) & 0xff00ff00) + (((src & 0xff00) * invAlpha + (dst & 0xff00) * alpha) & 0xff0000)) >> 8;
    }

    private blendPixel(title: PixMap, srcOffset: number, dstOffset: number): number {
        if (!this.flameGradient || !this.flameBuffer3) {
            return dstOffset;
        }

        let value: number = this.flameBuffer3[srcOffset];
        if (value === 0) {
            return dstOffset + 1;
        }

        const alpha: number = value;
        const invAlpha: number = 256 - value;
        value = this.flameGradient[value];

        const background: number = title.data[dstOffset];
        title.data[dstOffset] = ((((value & 0xff00ff) * alpha + (background & 0xff00ff) * invAlpha) & 0xff00ff00) + (((value & 0xff00) * alpha + (background & 0xff00) * invAlpha) & 0xff0000)) >> 8;
        return dstOffset + 1;
    }
}
