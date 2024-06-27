import MessageHandler from '#lostcity/network/incoming/handler/MessageHandler.js';
import Player from '#lostcity/entity/Player.js';
import InvButtonD from '#lostcity/network/incoming/model/InvButtonD.js';
import Component from '#lostcity/cache/config/Component.js';
import Environment from '#lostcity/util/Environment.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import ScriptRunner from '#lostcity/engine/script/ScriptRunner.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';
import UpdateInvPartial from '#lostcity/network/outgoing/model/UpdateInvPartial.js';

export default class InvButtonDHandler extends MessageHandler<InvButtonD> {
    handle(message: InvButtonD, player: Player): boolean {
        // jagex has if_buttond
        const { component: comId, slot, targetSlot } = message;

        const com = Component.get(comId);
        if (typeof com === 'undefined' || !player.isComponentVisible(com)) {
            return false;
        }

        const listener = player.invListeners.find(l => l.com === comId);
        if (!listener) {
            return false;
        }

        const inv = player.getInventoryFromListener(listener);
        if (!inv || !inv.validSlot(slot) || !inv.get(slot) || !inv.validSlot(targetSlot)) {
            return false;
        }

        if (player.delayed()) {
            // do nothing; revert the client visual
            player.write(new UpdateInvPartial(comId, inv, slot, targetSlot));
            return false;
        }

        player.lastSlot = slot;
        player.lastTargetSlot = targetSlot;

        const dragTrigger = ScriptProvider.getByTrigger(ServerTriggerType.INV_BUTTOND, comId);
        if (dragTrigger) {
            const root = Component.get(com.rootLayer);

            player.executeScript(ScriptRunner.init(dragTrigger, player), root.overlay == false);
        } else {
            if (Environment.LOCAL_DEV) {
                player.messageGame(`No trigger for [inv_buttond,${com.comName}]`);
            }
        }

        return true;
    }
}
