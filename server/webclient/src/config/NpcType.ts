import LruCache from '#/datastruct/LruCache.js';

import AnimFrame from '#/dash3d/AnimFrame.js';
import Model from '#/dash3d/Model.js';

import JagFile from '#/io/JagFile.js';
import Packet from '#/io/Packet.js';

import { TypedArray1d } from '#/util/Arrays.js';

export default class NpcType {
    static numDefinitions: number = 0;
    static idx: Int32Array | null = null;
    static dat: Packet | null = null;
    static recent: (NpcType | null)[] | null = null;
    static recentPos: number = 0;
    static modelCache: LruCache<Model> = new LruCache(30);

    id: number = -1;

    name: string | null = null;
    desc: string | null = null;
    size: number = 1;
    model: Uint16Array | null = null;
    head: Uint16Array | null = null;
    readyanim: number = -1;
    walkanim: number = -1;
    walkanim_b: number = -1;
    walkanim_r: number = -1;
    walkanim_l: number = -1;
    recol_s: Uint16Array | null = null;
    recol_d: Uint16Array | null = null;
    op: (string | null)[] | null = null;
    minimap: boolean = true;
    vislevel: number = -1;
    resizeh: number = 128;
    resizev: number = 128;
    alwaysontop: boolean = false;
    ambient: number = 0;
    contrast: number = 0;
    headicon: number = -1;
    turnspeed: number = 32;

    static init(config: JagFile): void {
        this.dat = new Packet(config.read('npc.dat'));
        const idx: Packet = new Packet(config.read('npc.idx'));

        this.numDefinitions = idx.g2();
        this.idx = new Int32Array(this.numDefinitions);

        let offset: number = 2;
        for (let id: number = 0; id < this.numDefinitions; id++) {
            this.idx[id] = offset;
            offset += idx.g2();
        }

        this.recent = new TypedArray1d(20, null);
        for (let id: number = 0; id < 20; id++) {
            this.recent[id] = new NpcType();
        }
    }

    static list(id: number): NpcType {
        if (!this.recent || !this.idx || !this.dat) {
            throw new Error();
        }

        for (let i: number = 0; i < 20; i++) {
            const type: NpcType | null = this.recent[i];
            if (type && type.id === id) {
                return type;
            }
        }

        this.recentPos = (this.recentPos + 1) % 20;

        const npc: NpcType = (this.recent[this.recentPos] = new NpcType());
        this.dat.pos = this.idx[id];
        npc.id = id;
        npc.decode(this.dat);

        return npc;
    }

    decode(dat: Packet): void {
        while (true) {
            const code = dat.g1();
            if (code === 0) {
                break;
            }

            if (code === 1) {
                const count: number = dat.g1();
                this.model = new Uint16Array(count);

                for (let i: number = 0; i < count; i++) {
                    this.model[i] = dat.g2();
                }
            } else if (code === 2) {
                this.name = dat.gjstr();
            } else if (code === 3) {
                this.desc = dat.gjstr();
            } else if (code === 12) {
                this.size = dat.g1b();
            } else if (code === 13) {
                this.readyanim = dat.g2();
            } else if (code === 14) {
                this.walkanim = dat.g2();
            } else if (code === 17) {
                this.walkanim = dat.g2();
                this.walkanim_b = dat.g2();
                this.walkanim_r = dat.g2();
                this.walkanim_l = dat.g2();
            } else if (code >= 30 && code < 40) {
                if (!this.op) {
                    this.op = new TypedArray1d(5, null);
                }

                this.op[code - 30] = dat.gjstr();
                if (this.op[code - 30]?.toLowerCase() === 'hidden') {
                    this.op[code - 30] = null;
                }
            } else if (code === 40) {
                const count: number = dat.g1();
                this.recol_s = new Uint16Array(count);
                this.recol_d = new Uint16Array(count);

                for (let i: number = 0; i < count; i++) {
                    this.recol_s[i] = dat.g2();
                    this.recol_d[i] = dat.g2();
                }
            } else if (code === 60) {
                const count: number = dat.g1();
                this.head = new Uint16Array(count);

                for (let i: number = 0; i < count; i++) {
                    this.head[i] = dat.g2();
                }
            } else if (code === 90) {
                dat.pos += 2;
            } else if (code === 91) {
                dat.pos += 2;
            } else if (code === 92) {
                dat.pos += 2;
            } else if (code === 93) {
                this.minimap = false;
            } else if (code === 95) {
                this.vislevel = dat.g2();
            } else if (code === 97) {
                this.resizeh = dat.g2();
            } else if (code === 98) {
                this.resizev = dat.g2();
            } else if (code === 99) {
                this.alwaysontop = true;
            } else if (code === 100) {
                this.ambient = dat.g1b();
            } else if (code === 101) {
                this.contrast = dat.g1b() * 5;
            } else if (code === 102) {
                this.headicon = dat.g2();
            } else if (code === 103) {
                this.turnspeed = dat.g2();
            }
        }
    }

    getTempModel(primaryTransformId: number, secondaryTransformId: number, seqMask: Int32Array | null): Model | null {
        let model = NpcType.modelCache.find(BigInt(this.id));

        if (!model && this.model) {
            let ready = false;
            for (let i = 0; i < this.model.length; i++) {
                if (!Model.requestDownload(this.model[i])) {
                    ready = true;
                }
            }
            if (ready) {
                return null;
            }

            const models: (Model | null)[] = new TypedArray1d(this.model.length, null);
            for (let i: number = 0; i < this.model.length; i++) {
                models[i] = Model.load(this.model[i]);
            }

            if (models.length === 1) {
                model = models[0];
            } else {
                model = Model.combineForAnim(models, models.length);
            }

            if (model) {
                if (this.recol_s && this.recol_d) {
                    for (let i: number = 0; i < this.recol_s.length; i++) {
                        model.recolour(this.recol_s[i], this.recol_d[i]);
                    }
                }

                model.prepareAnim();
                model.calculateNormals(64, 850, -30, -50, -30, true);
                NpcType.modelCache.put(model, BigInt(this.id));
            }
        }

        if (!model) {
            return null;
        }

        const tmp = Model.tempModel;
        tmp.set(model, AnimFrame.animateTransparencies(primaryTransformId) && AnimFrame.animateTransparencies(secondaryTransformId));

        if (primaryTransformId !== -1 && secondaryTransformId !== -1) {
            tmp.maskAnimate(primaryTransformId, secondaryTransformId, seqMask);
        } else if (primaryTransformId !== -1) {
            tmp.animate(primaryTransformId);
        }

        if (this.resizeh !== 128 || this.resizev !== 128) {
            tmp.resize(this.resizeh, this.resizev, this.resizeh);
        }

        tmp.calcBoundingCylinder();
        tmp.labelFaces = null;
        tmp.labelVertices = null;

        if (this.size === 1) {
            tmp.useAABBMouseCheck = true;
        }

        return tmp;
    }

    getHead(): Model | null {
        if (!this.head) {
            return null;
        }

        let exists = false;
        for (let i = 0; i < this.head.length; i++) {
            if (!Model.requestDownload(this.head[i])) {
                exists = true;
            }
        }
        if (exists) {
            return null;
        }

        const models: (Model | null)[] = new TypedArray1d(this.head.length, null);
        for (let i: number = 0; i < this.head.length; i++) {
            models[i] = Model.load(this.head[i]);
        }

        let model: Model | null;
        if (models.length === 1) {
            model = models[0];
        } else {
            model = Model.combineForAnim(models, models.length);
        }

        if (model && this.recol_s && this.recol_d) {
            for (let i: number = 0; i < this.recol_s.length; i++) {
                model.recolour(this.recol_s[i], this.recol_d[i]);
            }
        }

        return model;
    }
}
