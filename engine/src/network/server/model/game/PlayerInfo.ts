import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class PlayerInfo extends OutgoingMessage {
    priority = ServerProtPriority.IMMEDIATE;

    constructor(readonly bytes: Uint8Array) {
        super();
    }
}
