import Linkable2 from '#/datastruct/Linkable2.js';
import type PointNormal from '#/dash3d/PointNormal.js';
import type Model from '#/dash3d/Model.js';

export default class ModelSource extends Linkable2 {
    public pointNormal: (PointNormal | null)[] | null = null;
    public minY: number = 1000;

    worldRender(yaw: number, sinEyePitch: number, cosEyePitch: number, sinEyeYaw: number, cosEyeYaw: number, relativeX: number, relativeY: number, relativeZ: number, typecode: number): void {
        const model = this.getTempModel();
        if (model) {
            this.minY = model.minY;
            model.worldRender(yaw, sinEyePitch, cosEyePitch, sinEyeYaw, cosEyeYaw, relativeX, relativeY, relativeZ, typecode);
        }
    }

    getTempModel(): Model | null {
        return null;
    }
}
