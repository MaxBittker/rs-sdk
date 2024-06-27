import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';

export default class UpdateUid192 extends OutgoingMessage {
    priority = ServerProtPriority.HIGH; // todo: low or high priority

    constructor(readonly uid: number) {
        super();
    }
}