import LruCache from '#/datastruct/LruCache.js';

import JagFile from '#/io/JagFile.js';
import Packet from '#/io/Packet.js';

import { Colour } from '#/graphics/Colour.js';
import Pix2D from '#/graphics/Pix2D.js';
import Pix3D from '#/dash3d/Pix3D.js';
import Model from '#/dash3d/Model.js';
import Pix32 from '#/graphics/Pix32.js';

import { TypedArray1d } from '#/util/Arrays.js';

export default class ObjType {
    static numDefinitions: number = 0;
    static idx: Int32Array | null = null;
    static dat: Packet | null = null;
    static recent: (ObjType | null)[] | null = null;
    static recentPos: number = 0;
    static memServer: boolean = true;
    static modelCache: LruCache<Model> = new LruCache(50);
    static spriteCache: LruCache<Pix32> = new LruCache(200);

    id: number = -1;

    model: number = 0;
    name: string | null = null;
    desc: string | null = null;
    recol_s: Uint16Array | null = null;
    recol_d: Uint16Array | null = null;
    zoom2d: number = 2000;
    xan2d: number = 0;
    yan2d: number = 0;
    zan2d: number = 0;
    xof2d: number = 0;
    yof2d: number = 0;
    stackable: boolean = false;
    cost: number = 1;
    members: boolean = false;
    op: (string | null)[] | null = null;
    iop: (string | null)[] | null = null;
    manwear: number = -1;
    manwear2: number = -1;
    manwearOffset: number = 0;
    womanwear: number = -1;
    womanwear2: number = -1;
    womanwearOffset: number = 0;
    manwear3: number = -1;
    womanwear3: number = -1;
    manhead: number = -1;
    manhead2: number = -1;
    womanhead: number = -1;
    womanhead2: number = -1;
    countobj: Uint16Array | null = null;
    countco: Uint16Array | null = null;
    certlink: number = -1;
    certtemplate: number = -1;
    resizex: number = 0;
    resizey: number = 0;
    resizez: number = 0;
    ambient: number = 0;
    contrast: number = 0;

    static init(config: JagFile, members: boolean): void {
        this.memServer = members;

        this.dat = new Packet(config.read('obj.dat'));
        const idx: Packet = new Packet(config.read('obj.idx'));

        this.numDefinitions = idx.g2();
        this.idx = new Int32Array(this.numDefinitions);

        let offset: number = 2;
        for (let id: number = 0; id < this.numDefinitions; id++) {
            this.idx[id] = offset;
            offset += idx.g2();
        }

        this.recent = new TypedArray1d(10, null);
        for (let id: number = 0; id < 10; id++) {
            this.recent[id] = new ObjType();
        }
    }

    static list(id: number): ObjType {
        if (!this.recent || !this.idx || !this.dat) {
            throw new Error();
        }

        for (let i: number = 0; i < 10; i++) {
            const type: ObjType | null = this.recent[i];
            if (type && type.id === id) {
                return type;
            }
        }

        this.recentPos = (this.recentPos + 1) % 10;

        const obj: ObjType = this.recent[this.recentPos]!;
        this.dat.pos = this.idx[id];
        obj.id = id;
        obj.reset();
        obj.decode(this.dat);

        if (obj.certtemplate !== -1) {
            obj.genCert();
        }

        if (!this.memServer && obj.members) {
            obj.name = 'Members Object';
            obj.desc = "Login to a members' server to use this object.";
            obj.op = null;
            obj.iop = null;
        }

        return obj;
    }

    private reset(): void {
        this.model = 0;
        this.name = null;
        this.desc = null;
        this.recol_s = null;
        this.recol_d = null;
        this.zoom2d = 2000;
        this.xan2d = 0;
        this.yan2d = 0;
        this.zan2d = 0;
        this.xof2d = 0;
        this.yof2d = 0;
        this.stackable = false;
        this.cost = 1;
        this.members = false;
        this.op = null;
        this.iop = null;
        this.manwear = -1;
        this.manwear2 = -1;
        this.manwearOffset = 0;
        this.womanwear = -1;
        this.womanwear2 = -1;
        this.womanwearOffset = 0;
        this.manwear3 = -1;
        this.womanwear3 = -1;
        this.manhead = -1;
        this.manhead2 = -1;
        this.womanhead = -1;
        this.womanhead2 = -1;
        this.countobj = null;
        this.countco = null;
        this.certlink = -1;
        this.certtemplate = -1;
        this.resizex = 128;
        this.resizey = 128;
        this.resizez = 128;
        this.ambient = 0;
        this.contrast = 0;
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
                this.name = dat.gjstr();
            } else if (code === 3) {
                this.desc = dat.gjstr();
            } else if (code === 4) {
                this.zoom2d = dat.g2();
            } else if (code === 5) {
                this.xan2d = dat.g2();
            } else if (code === 6) {
                this.yan2d = dat.g2();
            } else if (code === 7) {
                this.xof2d = dat.g2b();
                if (this.xof2d > 32767) {
                    this.xof2d -= 65536;
                }
            } else if (code === 8) {
                this.yof2d = dat.g2b();
                if (this.yof2d > 32767) {
                    this.yof2d -= 65536;
                }
            } else if (code === 10) {
                dat.pos += 2;
            } else if (code === 11) {
                this.stackable = true;
            } else if (code === 12) {
                this.cost = dat.g4();
            } else if (code === 16) {
                this.members = true;
            } else if (code === 23) {
                this.manwear = dat.g2();
                this.manwearOffset = dat.g1b();
            } else if (code === 24) {
                this.manwear2 = dat.g2();
            } else if (code === 25) {
                this.womanwear = dat.g2();
                this.womanwearOffset = dat.g1b();
            } else if (code === 26) {
                this.womanwear2 = dat.g2();
            } else if (code >= 30 && code < 35) {
                if (!this.op) {
                    this.op = new TypedArray1d(5, null);
                }

                this.op[code - 30] = dat.gjstr();
                if (this.op[code - 30]?.toLowerCase() === 'hidden') {
                    this.op[code - 30] = null;
                }
            } else if (code >= 35 && code < 40) {
                if (!this.iop) {
                    this.iop = new TypedArray1d(5, null);
                }
                this.iop[code - 35] = dat.gjstr();
            } else if (code === 40) {
                const count: number = dat.g1();
                this.recol_s = new Uint16Array(count);
                this.recol_d = new Uint16Array(count);

                for (let i: number = 0; i < count; i++) {
                    this.recol_s[i] = dat.g2();
                    this.recol_d[i] = dat.g2();
                }
            } else if (code === 78) {
                this.manwear3 = dat.g2();
            } else if (code === 79) {
                this.womanwear3 = dat.g2();
            } else if (code === 90) {
                this.manhead = dat.g2();
            } else if (code === 91) {
                this.womanhead = dat.g2();
            } else if (code === 92) {
                this.manhead2 = dat.g2();
            } else if (code === 93) {
                this.womanhead2 = dat.g2();
            } else if (code === 95) {
                this.zan2d = dat.g2();
            } else if (code === 97) {
                this.certlink = dat.g2();
            } else if (code === 98) {
                this.certtemplate = dat.g2();
            } else if (code >= 100 && code < 110) {
                if (!this.countobj || !this.countco) {
                    this.countobj = new Uint16Array(10);
                    this.countco = new Uint16Array(10);
                }

                this.countobj[code - 100] = dat.g2();
                this.countco[code - 100] = dat.g2();
            } else if (code === 110) {
                this.resizex = dat.g2();
            } else if (code === 111) {
                this.resizey = dat.g2();
            } else if (code === 112) {
                this.resizez = dat.g2();
            } else if (code === 113) {
                this.ambient = dat.g1b();
            } else if (code === 114) {
                this.contrast = dat.g1b() * 5;
            }
        }
    }

    private genCert(): void {
        const template: ObjType = ObjType.list(this.certtemplate);
        this.model = template.model;
        this.zoom2d = template.zoom2d;
        this.xan2d = template.xan2d;
        this.yan2d = template.yan2d;
        this.zan2d = template.zan2d;
        this.xof2d = template.xof2d;
        this.yof2d = template.yof2d;
        this.recol_s = template.recol_s;
        this.recol_d = template.recol_d;

        const link: ObjType = ObjType.list(this.certlink);
        this.name = link.name;
        this.members = link.members;
        this.cost = link.cost;

        let article: string = 'a';
        const c: string = (link.name || '').toLowerCase().charAt(0);
        if (c === 'a' || c === 'e' || c === 'i' || c === 'o' || c === 'u') {
            article = 'an';
        }
        this.desc = `Swap this note at any bank for ${article} ${link.name}.`;

        this.stackable = true;
    }

    getModelUnlit(count: number): Model | null {
        if (this.countobj && this.countco && count > 1) {
            let id: number = -1;
            for (let i: number = 0; i < 10; i++) {
                if (count >= this.countco[i] && this.countco[i] !== 0) {
                    id = this.countobj[i];
                }
            }

            if (id !== -1) {
                return ObjType.list(id).getModelUnlit(1);
            }
        }

        const model = Model.load(this.model);
        if (!model) {
            return null;
        }

        if (this.recol_s && this.recol_d) {
            for (let i: number = 0; i < this.recol_s.length; i++) {
                model.recolour(this.recol_s[i], this.recol_d[i]);
            }
        }

        return model;
    }

    getModelLit(count: number): Model | null {
        if (this.countobj && this.countco && count > 1) {
            let id: number = -1;
            for (let i: number = 0; i < 10; i++) {
                if (count >= this.countco[i] && this.countco[i] !== 0) {
                    id = this.countobj[i];
                }
            }

            if (id !== -1) {
                return ObjType.list(id).getModelLit(1);
            }
        }

        let model = ObjType.modelCache.find(BigInt(this.id));
        if (model) {
            return model;
        }

        model = Model.load(this.model);
        if (!model) {
            return null;
        }

        if (this.resizex !== 128 || this.resizey !== 128 || this.resizez !== 128) {
            model.resize(this.resizex, this.resizey, this.resizez);
        }

        if (this.recol_s && this.recol_d) {
            for (let i: number = 0; i < this.recol_s.length; i++) {
                model.recolour(this.recol_s[i], this.recol_d[i]);
            }
        }

        model.calculateNormals(this.ambient + 64, this.contrast + 768, -50, -10, -50, true);
        model.useAABBMouseCheck = true;

        ObjType.modelCache.put(model, BigInt(this.id));
        return model;
    }

    static getSprite(id: number, count: number, outlineRgb: number): Pix32 | null {
        if (outlineRgb === 0) {
            let icon = ObjType.spriteCache.find(BigInt(id));

            if (icon && icon.ohi !== count && icon.ohi !== -1) {
                icon.unlink();
                icon = null;
            }

            if (icon) {
                return icon;
            }
        }

        let obj: ObjType = ObjType.list(id);

        if (!obj.countobj) {
            count = -1;
        }

        if (obj.countobj && obj.countco && count > 1) {
            let countobj: number = -1;
            for (let i: number = 0; i < 10; i++) {
                if (count >= obj.countco[i] && obj.countco[i] !== 0) {
                    countobj = obj.countobj[i];
                }
            }

            if (countobj !== -1) {
                obj = ObjType.list(countobj);
            }
        }

        const model = obj.getModelLit(1);
        if (!model) {
            return null;
        }

        let linkedIcon: Pix32 | null = null;
        if (obj.certtemplate !== -1) {
            linkedIcon = this.getSprite(obj.certlink, 10, -1);

            if (!linkedIcon) {
                return null;
            }
        }

        const icon: Pix32 = new Pix32(32, 32);

        const _cx: number = Pix3D.originX;
        const _cy: number = Pix3D.originY;
        const _loff: Int32Array = Pix3D.scanline;
        const _data: Int32Array = Pix2D.pixels;
        const _w: number = Pix2D.width;
        const _h: number = Pix2D.height;
        const _l: number = Pix2D.clipMinX;
        const _r: number = Pix2D.clipMaxX;
        const _t: number = Pix2D.clipMinY;
        const _b: number = Pix2D.clipMaxY;

        Pix3D.lowDetail = false;
        Pix2D.setPixels(icon.data, 32, 32);
        Pix2D.fillRect(0, 0, 32, 32, Colour.BLACK);
        Pix3D.setRenderClipping();

        let zoom = obj.zoom2d;
        if (outlineRgb === -1) {
            zoom = (zoom * 1.5) | 0;
        } else if (outlineRgb > 0) {
            zoom = (zoom * 1.04) | 0;
        }

        const sinPitch: number = (Pix3D.sinTable[obj.xan2d] * zoom) >> 16;
        const cosPitch: number = (Pix3D.cosTable[obj.xan2d] * zoom) >> 16;

        model.objRender(0, obj.yan2d, obj.zan2d, obj.xan2d, obj.xof2d, sinPitch + ((model.minY / 2) | 0) + obj.yof2d, cosPitch + obj.yof2d);

        // add outline
        for (let x: number = 31; x >= 0; x--) {
            for (let y: number = 31; y >= 0; y--) {
                if (icon.data[x + y * 32] !== 0) {
                    continue;
                }

                if (x > 0 && icon.data[x + y * 32 - 1] > 1) {
                    icon.data[x + y * 32] = 1;
                } else if (y > 0 && icon.data[x + (y - 1) * 32] > 1) {
                    icon.data[x + y * 32] = 1;
                } else if (x < 31 && icon.data[x + y * 32 + 1] > 1) {
                    icon.data[x + y * 32] = 1;
                } else if (y < 31 && icon.data[x + (y + 1) * 32] > 1) {
                    icon.data[x + y * 32] = 1;
                }
            }
        }

        if (outlineRgb > 0) {
            // add outline
            for (let x: number = 31; x >= 0; x--) {
                for (let y: number = 31; y >= 0; y--) {
                    if (icon.data[x + y * 32] !== 0) {
                        continue;
                    }

                    if (x > 0 && icon.data[x + y * 32 - 1] === 1) {
                        icon.data[x + y * 32] = outlineRgb;
                    } else if (y > 0 && icon.data[x + (y - 1) * 32] === 1) {
                        icon.data[x + y * 32] = outlineRgb;
                    } else if (x < 31 && icon.data[x + y * 32 + 1] === 1) {
                        icon.data[x + y * 32] = outlineRgb;
                    } else if (y < 31 && icon.data[x + (y + 1) * 32] === 1) {
                        icon.data[x + y * 32] = outlineRgb;
                    }
                }
            }
        } else if (outlineRgb === 0) {
            // add shadow
            for (let x: number = 31; x >= 0; x--) {
                for (let y: number = 31; y >= 0; y--) {
                    if (icon.data[x + y * 32] === 0 && x > 0 && y > 0 && icon.data[x + (y - 1) * 32 - 1] > 0) {
                        icon.data[x + y * 32] = 3153952;
                    }
                }
            }
        }

        if (linkedIcon && obj.certtemplate !== -1) {
            const w: number = linkedIcon.owi;
            const h: number = linkedIcon.ohi;
            linkedIcon.owi = 32;
            linkedIcon.ohi = 32;
            linkedIcon.plotSprite(0, 0);
            linkedIcon.owi = w;
            linkedIcon.ohi = h;
        }

        if (outlineRgb === 0) {
            ObjType.spriteCache.put(icon, BigInt(id));
        }

        Pix2D.setPixels(_data, _w, _h);
        Pix2D.setClipping(_l, _t, _r, _b);
        Pix3D.originX = _cx;
        Pix3D.originY = _cy;
        Pix3D.scanline = _loff;
        Pix3D.lowDetail = true;

        if (obj.stackable) {
            icon.owi = 33;
        } else {
            icon.owi = 32;
        }

        icon.ohi = count;
        return icon;
    }

    checkWearModel(gender: number): boolean {
        let wear = this.manwear;
        let wear2 = this.manwear2;
        let wear3 = this.manwear3;
        if (gender == 1) {
            wear = this.womanwear;
            wear2 = this.womanwear2;
            wear3 = this.womanwear3;
        }

        if (wear == -1) {
            return true;
        }

        let ready = true;
        if (!Model.requestDownload(wear)) {
            ready = false;
        }
        if (wear2 != -1 && !Model.requestDownload(wear2)) {
            ready = false;
        }
        if (wear3 != -1 && !Model.requestDownload(wear3)) {
            ready = false;
        }
        return ready;
    }

    getWearModelNoCheck(gender: number): Model | null {
        let id1: number = this.manwear;
        if (gender === 1) {
            id1 = this.womanwear;
        }

        if (id1 === -1) {
            return null;
        }

        let id2: number = this.manwear2;
        let id3: number = this.manwear3;
        if (gender === 1) {
            id2 = this.womanwear2;
            id3 = this.womanwear3;
        }

        let model: Model | null = Model.load(id1);
        if (!model) {
            return null;
        }

        if (id2 !== -1) {
            const model2: Model | null = Model.load(id2);
            if (!model2) {
                return null;
            }

            if (id3 === -1) {
                const models: Model[] = [model, model2];
                model = Model.combineForAnim(models, 2);
            } else {
                const model3: Model | null = Model.load(id3);
                if (!model3) {
                    return null;
                }

                const models: Model[] = [model, model2, model3];
                model = Model.combineForAnim(models, 3);
            }
        }

        if (gender === 0 && this.manwearOffset !== 0) {
            model.translate(this.manwearOffset, 0, 0);
        } else if (gender === 1 && this.womanwearOffset !== 0) {
            model.translate(this.womanwearOffset, 0, 0);
        }

        if (this.recol_s && this.recol_d) {
            for (let i: number = 0; i < this.recol_s.length; i++) {
                model.recolour(this.recol_s[i], this.recol_d[i]);
            }
        }

        return model;
    }

    checkHeadModel(gender: number): boolean {
        let head = this.manhead;
        let head2 = this.manhead2;
        if (gender == 1) {
            head = this.womanhead;
            head2 = this.womanhead2;
        }

        if (head == -1) {
            return true;
        }

        let ready = true;
        if (!Model.requestDownload(head)) {
            ready = false;
        }
        if (head2 != -1 && !Model.requestDownload(head2)) {
            ready = false;
        }
        return ready;
    }

    getHeadModelNoCheck(gender: number): Model | null {
        let head1: number = this.manhead;
        if (gender === 1) {
            head1 = this.womanhead;
        }

        if (head1 === -1) {
            return null;
        }

        let head2: number = this.manhead2;
        if (gender === 1) {
            head2 = this.womanhead2;
        }

        let model: Model | null = Model.load(head1);
        if (!model) {
            return null;
        }

        if (head2 !== -1) {
            const model2: Model | null = Model.load(head2);
            if (!model2) {
                return null;
            }

            const models: Model[] = [model, model2];
            model = Model.combineForAnim(models, 2);
        }

        if (this.recol_s && this.recol_d) {
            for (let i: number = 0; i < this.recol_s.length; i++) {
                model.recolour(this.recol_s[i], this.recol_d[i]);
            }
        }

        return model;
    }
}
