import Model from '#/dash3d/Model.js';

import JagFile from '#/io/JagFile.js';
import Packet from '#/io/Packet.js';

import { TypedArray1d } from '#/util/Arrays.js';

export default class IdkType {
    static numDefinitions: number = 0;
    static list: IdkType[] = [];

    part: number = -1;
    model: Int32Array | null = null;
    recol_s: Int32Array = new Int32Array(6);
    recol_d: Int32Array = new Int32Array(6);
    head: Int32Array = new Int32Array(5).fill(-1);
    disable: boolean = false;

    static init(config: JagFile): void {
        const dat: Packet = new Packet(config.read('idk.dat'));

        this.numDefinitions = dat.g2();
        this.list = new Array(this.numDefinitions);

        for (let id: number = 0; id < this.numDefinitions; id++) {
            if (!this.list[id]) {
                this.list[id] = new IdkType();
            }

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
                this.part = dat.g1();
            } else if (code === 2) {
                const count: number = dat.g1();
                this.model = new Int32Array(count);

                for (let i: number = 0; i < count; i++) {
                    this.model[i] = dat.g2();
                }
            } else if (code === 3) {
                this.disable = true;
            } else if (code >= 40 && code < 50) {
                this.recol_s[code - 40] = dat.g2();
            } else if (code >= 50 && code < 60) {
                this.recol_d[code - 50] = dat.g2();
            } else if (code >= 60 && code < 70) {
                this.head[code - 60] = dat.g2();
            } else {
                console.log('Error unrecognised config code: ', code);
            }
        }
    }

    checkModel(): boolean {
        if (!this.model) {
            return true;
        }

        let ready = true;

        for (let i = 0; i < this.model.length; i++) {
            if (!Model.requestDownload(this.model[i])) {
                ready = false;
            }
        }

        return ready;
    }

    getModelNoCheck(): Model | null {
        if (!this.model) {
            return null;
        }

        const models: (Model | null)[] = new TypedArray1d(this.model.length, null);
        for (let i: number = 0; i < this.model.length; i++) {
            models[i] = Model.load(this.model[i]);
        }

        let model: Model | null;
        if (models.length === 1) {
            model = models[0];
        } else {
            model = Model.combineForAnim(models, models.length);
        }

        for (let i: number = 0; i < 6 && this.recol_s[i] !== 0; i++) {
            model?.recolour(this.recol_s[i], this.recol_d[i]);
        }

        return model;
    }

    checkHead(): boolean {
        let ready = true;

        for (let i = 0; i < this.head.length; i++) {
            if (this.head[i] != -1 && !Model.requestDownload(this.head[i])) {
                ready = false;
            }
        }

        return ready;
    }

    getHeadNoCheck(): Model {
        let count: number = 0;

        const models: (Model | null)[] = new TypedArray1d(5, null);
        for (let i: number = 0; i < 5; i++) {
            if (this.head[i] !== -1) {
                models[count++] = Model.load(this.head[i]);
            }
        }

        const model: Model = Model.combineForAnim(models, count);
        for (let i: number = 0; i < 6 && this.recol_s[i] !== 0; i++) {
            model.recolour(this.recol_s[i], this.recol_d[i]);
        }

        return model;
    }
}
