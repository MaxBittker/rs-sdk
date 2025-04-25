import Player from '#/engine/entity/Player.js';
import World from '#/engine/World.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import FriendListAdd from '#/network/client/model/game/FriendListAdd.js';
import { fromBase37 } from '#/util/JString.js';

export default class FriendListAddHandler extends MessageHandler<FriendListAdd> {
    handle(message: FriendListAdd, player: Player): boolean {
        if (player.socialProtect || fromBase37(message.username) === 'invalid_name') {
            return false;
        }

        World.addFriend(player, message.username);
        player.socialProtect = true;
        return true;
    }
}
