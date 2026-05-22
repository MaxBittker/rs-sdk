import * as rsbuf from '#/network/rsbuf/index.js';

import Component, { ComActionTarget } from '#/cache/config/Component.js';
import { Interaction } from '#/engine/entity/Interaction.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import World from '#/engine/World.js';
import ClientGameMessageHandler from '#/network/game/client/ClientGameMessageHandler.js';
import OpPlayerT from '#/network/game/client/model/OpPlayerT.js';
import UnsetMapFlag from '#/network/game/server/model/UnsetMapFlag.js';

export default class OpPlayerTHandler extends ClientGameMessageHandler<OpPlayerT> {
    handle(message: OpPlayerT, player: NetworkPlayer): boolean {
        const { playerSlot, spellCom: spellComId } = message;

        if (player.delayed) {
            // normal: cannot interact while delayed
            player.write(new UnsetMapFlag());
            return false;
        }

        const spellCom = Component.get(spellComId);
        if (typeof spellCom === 'undefined' || (spellCom.actionTarget & ComActionTarget.PLAYER) === 0) {
            // bad client: component is not acceptable for this packet
            player.write(new UnsetMapFlag());
            return false;
        } else if (!player.isComponentVisible(spellCom)) {
            // bad client or lag: component is not visible
            player.write(new UnsetMapFlag());
            return false;
        }

        const other = World.getPlayer(playerSlot);
        if (!other) {
            // bad client or lag: player does not exist
            player.write(new UnsetMapFlag());
            return false;
        }

        if (!rsbuf.hasPlayer(player.slot, other.slot)) {
            // bad client or lag: player is not visible on client
            player.write(new UnsetMapFlag());
            return false;
        }

        player.clearPendingAction();
        player.setInteraction(Interaction.ENGINE, other, ServerTriggerType.APPLAYERT, spellComId);
        player.opcalled = true;
        return true;
    }
}
