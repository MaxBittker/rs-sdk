import * as rsbuf from '@2004scape/rsbuf';

import Component from '#/cache/config/Component.js';
import ObjType from '#/cache/config/ObjType.js';
import { Interaction } from '#/engine/entity/Interaction.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import World from '#/engine/World.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import OpNpcU from '#/network/client/model/game/OpNpcU.js';
import UnsetMapFlag from '#/network/server/model/game/UnsetMapFlag.js';
import Environment from '#/util/Environment.js';

export default class OpNpcUHandler extends MessageHandler<OpNpcU> {
    handle(message: OpNpcU, player: NetworkPlayer): boolean {
        const { nid, useObj: item, useSlot: slot, useComponent: comId } = message;

        if (player.delayed) {
            player.write(new UnsetMapFlag());
            return false;
        }

        const com = Component.get(comId);
        if (typeof com === 'undefined' || !player.isComponentVisible(com) || !com.interactable) {
            player.write(new UnsetMapFlag());
            player.clearPendingAction();
            return false;
        }

        const listener = player.invListeners.find(l => l.com === comId);
        if (!listener) {
            player.write(new UnsetMapFlag());
            player.clearPendingAction();
            return false;
        }

        const inv = player.getInventoryFromListener(listener);
        if (!inv || !inv.validSlot(slot) || !inv.hasAt(slot, item)) {
            player.write(new UnsetMapFlag());
            player.clearPendingAction();
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

        player.clearPendingAction();
        if (ObjType.get(item).members && !Environment.NODE_MEMBERS) {
            player.messageGame("To use this item please login to a members' server.");
            player.write(new UnsetMapFlag());
            return false;
        }

        player.lastUseItem = item;
        player.lastUseSlot = slot;

        player.setInteraction(Interaction.ENGINE, npc, ServerTriggerType.APNPCU);
        player.opcalled = true;
        return true;
    }
}
