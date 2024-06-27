import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';

export default class MessageGame extends OutgoingMessage {
    priority = ServerProtPriority.HIGH;

    constructor(readonly msg: string) {
        super();
    }
}