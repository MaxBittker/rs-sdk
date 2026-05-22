import fs from 'fs';
import path from 'path';

import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';
import FileStream from '#/io/FileStream.js';
import { SynthPack } from '#tools/pack/PackFile.js';
import { listFilesExt } from '#tools/pack/Parse.js';
import { printWarning } from '#/util/Logger.js';

// let pack = '';

class Wave {
    static tracks: Wave[] = [];
    static order: number[] = [];

    static unpack(buf: Packet, keepNames: boolean = true) {
        if (!fs.existsSync(`${Environment.build.srcDir}/synth`)) {
            fs.mkdirSync(`${Environment.build.srcDir}/synth`);
        }

        // can't trust synth IDs to remain stable
        const existingFiles = listFilesExt(`${Environment.build.srcDir}/synth`, '.synth');
        const crcs: Map<number, string> = new Map();

        if (!keepNames) {
            for (const file of existingFiles) {
                const data = fs.readFileSync(file);
                const crc = Packet.getcrc(data, 0, data.length);

                if (crcs.get(crc)) {
                    printWarning(`${file} has CRC collision with ${crcs.get(crc)}`);
                }

                crcs.set(crc, path.basename(file));
            }
        }

        const processed: string[] = [];
        while (buf.available > 0) {
            const id = buf.g2();
            if (id === 65535) {
                break;
            }

            this.order.push(id);

            const start = buf.pos;
            Wave.tracks[id] = new Wave();
            Wave.tracks[id].unpack(buf);
            const end = buf.pos;

            const data = new Uint8Array(end - start);
            buf.pos = start;
            buf.gdata(data, 0, data.length);

            const crc = Packet.getcrc(data, 0, data.length);

            if (!keepNames) {
                const existing = crcs.get(crc);

                if (existing && processed.indexOf(existing) === -1) {
                    SynthPack.register(id, path.basename(existing, path.extname(existing)));

                    const filePath = existingFiles.find(x => x.endsWith(`/${existing}`));
                    if (!filePath) {
                        printWarning(`${existing} should exist but does not`);

                        fs.writeFileSync(`${Environment.build.srcDir}/synth/${existing}`, data);
                    } else {
                        fs.writeFileSync(filePath, data);
                    }

                    processed.push(existing);
                    continue;
                }
            }

            const name = SynthPack.getById(id) || `sound_${id}`;
            if (!SynthPack.getById(id)) {
                SynthPack.register(id, name);
            }

            const filePath = existingFiles.find(x => x.endsWith(`/${name}.synth`));
            if (!filePath) {
                fs.writeFileSync(`${Environment.build.srcDir}/synth/${name}.synth`, data);
            } else {
                fs.writeFileSync(filePath, data);
            }
        }

        SynthPack.save();
        fs.writeFileSync(`${Environment.build.srcDir}/pack/synth.order`, this.order.join('\n') + '\n');
    }

    tones: Tone[] = [];
    loopBegin = 0;
    loopEnd = 0;

    unpack(buf: Packet) {
        for (let tone = 0; tone < 10; tone++) {
            if (buf.g1() != 0) {
                buf.pos--;

                this.tones[tone] = new Tone();
                this.tones[tone].unpack(buf);
            }
        }

        this.loopBegin = buf.g2();
        this.loopEnd = buf.g2();
    }
}

class Tone {
    frequencyBase: Envelope | null = null;
    amplitudeBase: Envelope | null = null;
    frequencyModRate: Envelope | null = null;
    frequencyModRange: Envelope | null = null;
    amplitudeModRate: Envelope | null = null;
    amplitudeModRange: Envelope | null = null;
    release: Envelope | null = null;
    attack: Envelope | null = null;
    harmonicVolume: number[] = [];
    harmonicSemitone: number[] = [];
    harmonicDelay: number[] = [];
    reverbDelay = 0;
    reverbVolume = 0;
    length = 0;
    start = 0;
    filter: Filter | null = null;
    filterRange: Envelope | null = null;

    unpack(buf: Packet) {
        this.frequencyBase = new Envelope();
        this.frequencyBase.unpack(buf);

        this.amplitudeBase = new Envelope();
        this.amplitudeBase.unpack(buf);

        if (buf.g1() != 0) {
            buf.pos--;

            this.frequencyModRate = new Envelope();
            this.frequencyModRate.unpack(buf);

            this.frequencyModRange = new Envelope();
            this.frequencyModRange.unpack(buf);
        }

        if (buf.g1() != 0) {
            buf.pos--;

            this.amplitudeModRate = new Envelope();
            this.amplitudeModRate.unpack(buf);

            this.amplitudeModRange = new Envelope();
            this.amplitudeModRange.unpack(buf);
        }

        if (buf.g1() != 0) {
            buf.pos--;

            this.release = new Envelope();
            this.release.unpack(buf);

            this.attack = new Envelope();
            this.attack.unpack(buf);
        }

        for (let i = 0; i < 10; i++) {
            const volume = buf.gsmarts();
            if (volume === 0) {
                break;
            }

            this.harmonicVolume[i] = volume;
            this.harmonicSemitone[i] = buf.gsmart();
            this.harmonicDelay[i] = buf.gsmarts();
        }

        this.reverbDelay = buf.gsmarts();
        this.reverbVolume = buf.gsmarts();
        this.length = buf.g2();
        this.start = buf.g2();

        this.filter = new Filter();
        this.filterRange = new Envelope();
        this.filter.unpack(buf, this.filterRange);
    }
}

class Envelope {
    form = 0;
    start = 0;
    end = 0;
    length = 0;
    shapeDelta: number[] = [];
    shapePeak: number[] = [];

    unpack(buf: Packet) {
        this.form = buf.g1();
        this.start = buf.g4s();
        this.end = buf.g4s();

        this.unpackShape(buf);
    }

    unpackShape(buf: Packet) {
        this.length = buf.g1();
        this.shapeDelta = new Array(this.length);
        this.shapePeak = new Array(this.length);
        for (let i = 0; i < this.length; i++) {
            this.shapeDelta[i] = buf.g2();
            this.shapePeak[i] = buf.g2();
        }
    }
}

class Filter {
    unity: number = 0.0;
    unity16: number = 0;
    pairs: Int32Array = new Int32Array(2);
    frequencies: Int32Array[][] = new Array(2);
    ranges: Int32Array[][] = new Array(2);
    unities: Int32Array = new Int32Array(2);

    unpack(buf: Packet, envelope: Envelope) {
        const count = buf.g1();
        this.pairs[0] = count >> 4;
        this.pairs[1] = count & 0xf;

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
                    if ((migration & ((1 << (direction * 4)) << pair)) !== 0) {
                        this.frequencies[direction][1][pair] = buf.g2();
                        this.ranges[direction][1][pair] = buf.g2();
                    } else {
                        this.frequencies[direction][1][pair] = this.frequencies[direction][0][pair];
                        this.ranges[direction][1][pair] = this.ranges[direction][0][pair];
                    }
                }
            }

            if (migration !== 0 || this.unities[1] !== this.unities[0]) {
                envelope.unpackShape(buf);
            }
        } else {
            this.unities[0] = this.unities[1] = 0;
        }
    }
}

const cache = new FileStream('data/unpack');
const sounds = new Jagfile(new Packet(cache.read(0, 8)!));
const soundsData = sounds.read('sounds.dat');

if (!soundsData) {
    throw new Error('missing sounds.dat');
}

if (!fs.existsSync(`${Environment.build.srcDir}/synth`)) {
    fs.mkdirSync(`${Environment.build.srcDir}/synth`);
}

Wave.unpack(soundsData);

// fs.writeFileSync(`${Environment.build.srcDir}/pack/synth.pack`, pack);
// fs.writeFileSync(`${Environment.build.srcDir}/pack/synth.order`, order);
