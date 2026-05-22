import { locShapeLayer } from '#/engine/routefinder/index.js';

import { EntityLifeCycle } from '#/engine/entity/EntityLifeCycle.js';
import NonPathingEntity from '#/engine/entity/NonPathingEntity.js';
import World from '#/engine/World.js';

export default class Loc extends NonPathingEntity {
    // constructor properties
    private readonly baseInfo: number;

    // runtime properties
    private currentInfo: number;

    constructor(level: number, x: number, z: number, width: number, length: number, lifecycle: EntityLifeCycle, type: number, shape: number, angle: number) {
        super(level, x, z, width, length, lifecycle);
        this.baseInfo = this.packInfo(type, shape, angle);
        this.currentInfo = this.baseInfo;
    }

    private packInfo(type: number, shape: number, angle: number): number {
        const layer: number = locShapeLayer(shape);
        // 16383, 31, 3, 3
        return (type & 0x3fff) | ((shape & 0x1f) << 14) | ((angle & 0x3) << 19) | ((layer & 0x3) << 21);
    }

    isChanged(): boolean {
        return this.currentInfo !== this.baseInfo;
    }

    get type(): number {
        return this.currentInfo & 0x3fff;
    }

    get shape(): number {
        return (this.currentInfo >> 14) & 0x1f;
    }

    get angle(): number {
        return (this.currentInfo >> 19) & 0x3;
    }

    get layer(): number {
        return (this.baseInfo >> 21) & 0x3;
    }

    change(type: number, shape: number, angle: number) {
        this.currentInfo = this.packInfo(type, shape, angle);
    }

    revert() {
        this.currentInfo = this.baseInfo;
    }

    turn() {
        // Decrement lifecycle tick
        --this.lifecycleTick;
        if (this.lifecycleTick === 0) {
            if (this.lifecycle === EntityLifeCycle.DESPAWN && this.isActive) {
                World.removeLoc(this, 0);
            } else if (this.lifecycle === EntityLifeCycle.RESPAWN && this.isChanged() && this.isActive) {
                World.revertLoc(this);
            } else if (this.lifecycle === EntityLifeCycle.RESPAWN && !this.isActive) {
                World.addLoc(this, 0);
            } else {
                // Fail safe in case no conditions are met (should never happen)
                console.error(`Loc is tracked but there is no event. Type: ${this.type}, Coords: ${this.x}, ${this.z}`);
                this.setLifeCycle(-1);
            }
        } else if (this.lifecycleTick < 0) {
            // Fail safe in case this is tracked but isn't supposed to be
            console.error(`Loc is tracked but has a negative lifecycle tick. Type: ${this.type}, Coords: ${this.x}, ${this.z}`);
            this.setLifeCycle(-1);
        }
    }
}
