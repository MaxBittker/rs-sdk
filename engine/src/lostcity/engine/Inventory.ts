import InvType from '#lostcity/cache/InvType.js';
import ObjType from '#lostcity/cache/ObjType.js';

type Item = { id: number; count: number };
type TransactionResult = { slot: number; item: Item };

export class InventoryTransaction {
    requested = 0;
    completed = 0;
    items: TransactionResult[] = [];

    constructor(requested: number, completed: number = 0, items: TransactionResult[] = []) {
        this.requested = requested;
        this.completed = completed;
        this.items = items;
    }

    getLeftOver() {
        return this.requested - this.completed;
    }

    hasSucceeded() {
        return this.completed == this.requested;
    }

    hasFailed() {
        return !this.hasSucceeded();
    }

    revert(from: Inventory) {
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i].item;
            from.remove(item.id, item.count, this.items[i].slot);
        }
    }
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

        const container = new Inventory(type.size, stackType);
        container.type = inv;

        if (type.stockobj.length) {
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
    stackType = Inventory.NORMAL_STACK;

    capacity = 0;
    items: (Item | null)[] = [];
    update = false;

    type = -1; // inv ID

    constructor(capacity: number, stackType = Inventory.NORMAL_STACK) {
        this.capacity = capacity;
        this.stackType = stackType;

        for (let i = 0; i < capacity; i++) {
            this.items.push(null);
        }
    }

    contains(id: number) {
        return this.items.some(item => item && item.id == id);
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

    get occupiedSlotCount() {
        return this.items.filter(item => item != null).length;
    }

    get isFull() {
        return this.occupiedSlotCount == this.capacity;
    }

    get isEmpty() {
        return this.occupiedSlotCount == 0;
    }

    get hasAny() {
        return this.items.some(item => item != null);
    }

    get hasSpace() {
        return this.nextFreeSlot != -1;
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
        this.items.fill(null, 0, this.capacity);
        this.update = true;
    }

    add(id: number, count = 1, beginSlot = -1, assureFullInsertion = true, forceNoStack = false, dryRun = false) {
        const type = ObjType.get(id);
        const stockObj = InvType.get(this.type).stockobj.includes(id);
        const stack = !forceNoStack && this.stackType != Inventory.NEVER_STACK && (type.stackable || this.stackType == Inventory.ALWAYS_STACK);

        let previousCount = 0;
        if (stack) {
            previousCount = this.getItemCount(id);
        }

        if (previousCount == Inventory.STACK_LIMIT) {
            return new InventoryTransaction(count, 0, []);
        }

        const freeSlotCount = this.freeSlotCount;
        if (freeSlotCount == 0 && (!stack || (stack && previousCount == 0 && !stockObj))) {
            return new InventoryTransaction(count, 0, []);
        }

        if (assureFullInsertion) {
            if (stack && previousCount > Inventory.STACK_LIMIT - count) {
                return new InventoryTransaction(count, 0, []);
            }

            if (!stack && count > freeSlotCount) {
                return new InventoryTransaction(count, 0, []);
            }
        } else {
            if (stack && previousCount == Inventory.STACK_LIMIT) {
                return new InventoryTransaction(count, 0, []);
            } else if (!stack && freeSlotCount == 0) {
                return new InventoryTransaction(count, 0, []);
            }
        }

        let completed = 0;
        const added = [];

        if (!stack) {
            const startSlot = Math.max(0, beginSlot);

            for (let i = startSlot; i < this.capacity; i++) {
                if (this.items[i] != null) {
                    continue;
                }

                const add = { id, count: 1 };
                if (!dryRun) {
                    this.set(i, add);
                }
                added.push({ slot: i, item: add });

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
                    return new InventoryTransaction(count, completed, []);
                }
            }

            const stackCount = this.get(stackIndex)?.count ?? 0;
            const total = Math.min(Inventory.STACK_LIMIT, stackCount + count);

            const add = { id, count: total };
            if (!dryRun) {
                this.set(stackIndex, add);
            }
            added.push({ slot: stackIndex, item: add });
            completed = total - stackCount;
        }

        return new InventoryTransaction(count, completed, added);
    }

    remove(id: number, count = 1, beginSlot = -1, assureFullRemoval = false) {
        const hasCount = this.getItemCount(id);
        const stockObj = InvType.get(this.type).stockobj.includes(id);

        if (assureFullRemoval && hasCount < count) {
            return new InventoryTransaction(count, 0, []);
        } else if (!assureFullRemoval && hasCount < 1) {
            return new InventoryTransaction(count, 0, []);
        }

        let totalRemoved = 0;
        const removed: TransactionResult[] = [];

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
                const removedItem = this.items[i];
                this.items[i] = null;
                if (removedItem) {
                    removed.push({ slot: i, item: removedItem });
                }
            }

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
                    const removedItem = this.items[i];
                    this.items[i] = null;
                    if (removedItem) {
                        removed.push({ slot: i, item: removedItem });
                    }
                }

                if (totalRemoved >= count) {
                    break;
                }
            }
        }

        if (totalRemoved > 0) {
            this.update = true;
        }

        return new InventoryTransaction(count, totalRemoved, removed);
    }

    delete(slot: number) {
        this.items[slot] = null;
        this.update = true;
    }

    swap(from: number, to: number) {
        const temp = this.items[from];
        this.set(from, this.items[to]);
        this.set(to, temp);
    }

    shift() {
        // @ts-expect-error not valid typescript
        this.items = this.items.sort((a, b) => (a === null) - (b === null) || +(a > b) || -(a < b));
        this.update = true;
    }

    get(slot: number) {
        return this.items[slot];
    }

    set(slot: number, item: Item | null) {
        this.items[slot] = item;
        this.update = true;
    }

    validSlot(slot: number) {
        return slot >= 0 && slot < this.capacity;
    }

    transfer(to: Inventory, item: Item, fromSlot = -1, toSlot = -1, note = false, unnote = false) {
        if (item.count <= 0) {
            return null;
        }

        const count = Math.min(item.count, this.getItemCount(item.id));

        const objType = ObjType.get(item.id);
        let finalItem = { id: item.id, count: count };
        if (note && objType.certlink !== -1 && objType.certtemplate === -1) {
            finalItem = { id: objType.certlink, count };
        } else if (unnote && objType.certlink !== -1 && objType.certtemplate >= 0) {
            finalItem = { id: objType.certlink, count };
        }

        const add = to.add(finalItem.id, finalItem.count, toSlot, false);
        if (add.completed == 0) {
            return null;
        }

        const remove = this.remove(item.id, add.completed, fromSlot, false);
        if (remove.completed == 0) {
            return null;
        }

        return remove;
    }
}
