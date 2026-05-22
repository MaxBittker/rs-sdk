import CategoryType from '#/cache/config/CategoryType.js';
import Component from '#/cache/config/Component.js';
import ObjType from '#/cache/config/ObjType.js';
import Player from '#/engine/entity/Player.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import ClientGameMessageHandler from '#/network/game/client/ClientGameMessageHandler.js';
import OpHeldU from '#/network/game/client/model/OpHeldU.js';
import Environment from '#/util/Environment.js';

export default class OpHeldUHandler extends ClientGameMessageHandler<OpHeldU> {
    handle(message: OpHeldU, player: Player): boolean {
        const { obj, slot, com: comId, useObj, useSlot, useCom: useComId } = message;

        if (player.delayed) {
            // normal: cannot interact while delayed
            return false;
        }

        if (comId !== useComId) {
            // bad client: opheldu cannot target different components
            return false;
        }

        const com = Component.get(comId);
        if (typeof com === 'undefined' || !com.usable) {
            // bad client: component is not acceptable for this packet
            return false;
        } else if (!player.isComponentVisible(com)) {
            // bad client or lag: component is not visible
            return false;
        }

        const useCom = Component.get(useComId);
        if (typeof useCom === 'undefined' || !useCom.usable) {
            // bad client: component is not acceptable for this packet
            return false;
        } else if (!player.isComponentVisible(useCom)) {
            // bad client or lag: component is not visible
            return false;
        }

        const listener = player.invListeners.find(l => l.com === comId);
        const inv = player.getInventoryFromListener(listener);
        if (!inv) {
            // bad client or lag: inventory is not transmitted to client
            return false;
        }

        if (!inv.validSlot(slot)) {
            // bad client: real inventory is smaller
            return false;
        } else if (!inv.hasAt(slot, obj)) {
            // bad client or lag: item does not exist in inventory
            player.moveClickRequest = false; // removed early osrs
            player.clearPendingAction();
            return false;
        }

        const useListener = player.invListeners.find(l => l.com === useComId);
        const useInv = player.getInventoryFromListener(useListener);
        if (!useInv) {
            // bad client or lag: inventory is not transmitted to client
            return false;
        }

        if (!useInv.validSlot(useSlot)) {
            // bad client: real inventory is smaller
            return false;
        } else if (!useInv.hasAt(useSlot, useObj)) {
            // bad client or lag: item does not exist in inventory
            player.moveClickRequest = false; // removed early osrs
            player.clearPendingAction();
            return false;
        }

        player.lastItem = obj;
        player.lastSlot = slot;
        player.lastUseItem = useObj;
        player.lastUseSlot = useSlot;

        const objType = ObjType.get(player.lastItem);
        const useObjType = ObjType.get(player.lastUseItem);

        player.clearPendingAction();

        if ((objType.members || useObjType.members) && !Environment.node.members) {
            player.messageGame("To use this item please login to a members' server.");
            return false;
        }

        // [opheldu,b]
        let script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.OPHELDU, objType.id, -1);

        // [opheldu,a]
        if (!script) {
            script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.OPHELDU, useObjType.id, -1);
            [player.lastItem, player.lastUseItem] = [player.lastUseItem, player.lastItem];
            [player.lastSlot, player.lastUseSlot] = [player.lastUseSlot, player.lastSlot];
        }

        // [opheld,b_category]
        const objCategory = objType.category !== -1 ? CategoryType.get(objType.category) : null;
        if (!script && objCategory) {
            script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.OPHELDU, -1, objCategory.id);
        }

        // [opheld,a_category]
        const useObjCategory = useObjType.category !== -1 ? CategoryType.get(useObjType.category) : null;
        if (!script && useObjCategory) {
            script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.OPHELDU, -1, useObjCategory.id);
            [player.lastItem, player.lastUseItem] = [player.lastUseItem, player.lastItem];
            [player.lastSlot, player.lastUseSlot] = [player.lastUseSlot, player.lastSlot];
        }

        if (script) {
            player.executeScript(ScriptRunner.init(script, player), true);
        } else {
            if (Environment.node.debug) {
                player.messageGame(`No trigger for [opheldu,${objType.debugname}]`);
            }

            // todo: is this appropriate?
            player.messageGame('Nothing interesting happens.');
        }

        return true;
    }
}
