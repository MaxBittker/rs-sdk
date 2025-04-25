import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class DataLocDone extends OutgoingMessage {
    priority = ServerProtPriority.IMMEDIATE;

    constructor(
        readonly x: number,
        readonly z: number
    ) {
        super();
    }
}
