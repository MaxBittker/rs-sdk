import ModelSource from '#/dash3d/ModelSource.js';

export default class Wall {
    readonly y: number;
    readonly x: number;
    readonly z: number;
    readonly angle1: number;
    readonly angle2: number;
    model1: ModelSource | null;
    model2: ModelSource | null;
    readonly typecode: number;
    readonly typecode2: number;

    constructor(y: number, x: number, z: number, angle1: number, angle2: number, model1: ModelSource | null, model2: ModelSource | null, typecode: number, typecode2: number) {
        this.y = y;
        this.x = x;
        this.z = z;
        this.angle1 = angle1;
        this.angle2 = angle2;
        this.model1 = model1;
        this.model2 = model2;
        this.typecode = typecode;
        this.typecode2 = typecode2;
    }
}
