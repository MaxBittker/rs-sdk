import Packet from '#/io/Packet.js';

import Tone from '#/sound/Tone.js';

import { TypedArray1d } from '#/util/Arrays.js';

export default class JagFX {
    static synth: (JagFX | null)[] = new TypedArray1d(1000, null);
    static delays: Int32Array = new Int32Array(1000);

    static waveBytes: Uint8Array = new Uint8Array(22050 * 20);
    static waveBuffer: Packet = new Packet(this.waveBytes);

    tones: (Tone | null)[] = new TypedArray1d(10, null);
    loopBegin: number = 0;
    loopEnd: number = 0;

    static init(buf: Packet): void {
        while (true) {
            const id = buf.g2();
            if (id === 65535) {
                break;
            }

            this.synth[id] = new JagFX();
            this.synth[id].load(buf);
            this.delays[id] = this.synth[id].optimiseStart();
        }
    }

    static generate(id: number, loopCount: number): Packet | null {
        const sound = this.synth[id];
        if (sound === null) {
            return null;
        }

        return sound.getWave(loopCount);
    }

    load(dat: Packet): void {
        for (let tone = 0; tone < 10; tone++) {
            if (dat.g1() !== 0) {
                dat.pos--;

                this.tones[tone] = new Tone();
                this.tones[tone]!.load(dat);
            }
        }

        this.loopBegin = dat.g2();
        this.loopEnd = dat.g2();
    }

    optimiseStart(): number {
        let start = 9999999;
        for (let i = 0; i < 10; i++) {
            const tone = this.tones[i];
            if (tone !== null && ((tone.start / 20) | 0) < start) {
                start = (tone.start / 20) | 0;
            }
        }

        if (this.loopBegin < this.loopEnd && ((this.loopBegin / 20) | 0) < start) {
            start = (this.loopBegin / 20) | 0;
        }

        if (start === 9999999 || start === 0) {
            return 0;
        }

        for (let i = 0; i < 10; i++) {
            const tone = this.tones[i];
            if (tone !== null) {
                tone.start -= start * 20;
            }
        }

        if (this.loopBegin < this.loopEnd) {
            this.loopBegin -= start * 20;
            this.loopEnd -= start * 20;
        }

        return start;
    }

    getWave(loopCount: number): Packet {
        const length = this.makeSound(loopCount);
        JagFX.waveBuffer.pos = 0;
        JagFX.waveBuffer.p4(0x52494646); // "RIFF" ChunkID
        JagFX.waveBuffer.ip4(length + 36); // ChunkSize
        JagFX.waveBuffer.p4(0x57415645); // "WAVE" format
        JagFX.waveBuffer.p4(0x666d7420); // "fmt " chunk id
        JagFX.waveBuffer.ip4(16); // chunk size
        JagFX.waveBuffer.ip2(1); // audio format
        JagFX.waveBuffer.ip2(1); // num channels
        JagFX.waveBuffer.ip4(22050); // sample rate
        JagFX.waveBuffer.ip4(22050); // byte rate
        JagFX.waveBuffer.ip2(1); // block align
        JagFX.waveBuffer.ip2(8); // bits per sample
        JagFX.waveBuffer.p4(0x64617461); // "data"
        JagFX.waveBuffer.ip4(length);
        JagFX.waveBuffer.pos += length;
        return JagFX.waveBuffer;
    }

    private makeSound(loopCount: number): number {
        let duration = 0;
        for (let i = 0; i < 10; i++) {
            const tone = this.tones[i];
            if (tone !== null && tone.length + tone.start > duration) {
                duration = tone.length + tone.start;
            }
        }

        if (duration === 0) {
            return 0;
        }

        let sampleCount = ((duration * 22050) / 1000) | 0;
        let loopStart = ((this.loopBegin * 22050) / 1000) | 0;
        let loopStop = ((this.loopEnd * 22050) / 1000) | 0;

        if (loopStart < 0 || loopStop < 0 || loopStop > sampleCount || loopStart >= loopStop) {
            loopCount = 0;
        }

        let totalSampleCount = sampleCount + (loopStop - loopStart) * (loopCount - 1);
        for (let sample = 44; sample < totalSampleCount + 44; sample++) {
            JagFX.waveBytes[sample] = -128;
        }

        for (let i = 0; i < 10; i++) {
            const tone = this.tones[i];
            if (tone !== null) {
                const toneSampleCount = ((tone.length * 22050) / 1000) | 0;
                const start = ((tone.start * 22050) / 1000) | 0;
                const samples = tone.generate(toneSampleCount, tone.length);

                for (let sample = 0; sample < toneSampleCount; sample++) {
                    JagFX.waveBytes[sample + start + 44] += ((samples[sample] >> 8) << 24) >> 24;
                }
            }
        }

        if (loopCount > 1) {
            loopStart += 44;
            loopStop += 44;
            sampleCount += 44;
            totalSampleCount += 44;

            const endOffset = totalSampleCount - sampleCount;
            for (let sample = sampleCount - 1; sample >= loopStop; sample--) {
                JagFX.waveBytes[sample + endOffset] = JagFX.waveBytes[sample];
            }

            for (let loop = 1; loop < loopCount; loop++) {
                const offset = (loopStop - loopStart) * loop;

                for (let sample = loopStart; sample < loopStop; sample++) {
                    JagFX.waveBytes[sample + offset] = JagFX.waveBytes[sample];
                }
            }

            totalSampleCount -= 44;
        }

        return totalSampleCount;
    }
}
