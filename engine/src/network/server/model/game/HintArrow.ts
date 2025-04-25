import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class HintArrow extends OutgoingMessage {
    priority = ServerProtPriority.BUFFERED; // todo: what should priority be?

    constructor(
        readonly type: number,
        readonly nid: number,
        readonly pid: number,
        readonly x: number,
        readonly z: number,
        readonly y: number
    ) {
        super();
    }
}
