import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';

export default class MessagePrivate extends OutgoingMessage {
    priority = ServerProtPriority.HIGH;

    constructor(
        readonly from: bigint,
        readonly messageId: number,
        readonly staffModLevel: number,
        readonly msg: string
    ) {
        super();
    }
}