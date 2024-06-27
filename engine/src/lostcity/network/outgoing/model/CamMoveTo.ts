import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';

export default class CamMoveTo extends OutgoingMessage {
    priority = ServerProtPriority.LOW;

    constructor(
        readonly x: number,
        readonly z: number,
        readonly height: number,
        readonly speed: number,
        readonly multiplier: number
    ) {
        super();
    }
}