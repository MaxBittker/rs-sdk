import InvType from '#/cache/config/InvType.js';
import ObjType from '#/cache/config/ObjType.js';

type Item = { id: number; count: number };

export interface InventoryListener {
    type: number; // InvType
    com: number; // Component
    source: number; // uid or -1 for world
    firstSeen: boolean;
}

export class Inventory {
    static STACK_LIMIT = 0x7fffffff /* - 1*/;

    static NORMAL_STACK = 0;
    static ALWAYS_STACK = 1;
    static NEVER_STACK = 2;

    static fromType(inv: number) {
        if (inv === -1) {
            throw new Error('Invalid inventory type');
        }

        const type = InvType.get(inv);

        let stackType = Inventory.NORMAL_STACK;
        if (type.stackall) {
            stackType = Inventory.ALWAYS_STACK;
        }

        const container = new Inventory(inv, type.size, stackType);

        if (type.stockobj && type.stockcount && type.stockobj.length) {
            for (let i = 0; i < type.stockobj.length; i++) {
                container.set(i, {
                    id: type.stockobj[i],
                    count: type.stockcount[i]
                });
            }
        }

        return container;
    }

    // 0 - stack based on item
    // 1 - always stack
    // 2 - never stack
    readonly stackType: number;
    readonly capacity: number;
    readonly type: number; // inv ID
    readonly items: (Item | null)[];

    update = false;
    readonly dirtySlots: Set<number> = new Set();

    constructor(type: number, capacity: number, stackType = Inventory.NORMAL_STACK) {
        this.type = type;
        this.capacity = capacity;
        this.stackType = stackType;
        this.items = new Array(capacity).fill(null);
    }

    hasAt(slot: number, id: number) {
        const item = this.items[slot];
        return item && item.id == id;
    }

    get nextFreeSlot() {
        return this.items.indexOf(null, 0);
    }

    get freeSlotCount() {
        return this.items.filter(item => item == null).length;
    }

    get itemsFiltered() {
        return this.items.filter(item => item != null) as Item[];
    }

    getItemCount(id: number) {
        let count = 0;

        for (let i = 0; i < this.capacity; i++) {
            const item = this.items[i];
            if (item && item.id == id) {
                count += item.count;
            }
        }

        return Math.min(Inventory.STACK_LIMIT, count);
    }

    getItemIndex(id: number) {
        return this.items.findIndex(item => item && item.id == id);
    }

    removeAll() {
        for (let slot = 0; slot < this.capacity; slot++) {
            if (this.items[slot] !== null) {
                this.items[slot] = null;
                this.markDirty(slot);
            }
        }
    }

    add(id: number, count = 1, beginSlot = -1) {
        const type = ObjType.get(id);
        const stack = this.stackType != Inventory.NEVER_STACK && (type.stackable || this.stackType == Inventory.ALWAYS_STACK);

        let completed = 0;

        if (!stack) {
            const startSlot = Math.max(0, beginSlot);

            for (let i = startSlot; i < this.capacity; i++) {
                if (this.items[i] != null) {
                    continue;
                }

                this.set(i, { id, count: 1 });

                if (++completed >= count) {
                    break;
                }
            }
        } else {
            let stackIndex = this.getItemIndex(id);

            if (stackIndex == -1) {
                if (beginSlot == -1) {
                    stackIndex = this.nextFreeSlot;
                } else {
                    stackIndex = this.items.indexOf(null, beginSlot);
                }

                if (stackIndex == -1) {
                    return completed;
                }
            }

            const stackCount = this.get(stackIndex)?.count ?? 0;
            const total = Math.min(Inventory.STACK_LIMIT, stackCount + count);

            this.set(stackIndex, { id, count: total });
            completed = total - stackCount;
        }

        return completed;
    }

    remove(id: number, count = 1, beginSlot = -1) {
        const stockObj = InvType.get(this.type).stockobj?.includes(id) === true;

        let totalRemoved = 0;

        let skippedIndices = null;
        if (beginSlot != -1) {
            skippedIndices = [];

            for (let i = 0; i < beginSlot; i++) {
                skippedIndices.push(i);
            }
        }

        let index = 0;
        if (beginSlot != -1) {
            index = beginSlot;
        }

        for (let i = index; i < this.capacity; i++) {
            const curItem = this.items[i];
            if (!curItem || curItem.id != id) {
                continue;
            }

            const removeCount = Math.min(curItem.count, count - totalRemoved);
            totalRemoved += removeCount;

            curItem.count -= removeCount;
            if (curItem.count == 0 && !stockObj) {
                this.items[i] = null;
            }
            this.markDirty(i);

            if (totalRemoved >= count) {
                break;
            }
        }

        if (skippedIndices != null && totalRemoved < count) {
            for (let i = 0; i < skippedIndices.length; i++) {
                const curItem = this.items[i];
                if (!curItem || curItem.id != id) {
                    continue;
                }

                const removeCount = Math.min(curItem.count, count - totalRemoved);
                totalRemoved += removeCount;

                curItem.count -= removeCount;
                if (curItem.count == 0 && !stockObj) {
                    this.items[i] = null;
                }
                this.markDirty(i);

                if (totalRemoved >= count) {
                    break;
                }
            }
        }

        return totalRemoved;
    }

    delete(slot: number) {
        this.set(slot, null);
    }

    get(slot: number) {
        return this.items[slot];
    }

    set(slot: number, item: Item | null) {
        this.items[slot] = item;
        this.markDirty(slot);
    }

    validSlot(slot: number) {
        return slot >= 0 && slot < this.capacity;
    }

    getDirtySlots() {
        return [...this.dirtySlots].sort((a, b) => a - b);
    }

    resetTracking() {
        this.update = false;
        this.dirtySlots.clear();
    }

    private markDirty(slot: number) {
        this.dirtySlots.add(slot);
        this.update = true;
    }
}
