import Linkable from '#/datastruct/Linkable.js';

export default class HashTable<T extends Linkable> {
    readonly bucketCount: number;
    readonly buckets: Linkable[];

    constructor(size: number) {
        this.buckets = new Array(size);
        this.bucketCount = size;

        for (let i: number = 0; i < size; i++) {
            const sentinel = (this.buckets[i] = new Linkable());
            sentinel.next = sentinel;
            sentinel.prev = sentinel;
        }
    }

    find(key: bigint): T | null {
        const start = this.buckets[Number(key & BigInt(this.bucketCount - 1))];

        for (let node = start.next; node !== start; node = node?.next ?? null) {
            if (node && node.key === key) {
                return node as T;
            }
        }

        return null;
    }

    put(node: T, key: bigint): void {
        if (node.prev) {
            node.unlink();
        }

        const sentinel: Linkable = this.buckets[Number(key & BigInt(this.bucketCount - 1))];
        node.prev = sentinel.prev;
        node.next = sentinel;
        if (node.prev) {
            node.prev.next = node;
        }
        node.next.prev = node;
        node.key = key;
    }
}
