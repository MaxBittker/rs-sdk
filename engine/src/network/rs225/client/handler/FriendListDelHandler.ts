import MessageHandler from '#/network/client/handler/MessageHandler.js';
import Player from '#/engine/entity/Player.js';
import FriendListDel from '#/network/client/model/FriendListDel.js';
import World from '#/engine/World.js';
import { fromBase37 } from '#/util/JString.js';

export default class FriendListDelHandler extends MessageHandler<FriendListDel> {
    handle(message: FriendListDel, player: Player): boolean {
        if (fromBase37(message.username) === 'invalid_name') {
            return false;
        }

        World.removeFriend(player, message.username);
        return true;
    }
}
