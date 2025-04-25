import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class IfSetAnim extends OutgoingMessage {
    priority = ServerProtPriority.BUFFERED;

    constructor(
        readonly component: number,
        readonly seq: number
    ) {
        super();
    }
}
