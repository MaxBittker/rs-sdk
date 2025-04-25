import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class MessageGame extends OutgoingMessage {
    priority = ServerProtPriority.IMMEDIATE;

    constructor(readonly msg: string) {
        super();
    }
}
