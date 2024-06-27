import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';

export default class IfSetRecol extends OutgoingMessage {
    priority = ServerProtPriority.LOW;

    constructor(
        readonly component: number,
        readonly src: number,
        readonly dst: number
    ) {
        super();
    }
}