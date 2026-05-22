import Linkable from '#/datastruct/Linkable.js';

export default class LinkList<T extends Linkable> {
    private readonly sentinel: Linkable = new Linkable();
    private cursor: Linkable | null = null;

    constructor() {
        this.sentinel.next = this.sentinel;
        this.sentinel.prev = this.sentinel;
    }

    clear(): void {
        while (true) {
            const node: T | null = this.sentinel.next as T | null;
            if (node === this.sentinel) {
                return;
            }

            node?.unlink();
        }
    }

    push(node: T): void {
        if (node.prev) {
            node.unlink();
        }

        node.prev = this.sentinel.prev;
        node.next = this.sentinel;
        if (node.prev) {
            node.prev.next = node;
        }
        node.next.prev = node;
    }

    pushFront(node: T): void {
        if (node.prev) {
            node.unlink();
        }

        node.prev = this.sentinel;
        node.next = this.sentinel.next;
        node.prev.next = node;
        if (node.next) {
            node.next.prev = node;
        }
    }

    popFront(): T | null {
        const node: T | null = this.sentinel.next as T | null;
        if (node === this.sentinel) {
            return null;
        }

        node?.unlink();
        return node;
    }

    head(): T | null {
        const node: T | null = this.sentinel.next as T | null;
        if (node === this.sentinel) {
            this.cursor = null;
            return null;
        }

        this.cursor = node?.next ?? null;
        return node;
    }

    tail(): T | null {
        const node: T | null = this.sentinel.prev as T | null;
        if (node === this.sentinel) {
            this.cursor = null;
            return null;
        }

        this.cursor = node?.prev ?? null;
        return node;
    }

    next(): T | null {
        const node: T | null = this.cursor as T | null;
        if (node === this.sentinel) {
            this.cursor = null;
            return null;
        }

        this.cursor = node?.next ?? null;
        return node;
    }

    prev(): T | null {
        const node: T | null = this.cursor as T | null;
        if (node === this.sentinel) {
            this.cursor = null;
            return null;
        }

        this.cursor = node?.prev ?? null;
        return node;
    }
}
