import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';

export default class CamShake extends OutgoingMessage {
    priority = ServerProtPriority.LOW;

    constructor(
        readonly type: number,
        readonly jitter: number,
        readonly amplitude: number,
        readonly frequency: number
    ) {
        super();
    }
}