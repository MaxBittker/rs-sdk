import Component from '#/cache/config/Component.js';
import ObjType from '#/cache/config/ObjType.js';
import Player from '#/engine/entity/Player.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import ClientGameMessageHandler from '#/network/game/client/ClientGameMessageHandler.js';
import OpHeld from '#/network/game/client/model/OpHeld.js';
import { LoggerEventType } from '#/server/logger/LoggerEventType.js';
import Environment from '#/util/Environment.js';

export default class OpHeldHandler extends ClientGameMessageHandler<OpHeld> {
    handle(message: OpHeld, player: Player): boolean {
        const { obj: objId, slot, com: comId } = message;

        if (player.delayed) {
            // normal: cannot interact while delayed
            return false;
        }

        const com = Component.get(comId);
        if (typeof com === 'undefined' || !com.operable) {
            // bad client: component is not acceptable for this packet
            return false;
        } else if (!player.isComponentVisible(com)) {
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
        } else if (!inv.hasAt(slot, objId)) {
            // bad client or lag: item does not exist in inventory
            return false;
        }

        const obj = ObjType.get(objId);
        if (obj.iop[message.op - 1] === null) {
            // bad client: not a valid item option
            return false;
        }

        player.lastItem = objId;
        player.lastSlot = slot;

        if (com.rootLayer != player.modalMain) {
            player.clearPendingAction();
        }

        player.moveClickRequest = false; // uses the dueling ring op to move whilst busy & queue pending: https://youtu.be/GPfN3Isl2rM

        // opheld5 gets wealth logged in content
        if (message.op !== 5) {
            player.addSessionLog(LoggerEventType.MODERATOR, `${obj.iop[message.op - 1]} ${obj.debugname}`);
        }

        const trigger: ServerTriggerType = ServerTriggerType.OPHELD1 + (message.op - 1);
        const script = ScriptProvider.getByTrigger(trigger, obj.id, obj.category);
        if (script) {
            player.executeScript(ScriptRunner.init(script, player), true);
        } else if (Environment.node.debug) {
            player.messageGame(`No trigger for [${ServerTriggerType.toString(trigger)},${obj.debugname}]`);
        }

        return true;
    }
}
