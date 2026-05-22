import * as rsbuf from '#/network/rsbuf/index.js';

import Component from '#/cache/config/Component.js';
import ObjType from '#/cache/config/ObjType.js';
import { Interaction } from '#/engine/entity/Interaction.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import World from '#/engine/World.js';
import ClientGameMessageHandler from '#/network/game/client/ClientGameMessageHandler.js';
import OpPlayerU from '#/network/game/client/model/OpPlayerU.js';
import UnsetMapFlag from '#/network/game/server/model/UnsetMapFlag.js';
import Environment from '#/util/Environment.js';

export default class OpPlayerUHandler extends ClientGameMessageHandler<OpPlayerU> {
    handle(message: OpPlayerU, player: NetworkPlayer): boolean {
        const { playerSlot, useObj, useSlot, useCom: useComId } = message;

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

        const other = World.getPlayer(playerSlot);
        if (!other) {
            // bad client or lag: player does not exist
            player.write(new UnsetMapFlag());
            return false;
        }

        if (!rsbuf.hasPlayer(player.slot, other.slot)) {
            // bad client or lag: player is not visible on client
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

        player.setInteraction(Interaction.ENGINE, other, ServerTriggerType.APPLAYERU, useObj);
        player.opcalled = true;
        return true;
    }
}
