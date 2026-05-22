import SpotType from '#/config/SpotType.js';
import Model from '#/dash3d/Model.js';

import AnimFrame from '#/dash3d/AnimFrame.js';
import ModelSource from '#/dash3d/ModelSource.js';

export default class MapSpotAnim extends ModelSource {
    readonly type: SpotType;
    readonly level: number;
    readonly x: number;
    readonly z: number;
    readonly y: number;
    readonly startCycle: number;

    animComplete: boolean = false;
    animFrame: number = 0;
    animCycle: number = 0;

    constructor(id: number, level: number, x: number, z: number, y: number, cycle: number, delay: number) {
        super();

        this.type = SpotType.list[id];
        this.level = level;
        this.x = x;
        this.z = z;
        this.y = y;
        this.startCycle = cycle + delay;
    }

    update(delta: number): void {
        if (!this.type.seq) {
            return;
        }

        for (this.animCycle += delta; this.animCycle > this.type.seq.getDelay(this.animFrame); ) {
            this.animCycle -= this.type.seq.getDelay(this.animFrame) + 1;
            this.animFrame++;

            if (this.animFrame >= this.type.seq.numFrames) {
                this.animFrame = 0;
                this.animComplete = true;
            }
        }
    }

    override getTempModel(): Model | null {
        const tmp: Model | null = this.type.getTempModel2();
        if (!tmp) {
            return null;
        }

        let frame = -1;
        if (this.type.seq && this.type.seq.frames) {
            frame = this.type.seq.frames[this.animFrame];
        }

        const model: Model = Model.copyForAnim(tmp, true, AnimFrame.animateTransparencies(frame), false);

        if (!this.animComplete) {
            model.prepareAnim();
            model.animate(frame);
            model.labelFaces = null;
            model.labelVertices = null;
        }

        if (this.type.resizeh !== 128 || this.type.resizev !== 128) {
            model.resize(this.type.resizeh, this.type.resizev, this.type.resizeh);
        }

        if (this.type.angle !== 0) {
            if (this.type.angle === 90) {
                model.rotate90();
            } else if (this.type.angle === 180) {
                model.rotate90();
                model.rotate90();
            } else if (this.type.angle === 270) {
                model.rotate90();
                model.rotate90();
                model.rotate90();
            }
        }

        model.calculateNormals(64 + this.type.ambient, 850 + this.type.contrast, -30, -50, -30, true);
        return model;
    }
}
