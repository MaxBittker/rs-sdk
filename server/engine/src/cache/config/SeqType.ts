import fs from 'fs';

import { ConfigType } from '#/cache/config/ConfigType.js';
import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';
import AnimFrame from '#/cache/graphics/AnimFrame.js';

export default class SeqType extends ConfigType {
    private static configNames = new Map<string, number>();
    private static configs: SeqType[] = [];

    static load(dir: string) {
        if (!fs.existsSync(`${dir}/server/seq.dat`)) {
            return;
        }

        // adds some startup time but we need it for seqlength
        if (!AnimFrame.instances.length) {
            AnimFrame.load();
        }

        const server = Packet.load(`${dir}/server/seq.dat`);
        const jag = Jagfile.load(`${dir}/client/config`);
        this.parse(server, jag);
    }

    static parse(server: Packet, jag: Jagfile) {
        SeqType.configNames = new Map();
        SeqType.configs = [];

        const count = server.g2();

        const client = jag.read('seq.dat')!;
        client.pos = 2;

        for (let id = 0; id < count; id++) {
            const config = new SeqType(id);
            config.decodeType(server);
            config.decodeType(client);
            config.postDecode();

            SeqType.configs[id] = config;

            if (config.debugname) {
                SeqType.configNames.set(config.debugname, id);
            }
        }
    }

    static get(id: number): SeqType {
        return SeqType.configs[id];
    }

    static getId(name: string): number {
        return SeqType.configNames.get(name) ?? -1;
    }

    static getByName(name: string): SeqType | null {
        const id = this.getId(name);
        if (id === -1) {
            return null;
        }

        return this.get(id);
    }

    static get count() {
        return SeqType.configs.length;
    }

    // ----

    frameCount: number = 0;
    frames: Int32Array | null = null;
    iframes: Int32Array | null = null;
    delay: Int32Array | null = null;
    loops: number = -1;
    walkmerge: Int32Array | null = null;
    reachforward: boolean = false;
    priority: number = 5;
    replaceheldleft: number = -1;
    replaceheldright: number = -1;
    maxloops: number = 99;
    preanim_move: number = -1;
    postanim_move: number = -1;
    duplicatebehaviour: number = 0;

    // precalculated for seqlength
    duration: number = 0;

    decode(code: number, dat: Packet) {
        if (code === 1) {
            this.frameCount = dat.g1();
            this.frames = new Int32Array(this.frameCount);
            this.iframes = new Int32Array(this.frameCount);
            this.delay = new Int32Array(this.frameCount);

            for (let i = 0; i < this.frameCount; i++) {
                this.frames[i] = dat.g2();

                this.iframes[i] = dat.g2();
                if (this.iframes[i] === 65535) {
                    this.iframes[i] = -1;
                }

                this.delay[i] = dat.g2();
                if (this.delay[i] === 0) {
                    this.delay[i] = AnimFrame.instances[this.frames[i]]?.delay ?? 0;
                }

                if (this.delay[i] === 0) {
                    this.delay[i] = 1;
                }

                this.duration += this.delay[i];
            }
        } else if (code === 2) {
            this.loops = dat.g2();
        } else if (code === 3) {
            const count = dat.g1();
            this.walkmerge = new Int32Array(count + 1);

            for (let i = 0; i < count; i++) {
                this.walkmerge[i] = dat.g1();
            }

            this.walkmerge[count] = 9999999;
        } else if (code === 4) {
            this.reachforward = true;
        } else if (code === 5) {
            this.priority = dat.g1();
        } else if (code === 6) {
            this.replaceheldleft = dat.g2();
        } else if (code === 7) {
            this.replaceheldright = dat.g2();
        } else if (code === 8) {
            this.maxloops = dat.g1();
        } else if (code === 9) {
            this.preanim_move = dat.g1();
        } else if (code === 10) {
            this.postanim_move = dat.g1();
        } else if (code === 11) {
            this.duplicatebehaviour = dat.g1();
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else {
            throw new Error(`Unrecognized seq config code: ${code}`);
        }
    }

    postDecode() {
        if (this.frameCount === 0) {
            this.frameCount = 1;
            this.frames = new Int32Array(1);
            this.frames[0] = -1;
            this.iframes = new Int32Array(1);
            this.iframes[0] = -1;
            this.delay = new Int32Array(1);
            this.delay[0] = -1;
        }

        if (this.preanim_move === -1) {
            if (this.walkmerge === null) {
                this.preanim_move = 0;
            } else {
                this.preanim_move = 2;
            }
        }

        if (this.postanim_move === -1) {
            if (this.walkmerge === null) {
                this.postanim_move = 0;
            } else {
                this.postanim_move = 2;
            }
        }
    }
}
