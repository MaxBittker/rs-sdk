import NonPathingEntity from '#lostcity/entity/NonPathingEntity.js';
import EntityLifeCycle from '#lostcity/entity/EntityLifeCycle.js';

export default class Loc extends NonPathingEntity {
    // constructor properties
    private readonly info: number;

    constructor(level: number, x: number, z: number, width: number, length: number, lifecycle: EntityLifeCycle, type: number, shape: number, angle: number) {
        super(level, x, z, width, length, lifecycle);
        // 16383, 31, 3
        this.info = (type & 0x3fff) | (shape & 0x1f) << 14 | (angle & 0x3) << 19;
    }

    get type(): number {
        return this.info & 0x3fff;
    }

    get shape(): number {
        return (this.info >> 14) & 0x1f;
    }

    get angle(): number {
        return (this.info >> 19) & 0x3;
    }
}
