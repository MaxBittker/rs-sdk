import Player from '#/engine/entity/Player.js';
import World from '#/engine/World.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import IgnoreListAdd from '#/network/client/model/game/IgnoreListAdd.js';
import { fromBase37 } from '#/util/JString.js';

export default class IgnoreListAddHandler extends MessageHandler<IgnoreListAdd> {
    handle(message: IgnoreListAdd, player: Player): boolean {
        if (player.socialProtect || fromBase37(message.username) === 'invalid_name') {
            return false;
        }

        World.addIgnore(player, message.username);
        player.socialProtect = true;
        return true;
    }
}
