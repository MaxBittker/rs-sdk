import * as rsbuf from '@2004scape/rsbuf';

import Component, { ComActionTarget } from '#/cache/config/Component.js';
import { Interaction } from '#/engine/entity/Interaction.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import World from '#/engine/World.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import OpPlayerT from '#/network/client/model/game/OpPlayerT.js';
import UnsetMapFlag from '#/network/server/model/game/UnsetMapFlag.js';

export default class OpPlayerTHandler extends MessageHandler<OpPlayerT> {
    handle(message: OpPlayerT, player: NetworkPlayer): boolean {
        const { pid, spellComponent: spellComId } = message;

        if (player.delayed) {
            player.write(new UnsetMapFlag());
            return false;
        }

        const spellCom = Component.get(spellComId);
        if (typeof spellCom === 'undefined' || !player.isComponentVisible(spellCom) || (spellCom.actionTarget & ComActionTarget.PLAYER) === 0) {
            player.write(new UnsetMapFlag());
            player.clearPendingAction();
            return false;
        }

        const other = World.getPlayer(pid);
        if (!other) {
            player.write(new UnsetMapFlag());
            player.clearPendingAction();
            return false;
        }

        if (!rsbuf.hasPlayer(player.pid, other.pid)) {
            player.write(new UnsetMapFlag());
            player.clearPendingAction();
            return false;
        }

        player.clearPendingAction();
        player.setInteraction(Interaction.ENGINE, other, ServerTriggerType.APPLAYERT, spellComId);
        player.opcalled = true;
        return true;
    }
}
