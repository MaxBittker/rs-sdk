import SpotAnimType from '#/config/SpotAnimType.js';
import Model from '#/dash3d/Model.ts';

import ModelSource from '#/dash3d/ModelSource.ts';

export default class MapSpotAnim extends ModelSource {
    readonly spotType: SpotAnimType;
    readonly spotLevel: number;
    readonly x: number;
    readonly z: number;
    readonly y: number;
    readonly startCycle: number;

    // runtime
    seqComplete: boolean = false;
    seqFrame: number = 0;
    seqCycle: number = 0;

    constructor(id: number, level: number, x: number, z: number, y: number, cycle: number, delay: number) {
        super();

        this.spotType = SpotAnimType.types[id];
        this.spotLevel = level;
        this.x = x;
        this.z = z;
        this.y = y;
        this.startCycle = cycle + delay;
    }

    update(delta: number): void {
        if (!this.spotType.seq || !this.spotType.seq.delay) {
            return;
        }

        for (this.seqCycle += delta; this.seqCycle > this.spotType.seq.getFrameDuration(this.seqFrame); ) {
            this.seqCycle -= this.spotType.seq.getFrameDuration(this.seqFrame) + 1;
            this.seqFrame++;

            if (this.seqFrame >= this.spotType.seq.frameCount) {
                this.seqFrame = 0;
                this.seqComplete = true;
            }
        }
    }

    getModel(): Model | null {
        const tmp: Model | null = this.spotType.getModel();
        if (!tmp) {
            return null;
        }

        const model: Model = Model.modelShareColored(tmp, true, !this.spotType.animHasAlpha, false);

        if (!this.seqComplete && this.spotType.seq && this.spotType.seq.frames) {
            model.createLabelReferences();
            model.applyTransform(this.spotType.seq.frames[this.seqFrame]);
            model.labelFaces = null;
            model.labelVertices = null;
        }

        if (this.spotType.resizeh !== 128 || this.spotType.resizev !== 128) {
            model.scale(this.spotType.resizeh, this.spotType.resizev, this.spotType.resizeh);
        }

        if (this.spotType.angle !== 0) {
            if (this.spotType.angle === 90) {
                model.rotateY90();
            } else if (this.spotType.angle === 180) {
                model.rotateY90();
                model.rotateY90();
            } else if (this.spotType.angle === 270) {
                model.rotateY90();
                model.rotateY90();
                model.rotateY90();
            }
        }

        model.calculateNormals(64 + this.spotType.ambient, 850 + this.spotType.contrast, -30, -50, -30, true);
        return model;
    }
}
