import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class NpcInfo extends OutgoingMessage {
    priority = ServerProtPriority.IMMEDIATE;

    constructor(readonly bytes: Uint8Array) {
        super();
    }
}
