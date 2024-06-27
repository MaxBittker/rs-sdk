import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';

export default class IfOpenMainSideModal extends OutgoingMessage {
    priority = ServerProtPriority.LOW;

    constructor(
        readonly main: number,
        readonly side: number
    ) {
        super();
    }
}