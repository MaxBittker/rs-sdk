import EntityLifeCycle from '#lostcity/entity/EntityLifeCycle.js';

export default abstract class Entity {
    // constructor
    level: number;
    x: number;
    z: number;
    readonly width: number;
    readonly length: number;
    readonly lifecycle: EntityLifeCycle;

    // runtime
    lifecycleTick: number = 0;

    protected constructor(level: number, x: number, z: number, width: number, length: number, lifecycle: EntityLifeCycle) {
        this.level = level;
        this.x = x;
        this.z = z;
        this.width = width;
        this.length = length;
        this.lifecycle = lifecycle;
    }

    abstract resetEntity(respawn: boolean): void;

    updateLifeCycle(tick: number): boolean {
        return this.lifecycleTick === tick && this.lifecycle !== EntityLifeCycle.FOREVER;
    }

    checkLifeCycle(tick: number): boolean {
        if (this.lifecycle === EntityLifeCycle.FOREVER) {
            return true;
        }
        if (this.lifecycle === EntityLifeCycle.RESPAWN) {
            return this.lifecycleTick < tick;
        }
        if (this.lifecycle === EntityLifeCycle.DESPAWN) {
            return this.lifecycleTick > tick;
        }
        return false;
    }

    setLifeCycle(tick: number): void {
        this.lifecycleTick = tick;
    }
}
