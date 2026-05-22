import Component, { ComActionTarget } from '#/cache/config/Component.js';
import ObjType from '#/cache/config/ObjType.js';
import Player from '#/engine/entity/Player.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import ClientGameMessageHandler from '#/network/game/client/ClientGameMessageHandler.js';
import OpHeldT from '#/network/game/client/model/OpHeldT.js';
import { LoggerEventType } from '#/server/logger/LoggerEventType.js';
import Environment from '#/util/Environment.js';

export default class OpHeldTHandler extends ClientGameMessageHandler<OpHeldT> {
    handle(message: OpHeldT, player: Player): boolean {
        const { obj, slot, com: comId, spellCom: spellComId } = message;

        if (player.delayed) {
            // normal: cannot interact while delayed
            return false;
        }

        const spellCom = Component.get(spellComId);
        if (typeof spellCom === 'undefined' || (spellCom.actionTarget & ComActionTarget.HELD) === 0) {
            // bad client: component is not acceptable for this packet
            return false;
        } else if (!player.isComponentVisible(spellCom)) {
            // bad client or lag: component is not visible
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

        player.clearPendingAction();

        player.addSessionLog(LoggerEventType.MODERATOR, `Cast ${spellCom.comName} on ${ObjType.get(obj).debugname}`);

        const script = ScriptProvider.getByTrigger(ServerTriggerType.OPHELDT, spellComId, -1);
        if (script) {
            player.executeScript(ScriptRunner.init(script, player), true);
        } else {
            if (Environment.node.debug) {
                player.messageGame(`No trigger for [opheldt,${spellCom.comName}]`);
            }

            // todo: is this appropriate?
            player.messageGame('Nothing interesting happens.');
        }

        return true;
    }
}
