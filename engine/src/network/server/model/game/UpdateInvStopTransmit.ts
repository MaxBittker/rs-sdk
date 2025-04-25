import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class UpdateInvStopTransmit extends OutgoingMessage {
    priority = ServerProtPriority.IMMEDIATE;

    constructor(readonly component: number) {
        super();
    }
}
