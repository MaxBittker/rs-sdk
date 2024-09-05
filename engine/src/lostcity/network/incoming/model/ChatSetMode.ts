import IncomingMessage from '#lostcity/network/incoming/IncomingMessage.js';
import ClientProtCategory from '#lostcity/network/incoming/prot/ClientProtCategory.js';
import { ChatModePrivate, ChatModePublic, ChatModeTradeDuel } from '#lostcity/util/ChatModes.js';

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
