import Linkable from '#/util/Linkable.js';

export default class CameraInfo extends Linkable {
    readonly type: number;
    readonly camX: number;
    readonly camZ: number;
    readonly height: number;
    readonly rotationSpeed: number;
    readonly rotationMultiplier: number;

    constructor(type: number, camX: number, camZ: number, height: number, rotationSpeed: number, rotationMultiplier: number) {
        super();
        this.type = type;
        this.camX = camX;
        this.camZ = camZ;
        this.height = height;
        this.rotationSpeed = rotationSpeed;
        this.rotationMultiplier = rotationMultiplier;
    }
}
