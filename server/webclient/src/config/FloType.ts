import JagFile from '#/io/JagFile.js';
import Packet from '#/io/Packet.js';

export default class FloType {
    static numDefinitions: number = 0;
    static list: FloType[] = [];

    colour: number = 0;
    texture: number = -1;
    overlay: boolean = false;
    occlude: boolean = true;
    debugname: string = '';

    hue: number = 0;
    saturation: number = 0;
    lightness: number = 0;

    chroma: number = 0;
    underlayHue: number = 0;
    overlayHsl: number = 0;

    static init(config: JagFile): void {
        const dat: Packet = new Packet(config.read('flo.dat'));

        this.numDefinitions = dat.g2();
        this.list = new Array(this.numDefinitions);

        for (let id: number = 0; id < this.numDefinitions; id++) {
            if (!this.list[id]) {
                this.list[id] = new FloType();
            }

            this.list[id].decode(dat);
        }
    }

    decode(dat: Packet): void {
        while (true) {
            const code = dat.g1();
            if (code === 0) {
                break;
            }

            if (code === 1) {
                this.colour = dat.g3();
                this.getHsl(this.colour);
            } else if (code === 2) {
                this.texture = dat.g1();
            } else if (code === 3) {
                this.overlay = true;
            } else if (code === 5) {
                this.occlude = false;
            } else if (code === 6) {
                this.debugname = dat.gjstr();
            } else {
                console.log('Error unrecognised config code: ', code);
            }
        }
    }

    private getHsl(rgb: number): void {
        const red: number = ((rgb >> 16) & 0xff) / 256.0;
        const green: number = ((rgb >> 8) & 0xff) / 256.0;
        const blue: number = (rgb & 0xff) / 256.0;

        let min: number = red;
        if (green < red) {
            min = green;
        }
        if (blue < min) {
            min = blue;
        }

        let max: number = red;
        if (green > red) {
            max = green;
        }
        if (blue > max) {
            max = blue;
        }

        let h: number = 0.0;
        let s: number = 0.0;
        const l: number = (min + max) / 2.0;

        if (min !== max) {
            if (l < 0.5) {
                s = (max - min) / (max + min);
            }
            if (l >= 0.5) {
                s = (max - min) / (2.0 - max - min);
            }

            if (red === max) {
                h = (green - blue) / (max - min);
            } else if (green === max) {
                h = (blue - red) / (max - min) + 2.0;
            } else if (blue === max) {
                h = (red - green) / (max - min) + 4.0;
            }
        }

        h /= 6.0;

        this.hue = (h * 256.0) | 0;
        this.saturation = (s * 256.0) | 0;
        this.lightness = (l * 256.0) | 0;

        if (this.saturation < 0) {
            this.saturation = 0;
        } else if (this.saturation > 255) {
            this.saturation = 255;
        }

        if (this.lightness < 0) {
            this.lightness = 0;
        } else if (this.lightness > 255) {
            this.lightness = 255;
        }

        if (l > 0.5) {
            this.chroma = ((1.0 - l) * s * 512.0) | 0;
        } else {
            this.chroma = (l * s * 512.0) | 0;
        }

        if (this.chroma < 1) {
            this.chroma = 1;
        }

        this.underlayHue = (h * this.chroma) | 0;

        let hue: number = this.hue + ((Math.random() * 16.0) | 0) - 8;
        if (hue < 0) {
            hue = 0;
        } else if (hue > 255) {
            hue = 255;
        }

        let saturation: number = this.saturation + ((Math.random() * 48.0) | 0) - 24;
        if (saturation < 0) {
            saturation = 0;
        } else if (saturation > 255) {
            saturation = 255;
        }

        let lightness: number = this.lightness + ((Math.random() * 48.0) | 0) - 24;
        if (lightness < 0) {
            lightness = 0;
        } else if (lightness > 255) {
            lightness = 255;
        }

        this.overlayHsl = FloType.getTable(hue, saturation, lightness);
    }

    static getTable(hue: number, saturation: number, lightness: number): number {
        if (lightness > 179) {
            saturation = (saturation / 2) | 0;
        }

        if (lightness > 192) {
            saturation = (saturation / 2) | 0;
        }

        if (lightness > 217) {
            saturation = (saturation / 2) | 0;
        }

        if (lightness > 243) {
            saturation = (saturation / 2) | 0;
        }

        return (((hue / 4) | 0) << 10) + (((saturation / 32) | 0) << 7) + ((lightness / 2) | 0);
    }
}
