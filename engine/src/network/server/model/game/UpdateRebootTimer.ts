import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class UpdateRebootTimer extends OutgoingMessage {
    priority = ServerProtPriority.BUFFERED; // todo: what should priority be?

    constructor(readonly ticks: number) {
        super();
    }
}
