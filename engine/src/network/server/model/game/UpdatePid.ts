import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class UpdatePid extends OutgoingMessage {
    priority = ServerProtPriority.IMMEDIATE; // todo: what should priority be?

    constructor(readonly uid: number) {
        super();
    }
}
