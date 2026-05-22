import * as rsbuf from '#/network/rsbuf/index.js';

import Component, { ComActionTarget } from '#/cache/config/Component.js';
import { Interaction } from '#/engine/entity/Interaction.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import World from '#/engine/World.js';
import ClientGameMessageHandler from '#/network/game/client/ClientGameMessageHandler.js';
import OpNpcT from '#/network/game/client/model/OpNpcT.js';
import UnsetMapFlag from '#/network/game/server/model/UnsetMapFlag.js';

export default class OpNpcTHandler extends ClientGameMessageHandler<OpNpcT> {
    handle(message: OpNpcT, player: NetworkPlayer): boolean {
        const { npcSlot, spellCom: spellComId } = message;

        if (player.delayed) {
            // normal: cannot interact while delayed
            player.write(new UnsetMapFlag());
            return false;
        }

        const spellCom = Component.get(spellComId);
        if (typeof spellCom === 'undefined' || (spellCom.actionTarget & ComActionTarget.NPC) === 0) {
            // bad client: component is not acceptable for this packet
            player.write(new UnsetMapFlag());
            return false;
        } else if (!player.isComponentVisible(spellCom)) {
            // bad client or lag: component is not visible
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

        player.clearPendingAction();
        player.setInteraction(Interaction.ENGINE, npc, ServerTriggerType.APNPCT, spellComId);
        player.opcalled = true;
        return true;
    }
}
