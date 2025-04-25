import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';
import { ChatModePrivate, ChatModePublic, ChatModeTradeDuel } from '#/util/ChatModes.js';

export default class ChatFilterSettings extends OutgoingMessage {
    priority = ServerProtPriority.IMMEDIATE;

    constructor(
        readonly publicChat: ChatModePublic,
        readonly privateChat: ChatModePrivate,
        readonly tradeDuel: ChatModeTradeDuel
    ) {
        super();
    }
}
