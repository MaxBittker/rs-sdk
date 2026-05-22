import * as rsbuf from '#/network/rsbuf/index.js';

import NpcType from '#/cache/config/NpcType.js';
import { Interaction } from '#/engine/entity/Interaction.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import World from '#/engine/World.js';
import ClientGameMessageHandler from '#/network/game/client/ClientGameMessageHandler.js';
import OpNpc from '#/network/game/client/model/OpNpc.js';
import UnsetMapFlag from '#/network/game/server/model/UnsetMapFlag.js';

export default class OpNpcHandler extends ClientGameMessageHandler<OpNpc> {
    handle(message: OpNpc, player: NetworkPlayer): boolean {
        const { npcSlot } = message;

        if (player.delayed) {
            // normal: cannot interact while delayed
            player.write(new UnsetMapFlag());
            return false;
        }

        const npc = World.getNpc(npcSlot);
        if (!npc) {
            // bad client or lag: npc does not exist
            player.write(new UnsetMapFlag());
            return false;
        } else if (npc.delayed) {
            // normal: cannot interact with delayed npcs
            player.write(new UnsetMapFlag());
            return false;
        }

        if (!rsbuf.hasNpc(player.slot, npc.nid)) {
            // bad client or lag: npc is not visible on client
            player.write(new UnsetMapFlag());
            return false;
        }

        const npcType = NpcType.get(npc.type);
        if (!npcType.op || npcType.op[message.op - 1] === null || npcType.op[message.op - 1] === 'hidden') {
            // bad client: not a valid npc option
            player.write(new UnsetMapFlag());
            return false;
        }

        const trigger: ServerTriggerType = ServerTriggerType.APNPC1 + (message.op - 1);
        player.clearPendingAction();
        player.setInteraction(Interaction.ENGINE, npc, trigger);
        player.opcalled = true;
        return true;
    }
}
