import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class DataLoc extends OutgoingMessage {
    priority = ServerProtPriority.IMMEDIATE;

    constructor(
        readonly x: number,
        readonly z: number,
        readonly offset: number,
        readonly length: number,
        readonly data: Uint8Array
    ) {
        super();
    }
}
