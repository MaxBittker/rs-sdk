import NonPathingEntity from '#lostcity/entity/NonPathingEntity.js';
import EntityLifeCycle from '#lostcity/entity/EntityLifeCycle.js';

export default class Obj extends NonPathingEntity {
    // constructor properties
    type: number;
    count: number;

    constructor(level: number, x: number, z: number, lifecycle: EntityLifeCycle, type: number, count: number) {
        super(level, x, z, 1, 1, lifecycle);
        this.type = type;
        this.count = count;
    }
}
