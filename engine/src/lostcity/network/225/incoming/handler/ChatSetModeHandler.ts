import MessageHandler from '#lostcity/network/incoming/handler/MessageHandler.js';
import Player from '#lostcity/entity/Player.js';
import ChatSetMode from '#lostcity/network/incoming/model/ChatSetMode.js';
import World from '#lostcity/engine/World.js';

export default class ChatSetModeHandler extends MessageHandler<ChatSetMode> {
    handle(_message: ChatSetMode, player: Player): boolean {
        player.chatModes.publicChat = _message.publicChat;
        player.chatModes.privateChat = _message.privateChat;
        player.chatModes.tradeDuel = _message.tradeDuel;

        World.sendPrivateChatModeToFriendsServer(player);

        return true;
    }
}
