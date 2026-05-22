import Player from '#/engine/entity/Player.js';
import ClientGameMessageHandler from '#/network/game/client/ClientGameMessageHandler.js';
import IdleTimer from '#/network/game/client/model/IdleTimer.js';
import Environment from '#/util/Environment.js';

export default class IdleTimerHandler extends ClientGameMessageHandler<IdleTimer> {
    handle(_message: IdleTimer, player: Player): boolean {
        if (!Environment.node.debug) {
            console.warn(`[LOGOUT DEBUG] IdleTimerHandler: Client sent IDLE_TIMER packet for ${player.username} (client-side AFK timeout)`);
            // todo: staff command to stay logged in
            player.requestIdleLogout = true;
        }

        return true;
    }
}
