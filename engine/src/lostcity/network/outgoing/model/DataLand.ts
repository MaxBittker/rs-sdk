import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';

export default class DataLand extends OutgoingMessage {
    priority = ServerProtPriority.HIGH;

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