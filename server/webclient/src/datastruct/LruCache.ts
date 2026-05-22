import Linkable2 from '#/datastruct/Linkable2.js';
import HashTable from '#/datastruct/HashTable.js';
import LinkList2 from '#/datastruct/LinkList2.js';

export default class LruCache<T extends Linkable2> {
    readonly capacity: number;
    readonly table: HashTable<T> = new HashTable(1024);
    readonly history: LinkList2<T> = new LinkList2();
    available: number;

    constructor(size: number) {
        this.capacity = size;
        this.available = size;
    }

    find(key: bigint): T | null {
        const node = this.table.find(key);
        if (node) {
            this.history.push(node);
        }
        return node;
    }

    put(node: T, key: bigint): void {
        if (this.available === 0) {
            const first = this.history.popFront();
            first?.unlink();
            first?.unlink2();
        } else {
            this.available--;
        }

        this.table.put(node, key);
        this.history.push(node);
    }

    clear(): void {
        while (true) {
            const node: T | null = this.history.popFront();
            if (!node) {
                this.available = this.capacity;
                return;
            }
            node.unlink();
            node.unlink2();
        }
    }
}
