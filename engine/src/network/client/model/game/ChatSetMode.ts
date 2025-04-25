import IncomingMessage from '#/network/client/IncomingMessage.js';
import ClientProtCategory from '#/network/client/prot/ClientProtCategory.js';
import { ChatModePrivate, ChatModePublic, ChatModeTradeDuel } from '#/util/ChatModes.js';

export default class ChatSetMode extends IncomingMessage {
    category = ClientProtCategory.USER_EVENT;

    constructor(
        readonly publicChat: ChatModePublic,
        readonly privateChat: ChatModePrivate,
        readonly tradeDuel: ChatModeTradeDuel
    ) {
        super();
    }
}
