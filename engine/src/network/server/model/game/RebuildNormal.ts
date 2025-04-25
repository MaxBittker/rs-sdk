import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class RebuildNormal extends OutgoingMessage {
    priority = ServerProtPriority.IMMEDIATE;

    constructor(
        readonly zoneX: number,
        readonly zoneZ: number,
        readonly mapsquares: Set<number>,
    ) {
        super();
    }
}
