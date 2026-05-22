import Component from '#/cache/config/Component.js';
import ObjType from '#/cache/config/ObjType.js';
import { Interaction } from '#/engine/entity/Interaction.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import World from '#/engine/World.js';
import ClientGameMessageHandler from '#/network/game/client/ClientGameMessageHandler.js';
import OpObjU from '#/network/game/client/model/OpObjU.js';
import UnsetMapFlag from '#/network/game/server/model/UnsetMapFlag.js';
import Environment from '#/util/Environment.js';

export default class OpObjUHandler extends ClientGameMessageHandler<OpObjU> {
    handle(message: OpObjU, player: NetworkPlayer): boolean {
        const { x, z, obj: objId, useObj, useSlot, useCom: useComId } = message;

        if (player.delayed) {
            // normal: cannot interact while delayed
            player.write(new UnsetMapFlag());
            return false;
        }

        const absLeftX = player.originX - 52;
        const absRightX = player.originX + 52;
        const absTopZ = player.originZ + 52;
        const absBottomZ = player.originZ - 52;
        if (x < absLeftX || x > absRightX || z < absBottomZ || z > absTopZ) {
            // bad client: tile is not visible on client
            player.write(new UnsetMapFlag());
            return false;
        }

        const obj = World.getObj(x, z, player.level, objId, player.hash64);
        if (!obj) {
            // bad client or lag: obj does not exist
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

        player.clearPendingAction();

        if (ObjType.get(useObj).members && !Environment.node.members) {
            player.messageGame("To use this item please login to a members' server.");
            player.write(new UnsetMapFlag());
            return false;
        }

        player.lastUseItem = useObj;
        player.lastUseSlot = useSlot;

        player.setInteraction(Interaction.ENGINE, obj, ServerTriggerType.APOBJU);
        player.opcalled = true;
        return true;
    }
}
