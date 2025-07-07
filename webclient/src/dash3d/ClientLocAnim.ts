import LocType from '#/config/LocType.ts';
import SeqType from '#/config/SeqType.js';
import type Model from '#/dash3d/Model.ts';

import ModelSource from '#/dash3d/ModelSource.ts';

export default class ClientLocAnim extends ModelSource {
    readonly index: number;
    readonly shape: number;
    readonly angle: number;
    readonly heightmapSW: number;
    readonly heightmapSE: number;
    readonly heightmapNE: number;
    readonly heightmapNW: number;
    seq: SeqType | null;
    seqFrame: number;
    seqCycle: number;

    constructor(loopCycle: number, index: number, shape: number, angle: number, heightmapSW: number, heightmapSE: number, heightmapNE: number, heightmapNW: number, seq: number, randomFrame: boolean) {
        super();

        this.index = index;
        this.shape = shape;
        this.angle = angle;
        this.heightmapSW = heightmapSW;
        this.heightmapSE = heightmapSE;
        this.heightmapNE = heightmapNE;
        this.heightmapNW = heightmapNW;

        this.seq = SeqType.types[seq];
        this.seqFrame = 0;
        this.seqCycle = loopCycle;

        if (randomFrame && this.seq.replayoff !== -1 && this.seq.delay) {
            this.seqFrame = (Math.random() * this.seq.frameCount) | 0;
            this.seqCycle -= (Math.random() * this.seq.getFrameDuration(this.seqFrame)) | 0;
        }
    }

    getModel(loopCycle: number): Model | null {
        this.seqCycle = loopCycle;

        if (this.seq != null) {
			let delta = loopCycle - this.seqCycle;
			if (delta > 100 && this.seq.replayoff > 0) {
				delta = 100;
			}

			while (delta > this.seq.getFrameDuration(this.seqFrame)) {
				delta -= this.seq.getFrameDuration((this.seqFrame));
				this.seqFrame++;

				if (this.seqFrame < this.seq.frameCount) {
					this.seqFrame -= this.seq.replayoff;
				}

				if (this.seqFrame >= 0 && this.seqFrame < this.seq.frameCount) {
					continue;
				}

				this.seq = null;
				break;
			}

			this.seqCycle = loopCycle - delta;
		}

		let transformId = -1;
		if (this.seq != null) {
			transformId = this.seq.frames![this.seqFrame];
		}

		const loc = LocType.get(this.index);
		return loc.getModel(this.shape, this.angle, this.heightmapSW, this.heightmapSE, this.heightmapNE, this.heightmapNW, transformId);
    }
}
