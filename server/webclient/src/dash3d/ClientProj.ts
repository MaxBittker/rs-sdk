import SpotType from '#/config/SpotType.js';

import AnimFrame from '#/dash3d/AnimFrame.js';
import Model from '#/dash3d/Model.js';
import ModelSource from '#/dash3d/ModelSource.js';

export default class ClientProj extends ModelSource {
    readonly spotanim: SpotType;
    readonly level: number;
    readonly srcX: number;
    readonly srcZ: number;
    readonly h1: number;
    readonly h2: number;
    readonly t1: number;
    readonly t2: number;
    readonly angle: number;
    readonly startpos: number;
    readonly target: number;

    mobile: boolean = false;
    x: number = 0.0;
    z: number = 0.0;
    y: number = 0.0;
    velocityX: number = 0.0;
    velocityZ: number = 0.0;
    velocity: number = 0.0;
    velocityY: number = 0.0;
    accelerationY: number = 0.0;
    yaw: number = 0;
    pitch: number = 0;
    animFrame: number = 0;
    animCycle: number = 0;

    constructor(spotanim: number, level: number, srcX: number, h1: number, srcZ: number, t1: number, t2: number, angle: number, startpos: number, target: number, h2: number) {
        super();

        this.spotanim = SpotType.list[spotanim];
        this.level = level;
        this.srcX = srcX;
        this.srcZ = srcZ;
        this.h1 = h1;
        this.t1 = t1;
        this.t2 = t2;
        this.angle = angle;
        this.startpos = startpos;
        this.target = target;
        this.h2 = h2;
        this.mobile = false;
    }

    setTarget(dstX: number, dstY: number, dstZ: number, cycle: number): void {
        if (!this.mobile) {
            const dx: number = dstX - this.srcX;
            const dz: number = dstZ - this.srcZ;
            const d: number = Math.sqrt(dx * dx + dz * dz);

            this.x = this.srcX + (dx * this.startpos) / d;
            this.z = this.srcZ + (dz * this.startpos) / d;
            this.y = this.h1;
        }

        const dt: number = this.t2 + 1 - cycle;
        this.velocityX = (dstX - this.x) / dt;
        this.velocityZ = (dstZ - this.z) / dt;
        this.velocity = Math.sqrt(this.velocityX * this.velocityX + this.velocityZ * this.velocityZ);
        if (!this.mobile) {
            this.velocityY = -this.velocity * Math.tan(this.angle * 0.02454369);
        }
        this.accelerationY = ((dstY - this.y - this.velocityY * dt) * 2.0) / (dt * dt);
    }

    move(delta: number): void {
        this.mobile = true;
        this.x += this.velocityX * delta;
        this.z += this.velocityZ * delta;
        this.y += this.velocityY * delta + this.accelerationY * 0.5 * delta * delta;
        this.velocityY += this.accelerationY * delta;
        this.yaw = ((Math.atan2(this.velocityX, this.velocityZ) * 325.949 + 1024) | 0) & 0x7ff;
        this.pitch = ((Math.atan2(this.velocityY, this.velocity) * 325.949) | 0) & 0x7ff;

        if (this.spotanim.seq) {
            this.animCycle += delta;

            while (this.animCycle > this.spotanim.seq.getDelay(this.animFrame)) {
                this.animCycle -= this.spotanim.seq.getDelay(this.animFrame) + 1;
                this.animFrame++;
                if (this.animFrame >= this.spotanim.seq.numFrames) {
                    this.animFrame = 0;
                }
            }
        }
    }

    override getTempModel(): Model | null {
        const spotModel: Model | null = this.spotanim.getTempModel2();
        if (!spotModel) {
            return null;
        }

        let frame = -1;
        if (this.spotanim.seq && this.spotanim.seq.frames) {
            frame = this.spotanim.seq.frames[this.animFrame];
        }

        const model: Model = Model.copyForAnim(spotModel, true, AnimFrame.animateTransparencies(frame), false);

        if (frame !== -1) {
            model.prepareAnim();
            model.animate(frame);
            model.labelFaces = null;
            model.labelVertices = null;
        }

        if (this.spotanim.resizeh !== 128 || this.spotanim.resizev !== 128) {
            model.resize(this.spotanim.resizeh, this.spotanim.resizev, this.spotanim.resizeh);
        }

        model.rotateXAxis(this.pitch);
        model.calculateNormals(64 + this.spotanim.ambient, 850 + this.spotanim.contrast, -30, -50, -30, true);
        return model;
    }
}
