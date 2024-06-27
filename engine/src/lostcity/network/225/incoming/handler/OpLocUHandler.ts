import MessageHandler from '#lostcity/network/incoming/handler/MessageHandler.js';
import World from '#lostcity/engine/World.js';
import { NetworkPlayer } from '#lostcity/entity/NetworkPlayer.js';
import OpLocU from '#lostcity/network/incoming/model/OpLocU.js';
import Component from '#lostcity/cache/config/Component.js';
import ObjType from '#lostcity/cache/config/ObjType.js';
import Interaction from '#lostcity/entity/Interaction.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';

export default class OpLocUHandler extends MessageHandler<OpLocU> {
    handle(message: OpLocU, player: NetworkPlayer): boolean {
        const { x, z, loc: locId, useObj: item, useSlot: slot, useComponent: comId } = message;

        if (player.delayed()) {
            player.unsetMapFlag();
            return false;
        }

        const com = Component.get(comId);
        if (typeof com === 'undefined' || !player.isComponentVisible(com)) {
            player.unsetMapFlag();
            return false;
        }

        const absLeftX = player.originX - 52;
        const absRightX = player.originX + 52;
        const absTopZ = player.originZ + 52;
        const absBottomZ = player.originZ - 52;
        if (x < absLeftX || x > absRightX || z < absBottomZ || z > absTopZ) {
            player.unsetMapFlag();
            return false;
        }

        const listener = player.invListeners.find(l => l.com === comId);
        if (!listener) {
            player.unsetMapFlag();
            return false;
        }

        const inv = player.getInventoryFromListener(listener);
        if (!inv || !inv.validSlot(slot) || !inv.hasAt(slot, item)) {
            player.unsetMapFlag();
            return false;
        }

        const loc = World.getLoc(x, z, player.level, locId);
        if (!loc) {
            player.unsetMapFlag();
            return false;
        }

        if (ObjType.get(item).members && !World.members) {
            player.messageGame("To use this item please login to a members' server.");
            player.unsetMapFlag();
            return false;
        }

        player.lastUseItem = item;
        player.lastUseSlot = slot;

        player.clearPendingAction();
        player.setInteraction(Interaction.ENGINE, loc, ServerTriggerType.APLOCU);
        player.opcalled = true;
        return true;
    }
}
