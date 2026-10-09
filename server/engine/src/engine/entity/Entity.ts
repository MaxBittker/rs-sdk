import { EntityLifeCycle } from '#/engine/entity/EntityLifeCycle.js';
import World from '#/engine/World.js';
import DoublyLinkable from '#/datastruct/DoublyLinkable.js';

export default abstract class Entity extends DoublyLinkable {
    // constructor
    level: number;
    x: number;
    z: number;
    isActive: boolean;
    readonly width: number;
    readonly length: number;
    readonly lifecycle: EntityLifeCycle;

    // runtime
    lifecycleTick: number = -1;
    lastLifecycleTick: number = -1;

    protected constructor(level: number, x: number, z: number, width: number, length: number, lifecycle: EntityLifeCycle) {
        super();
        this.level = level;
        this.x = x;
        this.z = z;
        this.width = width;
        this.length = length;
        this.lifecycle = lifecycle;
        this.isActive = false;
    }

    abstract resetEntity(respawn: boolean): void;

    isValid(_hash64?: bigint): boolean {
        return this.isActive;
    }

    setLifeCycle(tick: number): void {
        if (tick === -1) {
            this.lifecycleTick = tick;
        } else {
            this.lifecycleTick = Math.max(1, tick);
        }
        this.lastLifecycleTick = World.currentTick;
    }
}
