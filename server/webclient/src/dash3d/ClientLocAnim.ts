import { Client } from '#/client/Client.js';

import LocType from '#/config/LocType.js';
import SeqType from '#/config/SeqType.js';
import VarBitType from '#/config/VarBitType.js';

import type Model from '#/dash3d/Model.js';
import ModelSource from '#/dash3d/ModelSource.js';

export default class ClientLocAnim extends ModelSource {
    static app: Client;

    readonly index: number;
    readonly shape: number;
    readonly angle: number;
    readonly heightSW: number;
    readonly heightSE: number;
    readonly heightNE: number;
    readonly heightNW: number;
    readonly multivarbit: number;
    readonly multiloc: Int32Array | null;
    anim: SeqType | null = null;
    animFrame: number = 0;
    animCycle: number = 0;

    constructor(index: number, shape: number, angle: number, heightSW: number, heightSE: number, heightNE: number, heightNW: number, seq: number, randomFrame: boolean) {
        super();

        this.index = index;
        this.shape = shape;
        this.angle = angle;

        this.heightSW = heightSW;
        this.heightSE = heightSE;
        this.heightNE = heightNE;
        this.heightNW = heightNW;

        if (seq !== -1) {
            this.anim = SeqType.list[seq];
            this.animFrame = 0;
            this.animCycle = Client.loopCycle;

            if (randomFrame && this.anim.loops !== -1) {
                this.animFrame = (Math.random() * this.anim.numFrames) | 0;
                this.animCycle -= (Math.random() * this.anim.getDelay(this.animFrame)) | 0;
            }
        }

        const loc = LocType.list(index);
        this.multivarbit = loc.multivarbit;
        this.multiloc = loc.multiloc;
    }

    override getTempModel(): Model | null {
        if (this.anim) {
            let delta = Client.loopCycle - this.animCycle;
            if (delta > 100 && this.anim.loops > 0) {
                delta = 100;
            }

            while (delta > this.anim.getDelay(this.animFrame)) {
                delta -= this.anim.getDelay(this.animFrame);
                this.animFrame++;

                if (this.animFrame < this.anim.numFrames) {
                    continue;
                }

                this.animFrame -= this.anim.loops;

                if (this.animFrame < 0 || this.animFrame >= this.anim.numFrames) {
                    this.anim = null;
                    break;
                }
            }

            this.animCycle = Client.loopCycle - delta;
        }

        let frame = -1;
        if (this.anim && this.anim.frames && typeof this.anim.frames[this.animFrame] !== 'undefined') {
            frame = this.anim.frames[this.animFrame];
        }

        let loc: LocType;
        if (this.multiloc === null) {
            loc = LocType.list(this.index);
        } else {
            const varbit = VarBitType.list[this.multivarbit];
            const basevar = varbit.basevar;
            const startbit = varbit.startbit;
            const endbit = varbit.endbit;
            const mask = Client.readbit[endbit - startbit];
            const index = (ClientLocAnim.app.var[basevar] >> startbit) & mask;

            if (index < 0 || index >= this.multiloc.length || this.multiloc[index] === -1) {
                return null;
            }

            loc = LocType.list(this.multiloc[index]);
        }

        return loc.getModel(this.shape, this.angle, this.heightSW, this.heightSE, this.heightNE, this.heightNW, frame);
    }
}
