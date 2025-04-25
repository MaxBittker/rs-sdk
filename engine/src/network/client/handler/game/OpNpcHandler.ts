import * as rsbuf from '@2004scape/rsbuf';

import NpcType from '#/cache/config/NpcType.js';
import { Interaction } from '#/engine/entity/Interaction.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import World from '#/engine/World.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import OpNpc from '#/network/client/model/game/OpNpc.js';
import UnsetMapFlag from '#/network/server/model/game/UnsetMapFlag.js';

export default class OpNpcHandler extends MessageHandler<OpNpc> {
    handle(message: OpNpc, player: NetworkPlayer): boolean {
        const { nid } = message;

        if (player.delayed) {
            player.write(new UnsetMapFlag());
            return false;
        }

        const npc = World.getNpc(nid);
        if (!npc || npc.delayed) {
            player.write(new UnsetMapFlag());
            player.clearPendingAction();
            return false;
        }

        if (!rsbuf.hasNpc(player.pid, npc.nid)) {
            player.write(new UnsetMapFlag());
            player.clearPendingAction();
            return false;
        }

        const npcType = NpcType.get(npc.type);
        if (!npcType.op || !npcType.op[message.op - 1]) {
            player.write(new UnsetMapFlag());
            player.clearPendingAction();
            return false;
        }

        let mode: ServerTriggerType;
        if (message.op === 1) {
            mode = ServerTriggerType.APNPC1;
        } else if (message.op === 2) {
            mode = ServerTriggerType.APNPC2;
        } else if (message.op === 3) {
            mode = ServerTriggerType.APNPC3;
        } else if (message.op === 4) {
            mode = ServerTriggerType.APNPC4;
        } else {
            mode = ServerTriggerType.APNPC5;
        }

        player.clearPendingAction();
        player.setInteraction(Interaction.ENGINE, npc, mode);
        player.opcalled = true;
        return true;
    }
}
