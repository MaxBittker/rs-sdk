import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';

export default class UpdateStat extends OutgoingMessage {
    priority = ServerProtPriority.LOW;

    constructor(
        readonly stat: number,
        readonly exp: number,
        readonly level: number
    ) {
        super();
    }
}