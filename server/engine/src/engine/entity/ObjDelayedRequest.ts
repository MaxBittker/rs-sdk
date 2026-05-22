import Obj from '#/engine/entity/Obj.js';
import Linkable from '#/datastruct/Linkable.js';

export class ObjDelayedRequest extends Linkable {
    // Obj to add
    obj: Obj;
    // Player who dropped
    receiver64: bigint;
    // Duration for obj to last after its added
    duration: number;
    // Duration for obj to wait to be added
    delay: number;

    constructor(obj: Obj, duration: number, delay: number, receiver64: bigint = Obj.NO_RECEIVER) {
        super();
        this.obj = obj;
        this.receiver64 = receiver64;
        this.duration = duration;
        this.delay = delay;
    }
}
