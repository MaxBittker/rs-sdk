import * as rsbuf from '#/network/rsbuf/index.js';

import Component from '#/cache/config/Component.js';
import ObjType from '#/cache/config/ObjType.js';
import { Interaction } from '#/engine/entity/Interaction.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import World from '#/engine/World.js';
import ClientGameMessageHandler from '#/network/game/client/ClientGameMessageHandler.js';
import OpNpcU from '#/network/game/client/model/OpNpcU.js';
import UnsetMapFlag from '#/network/game/server/model/UnsetMapFlag.js';
import Environment from '#/util/Environment.js';

export default class OpNpcUHandler extends ClientGameMessageHandler<OpNpcU> {
    handle(message: OpNpcU, player: NetworkPlayer): boolean {
        const { npcSlot, useObj, useSlot, useCom: useComId } = message;

        if (player.delayed) {
            // normal: cannot interact while delayed
            player.write(new UnsetMapFlag());
            return false;
        }

        const useCom = Component.get(useComId);
        if (typeof useCom === 'undefined' || !useCom.usable) {
            // bad client: component is not acceptable for this packet
            player.write(new UnsetMapFlag());
            return false;
        } else if (!player.isComponentVisible(useCom)) {
            // bad client or lag: component is not visible
            player.write(new UnsetMapFlag());
            return false;
        }

        const useListener = player.invListeners.find(l => l.com === useComId);
        const useInv = player.getInventoryFromListener(useListener);
        if (!useInv) {
            // bad client or lag: inventory is not transmitted to client
            player.write(new UnsetMapFlag());
            return false;
        }

        if (!useInv.validSlot(useSlot)) {
            // bad client: real inventory is smaller
            player.write(new UnsetMapFlag());
            return false;
        } else if (!useInv.hasAt(useSlot, useObj)) {
            // bad client or lag: item does not exist in inventory
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

        if (ObjType.get(useObj).members && !Environment.node.members) {
            player.messageGame("To use this item please login to a members' server.");
            player.write(new UnsetMapFlag());
            return false;
        }

        player.lastUseItem = useObj;
        player.lastUseSlot = useSlot;

        player.setInteraction(Interaction.ENGINE, npc, ServerTriggerType.APNPCU);
        player.opcalled = true;
        return true;
    }
}
