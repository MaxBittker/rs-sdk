import * as rsbuf from '@2004scape/rsbuf';

import { Interaction } from '#/engine/entity/Interaction.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import World from '#/engine/World.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import OpPlayer from '#/network/client/model/game/OpPlayer.js';
import UnsetMapFlag from '#/network/server/model/game/UnsetMapFlag.js';

export default class OpPlayerHandler extends MessageHandler<OpPlayer> {
    handle(message: OpPlayer, player: NetworkPlayer): boolean {
        const { pid } = message;

        if (player.delayed) {
            player.write(new UnsetMapFlag());
            return false;
        }

        const other = World.getPlayer(pid);
        if (!other) {
            player.write(new UnsetMapFlag());
            player.clearPendingAction();
            return false;
        }

        if (!rsbuf.hasPlayer(player.pid, other.pid)) {
            player.write(new UnsetMapFlag());
            player.clearPendingAction();
            return false;
        }

        let mode: ServerTriggerType;
        if (message.op === 1) {
            mode = ServerTriggerType.APPLAYER1;
        } else if (message.op === 2) {
            mode = ServerTriggerType.APPLAYER2;
        } else if (message.op === 3) {
            mode = ServerTriggerType.APPLAYER3;
        } else {
            mode = ServerTriggerType.APPLAYER4;
        }

        player.clearPendingAction();
        player.setInteraction(Interaction.ENGINE, other, mode);
        player.opcalled = true;
        return true;
    }
}
