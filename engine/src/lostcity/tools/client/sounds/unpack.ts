import fs from 'fs';
import Jagfile from '#jagex2/io/Jagfile.js';
import Packet from '#jagex2/io/Packet.js';

if (!fs.existsSync('data/src/sounds')) {
    fs.mkdirSync('data/src/sounds', { recursive: true });
}

// TODO: doesn't -need- to be global from Wave's perspective
let pack = '';
let order = '';

class Wave {
    static tracks: Wave[] = [];

    static unpack(dat: Packet) {
        while (dat.available > 0) {
            const id = dat.g2();
            if (id === 65535) {
                break;
            }

            const start = dat.pos;
            Wave.tracks[id] = new Wave();
            Wave.tracks[id].decode(dat);
            const end = dat.pos;

            order += `${id}\n`;

            const data = new Uint8Array((end - start) - start);
            dat.pos = start;
            dat.gdata(data, 0, data.length);
            dat.pos = start;

            fs.writeFileSync(`data/src/sounds/sound_${id}.synth`, data);
        }

        for (let i = 0; i < Wave.tracks.length; i++) {
            pack += `${i}=sound_${i}\n`;
        }
    }

    tones: Tone[] = [];
    loopBegin = 0;
    loopEnd = 0;

    decode(dat: Packet) {
        for (let i = 0; i < 10; i++) {
            if (dat.g1() != 0) {
                dat.pos--;

                this.tones[i] = new Tone();
                this.tones[i].decode(dat);
            }
        }

        this.loopBegin = dat.g2();
        this.loopEnd = dat.g2();
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

    decode(dat: Packet) {
        this.frequencyBase = new Envelope();
        this.frequencyBase.decode(dat);

        this.amplitudeBase = new Envelope();
        this.amplitudeBase.decode(dat);

        if (dat.g1() != 0) {
            dat.pos--;

            this.frequencyModRate = new Envelope();
            this.frequencyModRate.decode(dat);

            this.frequencyModRange = new Envelope();
            this.frequencyModRange.decode(dat);
        }

        if (dat.g1() != 0) {
            dat.pos--;

            this.amplitudeModRate = new Envelope();
            this.amplitudeModRate.decode(dat);

            this.amplitudeModRange = new Envelope();
            this.amplitudeModRange.decode(dat);
        }

        if (dat.g1() != 0) {
            dat.pos--;

            this.release = new Envelope();
            this.release.decode(dat);

            this.attack = new Envelope();
            this.attack.decode(dat);
        }

        for (let i = 0; i < 10; i++) {
            const volume = dat.gsmart();
            if (volume === 0) {
                break;
            }

            this.harmonicVolume[i] = volume;
            this.harmonicSemitone[i] = dat.gsmarts();
            this.harmonicDelay[i] = dat.gsmart();
        }

        this.reverbDelay = dat.gsmart();
        this.reverbVolume = dat.gsmart();
        this.length = dat.g2();
        this.start = dat.g2();
    }
}

class Envelope {
    form = 0;
    start = 0;
    end = 0;
    length = 0;
    shapeDelta: number[] = [];
    shapePeak: number[] = [];

    decode(dat: Packet) {
        this.form = dat.g1();
        this.start = dat.g4();
        this.end = dat.g4();

        this.length = dat.g1();
        for (let i = 0; i < this.length; i++) {
            this.shapeDelta[i] = dat.g2();
            this.shapePeak[i] = dat.g2();
        }
    }
}

const sounds = Jagfile.load('data/client/sounds');

const soundsData = sounds.read('sounds.dat');

if (!soundsData) {
    throw new Error('missing sounds.dat');
}

Wave.unpack(soundsData);

fs.writeFileSync('data/src/pack/sound.pack', pack);
fs.writeFileSync('data/src/pack/sound.order', order);
