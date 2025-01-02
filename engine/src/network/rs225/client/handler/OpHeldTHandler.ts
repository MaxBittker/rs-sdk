import MessageHandler from '#/network/client/handler/MessageHandler.js';
import Player from '#/engine/entity/Player.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';
import Environment from '#/util/Environment.js';
import Component from '#/cache/config/Component.js';
import OpHeldT from '#/network/client/model/OpHeldT.js';
import ObjType from '#/cache/config/ObjType.js';

export default class OpHeldTHandler extends MessageHandler<OpHeldT> {
    handle(message: OpHeldT, player: Player): boolean {
        const { obj: item, slot, component: comId, spellComponent: spellComId } = message;

        const com = Component.get(comId);
        if (typeof com === 'undefined' || !player.isComponentVisible(com)) {
            return false;
        }

        const spellCom = Component.get(spellComId);
        if (typeof spellCom === 'undefined' || !player.isComponentVisible(spellCom)) {
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
        player.faceEntity = -1;
        player.masks |= player.entitymask;

        player.addSessionLog(2, `opheldt: casting ${spellCom.comName} on ${ObjType.get(item).debugname}`);

        const script = ScriptProvider.getByTrigger(ServerTriggerType.OPHELDT, spellComId, -1);
        if (script) {
            player.executeScript(ScriptRunner.init(script, player), true);
        } else {
            if (Environment.NODE_DEBUG) {
                player.messageGame(`No trigger for [opheldt,${spellCom.comName}]`);
            }

            // todo: is this appropriate?
            player.messageGame('Nothing interesting happens.');
        }

        return true;
    }
}
