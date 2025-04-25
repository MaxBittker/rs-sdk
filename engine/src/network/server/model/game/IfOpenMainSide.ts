import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class IfOpenMainSide extends OutgoingMessage {
    priority = ServerProtPriority.BUFFERED;

    constructor(
        readonly main: number,
        readonly side: number
    ) {
        super();
    }
}
