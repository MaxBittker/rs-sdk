import DoublyLinkable from '#/datastruct/DoublyLinkable.js';
import type VertexNormal from '#/dash3d/VertexNormal.js';
import type Model from '#/dash3d/Model.ts';

export default class ModelSource extends DoublyLinkable {
    public vertexNormal: (VertexNormal | null)[] | null = null;
    public minY: number = 1000;

    draw(loopCycle: number, yaw: number, sinEyePitch: number, cosEyePitch: number, sinEyeYaw: number, cosEyeYaw: number, relativeX: number, relativeY: number, relativeZ: number, typecode: number): void {
        const model = this.getModel(loopCycle);
        if (model) {
            this.minY = model.minY;
            model.draw(0, yaw, sinEyePitch, cosEyePitch, sinEyeYaw, cosEyeYaw, relativeX, relativeY, relativeZ, typecode);
        }
    }

    getModel(_loopCycle: number): Model | null {
        return null;
    }
}
