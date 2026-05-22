import Packet from '#/io/Packet.js';

import Envelope from '#/sound/Envelope.js';
import Filter from '#/sound/Filter.js';
import { mulShift16 } from '#/util/JsUtil.js';

export default class Tone {
    static buf: Int32Array = new Int32Array(22050 * 10);
    static noise: Int32Array = new Int32Array(32768);
    static sine: Int32Array = new Int32Array(32768);

    static fPos: Int32Array = new Int32Array(5);
    static fDel: Int32Array = new Int32Array(5);
    static fAmp: Int32Array = new Int32Array(5);
    static fMulti: Int32Array = new Int32Array(5);
    static fOffset: Int32Array = new Int32Array(5);

    static {
        for (let i = 0; i < 32768; i++) {
            if (Math.random() > 0.5) {
                this.noise[i] = 1;
            } else {
                this.noise[i] = -1;
            }
        }

        for (let i = 0; i < 32768; i++) {
            this.sine[i] = (Math.sin(i / 5215.1903) * 16384.0) | 0;
        }
    }

    frequencyBase: Envelope = new Envelope();
    amplitudeBase: Envelope = new Envelope();

    frequencyModRate: Envelope | null = null;
    frequencyModRange: Envelope | null = null;

    amplitudeModRate: Envelope | null = null;
    amplitudeModRange: Envelope | null = null;

    release: Envelope | null = null;
    attack: Envelope | null = null;

    harmonicVolume: Int32Array = new Int32Array(5);
    harmonicSemitone: Int32Array = new Int32Array(5);
    harmonicDelay: Int32Array = new Int32Array(5);

    reverbDelay: number = 0;
    reverbVolume: number = 100;

    length: number = 500;
    start: number = 0;

    filter: Filter | null = null;
    filterRange: Envelope | null = null;

    generate(sampleCount: number, length: number): Int32Array {
        for (let sample = 0; sample < sampleCount; sample++) {
            Tone.buf[sample] = 0;
        }

        if (length < 10) {
            return Tone.buf;
        }

        const samplesPerStep = sampleCount / length;

        this.frequencyBase.genInit();
        this.amplitudeBase.genInit();

        let frequencyStart = 0;
        let frequencyDuration = 0;
        let frequencyPhase = 0;
        if (this.frequencyModRate !== null && this.frequencyModRange !== null) {
            this.frequencyModRate.genInit();
            this.frequencyModRange.genInit();

            frequencyStart = (((this.frequencyModRate.end - this.frequencyModRate.start) * 32.768) / samplesPerStep) | 0;
            frequencyDuration = ((this.frequencyModRate.start * 32.768) / samplesPerStep) | 0;
        }

        let amplitudeStart = 0;
        let amplitudeDuration = 0;
        let amplitudePhase = 0;
        if (this.amplitudeModRate !== null && this.amplitudeModRange !== null) {
            this.amplitudeModRate.genInit();
            this.amplitudeModRange.genInit();

            amplitudeStart = (((this.amplitudeModRate.end - this.amplitudeModRate.start) * 32.768) / samplesPerStep) | 0;
            amplitudeDuration = ((this.amplitudeModRate.start * 32.768) / samplesPerStep) | 0;
        }

        for (let harmonic = 0; harmonic < 5; harmonic++) {
            if (this.harmonicVolume[harmonic] !== 0) {
                Tone.fPos[harmonic] = 0;
                Tone.fDel[harmonic] = this.harmonicDelay[harmonic] * samplesPerStep;
                Tone.fAmp[harmonic] = ((this.harmonicVolume[harmonic] << 14) / 100) | 0;
                Tone.fMulti[harmonic] = (((this.frequencyBase.end - this.frequencyBase.start) * 32.768 * Math.pow(1.0057929410678534, this.harmonicSemitone[harmonic])) / samplesPerStep) | 0;
                Tone.fOffset[harmonic] = ((this.frequencyBase.start * 32.768) / samplesPerStep) | 0;
            }
        }

        for (let sample = 0; sample < sampleCount; sample++) {
            let frequency = this.frequencyBase.genNext(sampleCount);
            let amplitude = this.amplitudeBase.genNext(sampleCount);

            if (this.frequencyModRate !== null && this.frequencyModRange !== null) {
                const rate = this.frequencyModRate.genNext(sampleCount);
                const range = this.frequencyModRange.genNext(sampleCount);

                frequency += this.waveFunc(range, frequencyPhase, this.frequencyModRate.form) >> 1;
                frequencyPhase += ((rate * frequencyStart) >> 16) + frequencyDuration;
            }

            if (this.amplitudeModRate !== null && this.amplitudeModRange !== null) {
                const rate = this.amplitudeModRate.genNext(sampleCount);
                const range = this.amplitudeModRange.genNext(sampleCount);

                amplitude = (amplitude * ((this.waveFunc(range, amplitudePhase, this.amplitudeModRate.form) >> 1) + 32768)) >> 15;
                amplitudePhase += ((rate * amplitudeStart) >> 16) + amplitudeDuration;
            }

            for (let harmonic = 0; harmonic < 5; harmonic++) {
                if (this.harmonicVolume[harmonic] !== 0) {
                    const position = sample + Tone.fDel[harmonic];

                    if (position < sampleCount) {
                        Tone.buf[position] += this.waveFunc((amplitude * Tone.fAmp[harmonic]) >> 15, Tone.fPos[harmonic], this.frequencyBase.form);
                        Tone.fPos[harmonic] += ((frequency * Tone.fMulti[harmonic]) >> 16) + Tone.fOffset[harmonic];
                    }
                }
            }
        }

        if (this.release !== null && this.attack !== null) {
            this.release.genInit();
            this.attack.genInit();

            let counter = 0;
            let muted = true;

            for (let sample = 0; sample < sampleCount; sample++) {
                const releaseValue = this.release.genNext(sampleCount);
                const attackValue = this.attack.genNext(sampleCount);

                let threshold: number;
                if (muted) {
                    threshold = this.release.start + (((this.release.end - this.release.start) * releaseValue) >> 8);
                } else {
                    threshold = this.release.start + (((this.release.end - this.release.start) * attackValue) >> 8);
                }

                counter += 256;
                if (counter >= threshold) {
                    counter = 0;
                    muted = !muted;
                }

                if (muted) {
                    Tone.buf[sample] = 0;
                }
            }
        }

        if (this.reverbDelay > 0 && this.reverbVolume > 0) {
            const start = (this.reverbDelay * samplesPerStep) | 0;

            for (let sample = start; sample < sampleCount; sample++) {
                Tone.buf[sample] += ((Tone.buf[sample - start] * this.reverbVolume) / 100) | 0;
            }
        }

        if (this.filter && this.filterRange && (this.filter.pairs[0] > 0 || this.filter.pairs[1] > 0)) {
            this.filterRange.genInit();

            let range: number = this.filterRange.genNext(sampleCount + 1);
            let coeff0: number = this.filter.calculateCoeffs(0, range / 65536.0);
            let coeff1: number = this.filter.calculateCoeffs(1, range / 65536.0);

            if (sampleCount >= coeff0 + coeff1) {
                let sample = 0;
                let limit = coeff1;

                if (coeff1 > sampleCount - coeff0) {
                    limit = sampleCount - coeff0;
                }

                while (sample < limit) {
                    let value = mulShift16(Tone.buf[sample + coeff0], Filter.reduceCoeffInt);

                    for (let i = 0; i < coeff0; i++) {
                        value += mulShift16(Tone.buf[sample + coeff0 - i - 1], Filter.coeffInt[0][i]);
                    }

                    for (let i = 0; i < sample; i++) {
                        value -= mulShift16(Tone.buf[sample - i - 1], Filter.coeffInt[1][i]);
                    }

                    Tone.buf[sample] = value;
                    range = this.filterRange.genNext(sampleCount + 1);
                    sample++;
                }

                const step = 128;
                let next = step;

                while (true) {
                    if (next > sampleCount - coeff0) {
                        next = sampleCount - coeff0;
                    }

                    while (sample < next) {
                        let value = mulShift16(Tone.buf[sample + coeff0], Filter.reduceCoeffInt);

                        for (let i = 0; i < coeff0; i++) {
                            value += mulShift16(Tone.buf[sample + coeff0 - i - 1], Filter.coeffInt[0][i]);
                        }

                        for (let i = 0; i < coeff1; i++) {
                            value -= mulShift16(Tone.buf[sample - i - 1], Filter.coeffInt[1][i]);
                        }

                        Tone.buf[sample] = value;
                        range = this.filterRange.genNext(sampleCount + 1);
                        sample++;
                    }

                    if (sample >= sampleCount - coeff0) {
                        while (sample < sampleCount) {
                            let value = 0;

                            for (let i = sample + coeff0 - sampleCount; i < coeff0; i++) {
                                value += mulShift16(Tone.buf[sample + coeff0 - i - 1], Filter.coeffInt[0][i]);
                            }

                            for (let i = 0; i < coeff1; i++) {
                                value -= mulShift16(Tone.buf[sample - i - 1], Filter.coeffInt[1][i]);
                            }

                            Tone.buf[sample] = value;
                            this.filterRange.genNext(sampleCount + 1);
                            sample++;
                        }
                        break;
                    }

                    coeff0 = this.filter.calculateCoeffs(0, range / 65536.0);
                    coeff1 = this.filter.calculateCoeffs(1, range / 65536.0);
                    next += step;
                }
            }
        }

        for (let sample = 0; sample < sampleCount; sample++) {
            if (Tone.buf[sample] < -32768) {
                Tone.buf[sample] = -32768;
            }

            if (Tone.buf[sample] > 32767) {
                Tone.buf[sample] = 32767;
            }
        }

        return Tone.buf;
    }

    waveFunc(amplitude: number, phase: number, form: number): number {
        if (form === 1) {
            return (phase & 0x7fff) < 16384 ? amplitude : -amplitude;
        } else if (form === 2) {
            return (Tone.sine[phase & 0x7fff] * amplitude) >> 14;
        } else if (form === 3) {
            return (((phase & 0x7fff) * amplitude) >> 14) - amplitude;
        } else if (form === 4) {
            return Tone.noise[((phase / 2607) | 0) & 0x7fff] * amplitude;
        } else {
            return 0;
        }
    }

    load(buf: Packet): void {
        this.frequencyBase = new Envelope();
        this.frequencyBase.load(buf);

        this.amplitudeBase = new Envelope();
        this.amplitudeBase.load(buf);

        if (buf.g1() !== 0) {
            buf.pos--;

            this.frequencyModRate = new Envelope();
            this.frequencyModRate.load(buf);

            this.frequencyModRange = new Envelope();
            this.frequencyModRange.load(buf);
        }

        if (buf.g1() !== 0) {
            buf.pos--;

            this.amplitudeModRate = new Envelope();
            this.amplitudeModRate.load(buf);

            this.amplitudeModRange = new Envelope();
            this.amplitudeModRange.load(buf);
        }

        if (buf.g1() !== 0) {
            buf.pos--;

            this.release = new Envelope();
            this.release.load(buf);

            this.attack = new Envelope();
            this.attack.load(buf);
        }

        for (let harmonic = 0; harmonic < 10; harmonic++) {
            const volume = buf.gsmart();
            if (volume === 0) {
                break;
            }

            this.harmonicVolume[harmonic] = volume;
            this.harmonicSemitone[harmonic] = buf.gsmarts();
            this.harmonicDelay[harmonic] = buf.gsmart();
        }

        this.reverbDelay = buf.gsmart();
        this.reverbVolume = buf.gsmart();
        this.length = buf.g2();
        this.start = buf.g2();

        this.filter = new Filter();
        this.filterRange = new Envelope();
        this.filter.unpack(buf, this.filterRange);
    }
}
