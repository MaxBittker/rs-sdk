import SeqType from '#/config/SeqType.js';

import LruCache from '#/datastruct/LruCache.js';

import Model from '#/dash3d/Model.js';

import JagFile from '#/io/JagFile.js';
import Packet from '#/io/Packet.js';

export default class SpotType {
    static numDefinitions: number = 0;
    static list: SpotType[] = [];
    static modelCache: LruCache<Model> = new LruCache(30);

    id: number = 0;

    model: number = 0;
    anim: number = -1;
    seq: SeqType | null = null;
    recol_s: Uint16Array = new Uint16Array(6);
    recol_d: Uint16Array = new Uint16Array(6);
    resizeh: number = 128;
    resizev: number = 128;
    angle: number = 0;
    ambient: number = 0;
    contrast: number = 0;

    static init(config: JagFile): void {
        const dat: Packet = new Packet(config.read('spotanim.dat'));

        this.numDefinitions = dat.g2();
        this.list = new Array(this.numDefinitions);

        for (let id: number = 0; id < this.numDefinitions; id++) {
            if (!this.list[id]) {
                this.list[id] = new SpotType();
            }

            this.list[id].id = id;
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
                this.model = dat.g2();
            } else if (code === 2) {
                this.anim = dat.g2();

                if (SeqType.list) {
                    this.seq = SeqType.list[this.anim];
                }
            } else if (code === 4) {
                this.resizeh = dat.g2();
            } else if (code === 5) {
                this.resizev = dat.g2();
            } else if (code === 6) {
                this.angle = dat.g2();
            } else if (code === 7) {
                this.ambient = dat.g1();
            } else if (code === 8) {
                this.contrast = dat.g1();
            } else if (code >= 40 && code < 50) {
                this.recol_s[code - 40] = dat.g2();
            } else if (code >= 50 && code < 60) {
                this.recol_d[code - 50] = dat.g2();
            } else {
                console.log('Error unrecognised spotanim config code: ', code);
            }
        }
    }

    getTempModel2(): Model | null {
        let model = SpotType.modelCache.find(BigInt(this.id));
        if (model) {
            return model;
        }

        model = Model.load(this.model);
        if (!model) {
            return null;
        }

        for (let i: number = 0; i < 6; i++) {
            if (this.recol_s[0] !== 0) {
                model.recolour(this.recol_s[i], this.recol_d[i]);
            }
        }

        SpotType.modelCache.put(model, BigInt(this.id));
        return model;
    }
}
