import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';

export default class VarpLarge extends OutgoingMessage {
    priority = ServerProtPriority.HIGH;

    constructor(
        readonly varp: number,
        readonly value: number
    ) {
        super();
    }
}