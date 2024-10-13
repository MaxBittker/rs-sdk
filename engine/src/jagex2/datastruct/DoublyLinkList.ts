import DoublyLinkable from '#jagex2/datastruct/DoublyLinkable.js';

export default class DoublyLinkList<T extends DoublyLinkable> {
    readonly sentinel: DoublyLinkable;
    private cursor: DoublyLinkable | null = null;

    constructor() {
        const head: DoublyLinkable = new DoublyLinkable();
        head.next2 = head;
        head.prev2 = head;
        this.sentinel = head;
    }

    push(node: T): void {
        if (node.prev2) {
            node.unlink2();
        }
        node.prev2 = this.sentinel.prev2;
        node.next2 = this.sentinel;
        if (node.prev2) {
            node.prev2.next2 = node;
        }
        node.next2.prev2 = node;
    }

    pop(): T | null {
        const node: T | null = this.sentinel.next2 as T | null;
        if (node === this.sentinel) {
            return null;
        }
        node?.unlink2();
        return node;
    }

    head(): T | null {
        const node: T | null = this.sentinel.next2 as T | null;
        if (node === this.sentinel) {
            this.cursor = null;
            return null;
        }
        this.cursor = node?.next2 || null;
        return node;
    }

    next(): T | null {
        const node: T | null = this.cursor as T | null;
        if (node === this.sentinel) {
            this.cursor = null;
            return null;
        }
        this.cursor = node?.next2 || null;
        return node;
    }

    clear(): void {
        while (true) {
            const node = this.sentinel.next;
            if (node == this.sentinel) {
                return;
            }
            if (node) {
                node.unlink();
            }
        }
    }
}
