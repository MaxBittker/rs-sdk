import Npc from '#lostcity/entity/Npc.js';
import Player from '#lostcity/entity/Player.js';
import Entity from '#lostcity/entity/Entity.js';

// inspired by https://github.com/rsmod/rsmod/blob/master/game/src/main/kotlin/org/rsmod/game/model/mob/list/MobList.kt
abstract class EntityList<T extends Entity> {
    // constructor
    private readonly entities: (T | null)[];
    private readonly free: Set<number>;
    private readonly taken: Set<number>;
    protected readonly indexPadding: number;
    protected readonly ids: Int32Array;

    // runtime
    protected lastUsedIndex: number = 0;

    protected constructor(size: number, indexPadding: number) {
        this.entities = new Array(size).fill(null);
        this.ids = new Int32Array(size).fill(-1);
        this.free = new Set<number>(Array.from({ length: size }, (_, index) => index));
        this.taken = new Set();
        this.indexPadding = indexPadding;
    }

    next(_: boolean = false, start: number = this.lastUsedIndex + 1): number {
        const length: number = this.ids.length;
        for (let index: number = start; index < length; index++) {
            if (this.ids[index] === -1) {
                return index;
            }
        }
        for (let index: number = this.indexPadding; index < start; index++) {
            if (this.ids[index] === -1) {
                return index;
            }
        }
        throw new Error('[EntityList] cannot find next id');
    }

    *[Symbol.iterator](): IterableIterator<T> {
        for (const index of this.taken) {
            if (index === -1) {
                throw new Error('[EntityList] index should not be -1 here');
            }
            const entity: T | null = this.entities[index];
            if (!entity) {
                continue;
            }
            yield entity;
        }
    }

    get count(): number {
        return this.taken.size;
    }

    get(id: number): T | null {
        const index: number = this.ids[id];
        return index !== -1 ? this.entities[index] : null;
    }

    set(id: number, entity: T): void {
        if (!this.free.size) {
            throw new Error('[EntityList] cannot find available entities slot.');
        }
        const index = this.free.values().next().value;
        this.free.delete(index);
        this.taken.add(index);
        this.ids[id] = index;
        this.entities[index] = entity;
        this.lastUsedIndex = id;
    }

    remove(id: number): void {
        const index: number = this.ids[id];
        if (index !== -1) {
            this.entities[index] = null;
            this.ids[id] = -1;
            this.free.add(index);
            this.taken.delete(index);
        }
    }

    reset(): void {
        this.entities.fill(null);
        this.ids.fill(-1);
        this.free.clear();
        for (let i: number = 0; i < this.ids.length; i++) {
            this.free.add(i);
        }
        this.taken.clear();
    }
}

export class NpcList extends EntityList<Npc> {
    constructor(size: number) {
        super(size, 0);
    }
}

export class PlayerList extends EntityList<Player> {
    constructor(size: number) {
        super(size, 1);
    }

    next(priority: boolean = false, start: number = this.lastUsedIndex + 1): number {
        // the priority does not round-robin idk if this is an issue
        if (priority) {
            // start searching at 1 if the calculated start is 0
            const init: number = start === 0 ? 1 : 0;
            for (let i: number = init; i < 100; i++) {
                const index: number = start + i;
                const id: number = this.ids[index];
                if (id === -1) {
                    return index;
                }
            }
        }
        return super.next();
    }
}
