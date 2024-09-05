import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';
import { ChatModePrivate, ChatModePublic, ChatModeTradeDuel } from '#lostcity/util/ChatModes.js';

export default class ChatFilterSettings extends OutgoingMessage {
    priority = ServerProtPriority.HIGH;

    constructor(
        readonly publicChat: ChatModePublic,
        readonly privateChat: ChatModePrivate,
        readonly tradeDuel: ChatModeTradeDuel,
    ) {
        super();
    }
}
