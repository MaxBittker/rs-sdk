import Linkable from '#/datastruct/Linkable.js';

export default class HashTable<T extends Linkable> {
    readonly bucketCount: number;
    readonly buckets: T[];

    constructor(size: number) {
        this.buckets = new Array(size);
        this.bucketCount = size;

        for (let i: number = 0; i < size; i++) {
            const sentinel = (this.buckets[i] = new Linkable() as T);
            sentinel.next = sentinel;
            sentinel.prev = sentinel;
        }
    }

    find(key: bigint): T | null {
        const start: T = this.buckets[Number(key & BigInt(this.bucketCount - 1))];

        for (let node: T | null = start.next as T; node !== start; node = node?.next as T ?? null) {
            if (node && node.key === key) {
                return node;
            }
        }

        return null;
    }

    add(key: bigint, value: T): void {
        if (value.prev) {
            value.unlink();
        }

        const sentinel: T = this.buckets[Number(key & BigInt(this.bucketCount - 1))];
        value.prev = sentinel.prev;
        value.next = sentinel;
        if (value.prev) {
            value.prev.next = value;
        }
        value.next.prev = value;
        value.key = key;
    }

    *all(): IterableIterator<T> {
        for (let bucket = 0; bucket < this.bucketCount; bucket++) {
            // the list ends at the sentinel itself - do NOT stop on `key === 0n`, which is a
            // legitimate key (World buckets unparseable IPs to 0) and used to silently hide
            // that entry plus everything behind it in the bucket
            const sentinel: T = this.buckets[bucket];
            let node: T | null = sentinel.next as T | null;

            while (node !== null && node !== sentinel) {
                // need to store the next node early in case it's removed while iterating
                const next: T | null = node.next as T | null;
                yield node;
                node = next;
            }
        }
    }
}
