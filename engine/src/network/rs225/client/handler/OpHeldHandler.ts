import MessageHandler from '#/network/client/handler/MessageHandler.js';
import Player from '#/engine/entity/Player.js';
import Component from '#/cache/config/Component.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';
import Environment from '#/util/Environment.js';
import ObjType from '#/cache/config/ObjType.js';
import OpHeld from '#/network/client/model/OpHeld.js';

export default class OpHeldHandler extends MessageHandler<OpHeld> {
    handle(message: OpHeld, player: Player): boolean {
        const { obj: item, slot, component: comId } = message;

        const com = Component.get(comId);
        if (typeof com === 'undefined' || !player.isComponentVisible(com)) {
            return false;
        }

        const type = ObjType.get(item);
        if (message.op !== 5 && ((type.iop && !type.iop[message.op - 1]) || !type.iop)) {
            return false;
        }

        const listener = player.invListeners.find(l => l.com === comId);
        if (!listener) {
            return false;
        }

        const inv = player.getInventoryFromListener(listener);
        if (!inv || !inv.validSlot(slot) || !inv.hasAt(slot, item)) {
            return false;
        }

        if (player.delayed()) {
            return false;
        }

        player.lastItem = item;
        player.lastSlot = slot;

        player.clearInteraction();
        player.closeModal();
        player.moveClickRequest = false; // uses the dueling ring op to move whilst busy & queue pending: https://youtu.be/GPfN3Isl2rM
        player.faceEntity = -1;
        player.masks |= player.entitymask;

        let trigger: ServerTriggerType;
        if (message.op === 1) {
            trigger = ServerTriggerType.OPHELD1;
        } else if (message.op === 2) {
            trigger = ServerTriggerType.OPHELD2;
        } else if (message.op === 3) {
            trigger = ServerTriggerType.OPHELD3;
        } else if (message.op === 4) {
            trigger = ServerTriggerType.OPHELD4;
        } else {
            trigger = ServerTriggerType.OPHELD5;
        }

        player.addSessionLog(2, `opheld${message.op}: using ${type.debugname}`);

        const script = ScriptProvider.getByTrigger(trigger, type.id, type.category);
        if (script) {
            player.executeScript(ScriptRunner.init(script, player), true);
        } else if (Environment.NODE_DEBUG) {
            player.messageGame(`No trigger for [${ServerTriggerType.toString(trigger)},${type.debugname}]`);
        }

        return true;
    }
}
