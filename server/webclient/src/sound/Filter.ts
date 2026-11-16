import Packet from '#/io/Packet.js';

import Envelope from '#/sound/Envelope.js';

export default class Filter {
    static coeff: Float32Array[] = [new Float32Array(8), new Float32Array(8)];
    static coeffInt: Int32Array[] = [new Int32Array(8), new Int32Array(8)];
    static reduceCoeff: number = 0.0;
    static reduceCoeffInt: number = 0;

    unity: number = 0.0;
    unity16: number = 0;
    pairs: Int32Array = new Int32Array(2);
    frequencies: Int32Array[][] = new Array(2);
    ranges: Int32Array[][] = new Array(2);
    unities: Int32Array = new Int32Array(2);

    unpack(buf: Packet, envelope: Envelope) {
        const count = buf.g1();
        this.pairs[0] = count >> 4;
        this.pairs[1] = count & 0xF;

        if (count !== 0) {
            this.unities[0] = buf.g2();
            this.unities[1] = buf.g2();

            const migration = buf.g1();

            for (let direction = 0; direction < 2; direction++) {
                if (!this.frequencies[direction]) {
                    this.frequencies[direction] = new Array(2);
                    this.frequencies[direction][0] = new Int32Array(4);
                    this.frequencies[direction][1] = new Int32Array(4);
                }

                if (!this.ranges[direction]) {
                    this.ranges[direction] = new Array(2);
                    this.ranges[direction][0] = new Int32Array(4);
                    this.ranges[direction][1] = new Int32Array(4);
                }

                for (let pair = 0; pair < this.pairs[direction]; pair++) {
                    this.frequencies[direction][0][pair] = buf.g2();
                    this.ranges[direction][0][pair] = buf.g2();
                }
            }

            for (let direction = 0; direction < 2; direction++) {
                for (let pair = 0; pair < this.pairs[direction]; pair++) {
                    if ((migration & (1 << (direction * 4) << pair)) !== 0) {
                        this.frequencies[direction][1][pair] = buf.g2();
                        this.ranges[direction][1][pair] = buf.g2();
                    } else {
                        this.frequencies[direction][1][pair] = this.frequencies[direction][0][pair];
                        this.ranges[direction][1][pair] = this.ranges[direction][0][pair];
                    }
                }
            }

            if (migration !== 0 || this.unities[1] !== this.unities[0]) {
                envelope.loadPoints(buf);
            }
        } else {
            this.unities[0] = this.unities[1] = 0;
        }
    }

    private radius(pair: number, direction: number, t: number): number {
        const base: number = this.ranges[direction][0][pair];
        const range: number = this.ranges[direction][1][pair];
        const value: number = Math.fround(base + Math.fround(t * (range - base)));
        const scaled: number = Math.fround(value * Math.fround(0.0015258789)); // 1 / 655.36
        return Math.fround(1.0 - Math.fround(Math.pow(10.0, Math.fround(-scaled / 20.0))));
    }

    private frequency(value: number): number {
        const hz: number = Math.fround(Math.fround(Math.pow(2.0, value)) * Math.fround(32.703197));
        return Math.fround(Math.fround(hz * Math.fround(3.1415927)) / 11025.0);
    }

    private frequencyFor(direction: number, pair: number, t: number): number {
        const base: number = this.frequencies[direction][0][pair];
        const range: number = this.frequencies[direction][1][pair];
        const value: number = Math.fround(base + Math.fround(t * (range - base)));
        const scaled: number = Math.fround(value * Math.fround(1.2207031e-4));
        return this.frequency(scaled);
    }

    calculateCoeffs(direction: number, t: number): number {
        if (direction === 0) {
            const unity: number = Math.fround(this.unities[0] + Math.fround((this.unities[1] - this.unities[0]) * t));
            const scaled: number = Math.fround(unity * Math.fround(0.0030517578));
            Filter.reduceCoeff = Math.fround(Math.pow(0.1, Math.fround(scaled / 20.0)));
            Filter.reduceCoeffInt = (Filter.reduceCoeff * 65536.0) | 0;
        }

        if (this.pairs[direction] === 0) {
            return 0;
        }

        const c: Float32Array = Filter.coeff[direction];

        let r = this.radius(0, direction, t);
        c[0] = Math.fround(-2.0 * r) * Math.fround(Math.cos(this.frequencyFor(direction, 0, t)));
        c[1] = r * r;

        for (let pair = 1; pair < this.pairs[direction]; pair++) {
            r = this.radius(pair, direction, t);
            const coeff = Math.fround(Math.fround(-2.0 * r) * Math.fround(Math.cos(this.frequencyFor(direction, pair, t))));
            const coeff2 = Math.fround(r * r);

            c[pair * 2 + 1] = c[pair * 2 - 1] * coeff2;
            c[pair * 2] = Math.fround(c[pair * 2 - 1] * coeff) + Math.fround(c[pair * 2 - 2] * coeff2);

            for (let i = pair * 2 - 1; i >= 2; i--) {
                c[i] += Math.fround(Math.fround(c[i - 1] * coeff) + Math.fround(c[i - 2] * coeff2));
            }

            c[1] += Math.fround(Math.fround(c[0] * coeff) + coeff2);
            c[0] += coeff;
        }

        if (direction === 0) {
            const count: number = this.pairs[0] * 2;
            for (let i = 0; i < count; i++) {
                Filter.coeff[0][i] *= Filter.reduceCoeff;
            }
        }

        const count: number = this.pairs[direction] * 2;
        for (let i = 0; i < count; i++) {
            Filter.coeffInt[direction][i] = (Filter.coeff[direction][i] * 65536.0) | 0;
        }

        return count;
    }
}
