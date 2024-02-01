import { CollisionFlag, CollisionFlagMap } from '@2004scape/rsmod-pathfinder';

export default class FloorCollider {
    private readonly flags: CollisionFlagMap;

    constructor(flags: CollisionFlagMap) {
        this.flags = flags;
    }

    change(x: number, z: number, level: number, add: boolean): void {
        if (add) {
            this.flags.add(x, z, level, CollisionFlag.FLOOR);
        } else {
            this.flags.remove(x, z, level, CollisionFlag.FLOOR);
        }
    }
}
