import Player from '#/engine/entity/Player.js';
import World from '#/engine/World.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import ChatSetMode from '#/network/client/model/game/ChatSetMode.js';

export default class ChatSetModeHandler extends MessageHandler<ChatSetMode> {
    handle(_message: ChatSetMode, player: Player): boolean {
        player.publicChat = _message.publicChat;
        player.privateChat = _message.privateChat;
        player.tradeDuel = _message.tradeDuel;

        World.sendPrivateChatModeToFriendsServer(player);

        return true;
    }
}
