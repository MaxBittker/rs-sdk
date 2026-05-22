import Linkable from '#/datastruct/Linkable.js';

export default class Linkable2 extends Linkable {
    next2: Linkable2 | null = null;
    prev2: Linkable2 | null = null;

    unlink2(): void {
        if (this.prev2 !== null) {
            this.prev2.next2 = this.next2;
            if (this.next2) {
                this.next2.prev2 = this.prev2;
            }
            this.next2 = null;
            this.prev2 = null;
        }
    }
}
