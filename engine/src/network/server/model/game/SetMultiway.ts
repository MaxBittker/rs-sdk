import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class SetMultiway extends OutgoingMessage {
    priority = ServerProtPriority.BUFFERED;

    constructor(readonly hidden: boolean) {
        super();
    }
}
