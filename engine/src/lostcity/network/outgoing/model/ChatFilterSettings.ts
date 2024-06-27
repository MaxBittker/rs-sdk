import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';

export default class ChatFilterSettings extends OutgoingMessage {
    priority = ServerProtPriority.HIGH;

    constructor(
        readonly publicChat: number,
        readonly privateChat: number,
        readonly tradeDuel: number
    ) {
        super();
    }
}