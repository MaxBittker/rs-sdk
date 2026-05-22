import LruCache from '#/datastruct/LruCache.js';

import AnimFrame from '#/dash3d/AnimFrame.js';
import { LocShape } from '#/dash3d/LocShape.js';
import { LocAngle } from '#/dash3d/LocAngle.js';

import Model from '#/dash3d/Model.js';

import JagFile from '#/io/JagFile.js';
import Packet from '#/io/Packet.js';

import { TypedArray1d } from '#/util/Arrays.js';
import type OnDemand from '#/io/OnDemand.js';

export default class LocType {
    static numDefinitions: number = 0;
    static idx: Int32Array | null = null;
    static dat: Packet | null = null;
    static recent: (LocType | null)[] | null = null;
    static recentPos: number = 0;
    static mc1: LruCache<Model> = new LruCache(500);
    static mc2: LruCache<Model> = new LruCache(30);
    static temp: Model[] = new Array(4);

    id: number = -1;

    model: Int32Array | null = null;
    shape: Int32Array | null = null;
    name: string | null = null;
    desc: string | null = null;
    recol_s: Uint16Array | null = null;
    recol_d: Uint16Array | null = null;
    width: number = 1;
    length: number = 1;
    blockwalk: boolean = true;
    blockrange: boolean = true;
    active: boolean = false;
    hillskew: boolean = false;
    sharelight: boolean = false;
    occlude: boolean = false;
    anim: number = -1;
    wallwidth: number = 16;
    ambient: number = 0;
    contrast: number = 0;
    op: (string | null)[] | null = null;
    mapfunction: number = -1;
    mapscene: number = -1;
    mirror: boolean = false;
    shadow: boolean = true;
    resizex: number = 128;
    resizey: number = 128;
    resizez: number = 128;
    offsetx: number = 0;
    offsety: number = 0;
    offsetz: number = 0;
    forceapproach: number = 0;
    forcedecor: boolean = false;
    breakroutefinding: boolean = false;
    raiseobject: number = 0;

    static init(config: JagFile): void {
        this.dat = new Packet(config.read('loc.dat'));
        const idx: Packet = new Packet(config.read('loc.idx'));

        this.numDefinitions = idx.g2();
        this.idx = new Int32Array(this.numDefinitions);

        let offset: number = 2;
        for (let id: number = 0; id < this.numDefinitions; id++) {
            this.idx[id] = offset;
            offset += idx.g2();
        }

        this.recent = new TypedArray1d(10, null);
        for (let id: number = 0; id < 10; id++) {
            this.recent[id] = new LocType();
        }
    }

    static list(id: number): LocType {
        if (!this.recent || !this.idx || !this.dat) {
            throw new Error();
        }

        for (let i: number = 0; i < 10; i++) {
            const type: LocType | null = this.recent[i];
            if (type && type.id === id) {
                return type;
            }
        }

        this.recentPos = (this.recentPos + 1) % 10;

        const loc: LocType = this.recent[this.recentPos]!;
        this.dat.pos = this.idx[id];
        loc.id = id;
        loc.reset();
        loc.decode(this.dat);

        return loc;
    }

    private reset(): void {
        this.model = null;
        this.shape = null;
        this.name = null;
        this.desc = null;
        this.recol_s = null;
        this.recol_d = null;
        this.width = 1;
        this.length = 1;
        this.blockwalk = true;
        this.blockrange = true;
        this.active = false;
        this.hillskew = false;
        this.sharelight = false;
        this.occlude = false;
        this.anim = -1;
        this.wallwidth = 16;
        this.ambient = 0;
        this.contrast = 0;
        this.op = null;
        this.mapfunction = -1;
        this.mapscene = -1;
        this.mirror = false;
        this.shadow = true;
        this.resizex = 128;
        this.resizey = 128;
        this.resizez = 128;
        this.forceapproach = 0;
        this.offsetx = 0;
        this.offsety = 0;
        this.offsetz = 0;
        this.forcedecor = false;
        this.breakroutefinding = false;
        this.raiseobject = -1;
    }

    decode(dat: Packet): void {
        let active = -1;
        while (true) {
            const code = dat.g1();
            if (code === 0) {
                break;
            }

            if (code === 1) {
                const count: number = dat.g1();
                this.model = new Int32Array(count);
                this.shape = new Int32Array(count);

                for (let i: number = 0; i < count; i++) {
                    this.model[i] = dat.g2();
                    this.shape[i] = dat.g1();
                }
            } else if (code === 2) {
                this.name = dat.gjstr();
            } else if (code === 3) {
                this.desc = dat.gjstr();
            } else if (code === 5) {
                const count: number = dat.g1();
                this.model = new Int32Array(count);
                this.shape = null;

                for (let i: number = 0; i < count; i++) {
                    this.model[i] = dat.g2();
                }
            } else if (code === 14) {
                this.width = dat.g1();
            } else if (code === 15) {
                this.length = dat.g1();
            } else if (code === 17) {
                this.blockwalk = false;
            } else if (code === 18) {
                this.blockrange = false;
            } else if (code === 19) {
                active = dat.g1();
                if (active === 1) {
                    this.active = true;
                }
            } else if (code === 21) {
                this.hillskew = true;
            } else if (code === 22) {
                this.sharelight = true;
            } else if (code === 23) {
                this.occlude = true;
            } else if (code === 24) {
                this.anim = dat.g2();

                if (this.anim === 65535) {
                    this.anim = -1;
                }
            } else if (code === 28) {
                this.wallwidth = dat.g1();
            } else if (code === 29) {
                this.ambient = dat.g1b();
            } else if (code === 39) {
                this.contrast = dat.g1b();
            } else if (code >= 30 && code < 39) {
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
                this.mapfunction = dat.g2();
            } else if (code === 62) {
                this.mirror = true;
            } else if (code === 64) {
                this.shadow = false;
            } else if (code === 65) {
                this.resizex = dat.g2();
            } else if (code === 66) {
                this.resizey = dat.g2();
            } else if (code === 67) {
                this.resizez = dat.g2();
            } else if (code === 68) {
                this.mapscene = dat.g2();
            } else if (code === 69) {
                this.forceapproach = dat.g1();
            } else if (code === 70) {
                this.offsetx = dat.g2b();
            } else if (code === 71) {
                this.offsety = dat.g2b();
            } else if (code === 72) {
                this.offsetz = dat.g2b();
            } else if (code === 73) {
                this.forcedecor = true;
            } else if (code === 74) {
                this.breakroutefinding = true;
            } else if (code === 75) {
                this.raiseobject = dat.g1();
            }
        }

        if (active === -1) {
            this.active = false;

            if (this.model && (!this.shape || (this.shape && this.shape[0] === LocShape.CENTREPIECE_STRAIGHT))) {
                this.active = true;
            }

            if (this.op) {
                this.active = true;
            }
        }

        if (this.breakroutefinding) {
            this.blockwalk = false;
            this.blockrange = false;
        }

        if (this.raiseobject === -1) {
            this.raiseobject = this.blockwalk ? 1 : 0;
        }
    }

    checkModel(shape: number): boolean {
        if (this.model === null) {
            return true;
        }

        if (this.shape !== null) {
            for (let i = 0; i < this.shape.length; i++) {
                if (this.shape[i] === shape) {
                    return Model.requestDownload(this.model[i] & 0xFFFF);
                }
            }
            return true;
        } else if (shape === LocShape.CENTREPIECE_STRAIGHT) {
            let ready = true;
            for (let i = 0; i < this.model.length; i++) {
                const model = this.model[i];
                if (!Model.requestDownload(model & 0xFFFF)) {
                    ready = false;
                }
            }
            return ready;
        }

        return true;
    }

    checkModelAll(): boolean {
        if (this.model == null) {
            return true;
        }

        let ready = true;
        for (let i = 0; i < this.model.length; i++) {
            const model = this.model[i];
            if (!Model.requestDownload(model & 0xFFFF)) {
                ready = false;
            }
        }
        return ready;
    }

    // custom name
    prefetchModelAll(od: OnDemand) {
        if (this.model == null) {
            return;
        }

        for (let i = 0; i < this.model.length; i++) {
            const model = this.model[i];
            if (model != -1) {
                od.prefetch(0, model & 0xFFFF);
            }
        }
    }

    getModel(shape: number, angle: number, heightSW: number, heightSE: number, heightNE: number, heightNW: number, transformId: number): Model | null {
        let modified = this.buildModel(shape, angle, transformId);
        if (!modified) {
            return null;
        }

        if (this.hillskew || this.sharelight) {
            modified = Model.hillSkewCopy(modified, this.hillskew, this.sharelight);
        }

        if (this.hillskew) {
            const groundY: number = ((heightSW + heightSE + heightNE + heightNW) / 4) | 0;

            for (let i: number = 0; i < modified.numPoints; i++) {
                const x: number = modified.pointX![i];
                const z: number = modified.pointZ![i];

                const heightS: number = heightSW + ((((heightSE - heightSW) * (x + 64)) / 128) | 0);
                const heightN: number = heightNW + ((((heightNE - heightNW) * (x + 64)) / 128) | 0);
                const y: number = heightS + ((((heightN - heightS) * (z + 64)) / 128) | 0);

                modified.pointY![i] += y - groundY;
            }

            modified.recalcBoundingCylinder();
        }

        return modified;
    }

    buildModel(shape: number, angle: number, transformId: number): Model | null {
        let model: Model | null = null;
        let typecode: bigint = 0n;

        if (this.shape === null) {
            if (shape !== LocShape.CENTREPIECE_STRAIGHT) {
                return null;
            }

            typecode = ((BigInt(transformId) + 1n) << 32n) + (BigInt(this.id) << 6n) + BigInt(angle);

            const cached = LocType.mc2.find(typecode);
            if (cached) {
                return cached;
            }

            if (!this.model) {
                return null;
            }

            const flip: boolean = this.mirror !== angle > 3;
            const modelCount: number = this.model.length;

            for (let i = 0; i < modelCount; i++) {
                let modelId = this.model[i];
                if (flip) {
                    modelId += 65536;
                }

                model = LocType.mc1.find(BigInt(modelId));
                if (!model) {
                    model = Model.load(modelId & 0xffff);
                    if (!model) {
                        return null;
                    }

                    if (flip) {
                        model.mirror();
                    }

                    LocType.mc1.put(model, BigInt(modelId));
                }

                if (modelCount > 1) {
                    LocType.temp[i] = model;
                }
            }

            if (modelCount > 1) {
                model = Model.combineForAnim(LocType.temp, modelCount);
            }
        } else {
            let index: number = -1;
            for (let i: number = 0; i < this.shape.length; i++) {
                if (this.shape[i] === shape) {
                    index = i;
                    break;
                }
            }
            if (index === -1) {
                return null;
            }

            typecode = ((BigInt(transformId) + 1n) << 32n) + (BigInt(this.id) << 6n) + (BigInt(index) << 3n) + BigInt(angle);

            const cached = LocType.mc2.find(typecode);
            if (cached) {
                return cached;
            }

            if (!this.model || index >= this.model.length) {
                return null;
            }

            let modelId: number = this.model[index];
            if (modelId === -1) {
                return null;
            }

            const flip: boolean = this.mirror !== angle > 3;
            if (flip) {
                modelId += 65536;
            }

            model = LocType.mc1.find(BigInt(modelId));
            if (!model) {
                model = Model.load(modelId & 0xffff);
                if (!model) {
                    return null;
                }

                if (flip) {
                    model.mirror();
                }

                LocType.mc1.put(model, BigInt(modelId));
            }
        }

        if (!model) {
            return null;
        }

        const scaled: boolean = this.resizex !== 128 || this.resizey !== 128 || this.resizez !== 128;
        const translated: boolean = this.offsetx !== 0 || this.offsety !== 0 || this.offsetz !== 0;

        const modified: Model = Model.copyForAnim(model, !this.recol_s, AnimFrame.animateTransparencies(transformId), angle === LocAngle.WEST && transformId === -1 && !scaled && !translated);
        if (transformId !== -1) {
            modified.prepareAnim();
            modified.animate(transformId);
            modified.labelFaces = null;
            modified.labelVertices = null;
        }

        while (angle-- > 0) {
            modified.rotate90();
        }

        if (this.recol_s && this.recol_d) {
            for (let i: number = 0; i < this.recol_s.length; i++) {
                modified.recolour(this.recol_s[i], this.recol_d[i]);
            }
        }

        if (scaled) {
            modified.resize(this.resizex, this.resizey, this.resizez);
        }

        if (translated) {
            modified.translate(this.offsety, this.offsetx, this.offsetz);
        }

        modified.calculateNormals((this.ambient & 0xff) + 64, (this.contrast & 0xff) * 5 + 768, -50, -10, -50, !this.sharelight);

        if (this.raiseobject === 1) {
            modified.objRaise = modified.minY;
        }

        LocType.mc2.put(modified, typecode);
        return modified;
    }
}
