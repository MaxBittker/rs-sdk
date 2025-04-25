import Player from '#/engine/entity/Player.js';
import World from '#/engine/World.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import IgnoreListDel from '#/network/client/model/game/IgnoreListDel.js';
import { fromBase37 } from '#/util/JString.js';

export default class IgnoreListDelHandler extends MessageHandler<IgnoreListDel> {
    handle(message: IgnoreListDel, player: Player): boolean {
        if (player.socialProtect || fromBase37(message.username) === 'invalid_name') {
            return false;
        }

        World.removeIgnore(player, message.username);
        player.socialProtect = true;
        return true;
    }
}
