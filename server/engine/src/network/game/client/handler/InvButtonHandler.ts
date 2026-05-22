import Component from '#/cache/config/Component.js';
import Player from '#/engine/entity/Player.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import ClientGameMessageHandler from '#/network/game/client/ClientGameMessageHandler.js';
import InvButton from '#/network/game/client/model/InvButton.js';
import Environment from '#/util/Environment.js';

export default class InvButtonHandler extends ClientGameMessageHandler<InvButton> {
    handle(message: InvButton, player: Player): boolean {
        const { obj, slot, com: comId } = message;

        if (player.delayed) {
            // normal: cannot interact while delayed
            return false;
        }

        const com = Component.get(comId);
        if (typeof com === 'undefined') {
            // bad client: component is not acceptable for this packet
            return false;
        } else if (!player.isComponentVisible(com)) {
            // bad client or lag: component is not visible
            return false;
        }

        if (!com.iop || com.iop[message.op - 1] === null) {
            // bad client: not a valid interface option
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
            return false;
        }

        player.lastItem = obj;
        player.lastSlot = slot;

        const trigger: ServerTriggerType = ServerTriggerType.INV_BUTTON1 + (message.op - 1);
        const script = ScriptProvider.getByTrigger(trigger, comId, -1);
        if (script) {
            const root = Component.get(com.rootLayer);
            player.executeScript(ScriptRunner.init(script, player), root.overlay == false);
        } else if (Environment.node.debug) {
            player.messageGame(`No trigger for [${ServerTriggerType.toString(trigger)},${com.comName}]`);
        }

        return true;
    }
}
