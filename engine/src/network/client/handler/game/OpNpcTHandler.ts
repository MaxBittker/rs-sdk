import * as rsbuf from '@2004scape/rsbuf';

import Component, { ComActionTarget } from '#/cache/config/Component.js';
import { Interaction } from '#/engine/entity/Interaction.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import World from '#/engine/World.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import OpNpcT from '#/network/client/model/game/OpNpcT.js';
import UnsetMapFlag from '#/network/server/model/game/UnsetMapFlag.js';

export default class OpNpcTHandler extends MessageHandler<OpNpcT> {
    handle(message: OpNpcT, player: NetworkPlayer): boolean {
        const { nid, spellComponent: spellComId } = message;

        if (player.delayed) {
            player.write(new UnsetMapFlag());
            return false;
        }

        const spellCom = Component.get(spellComId);
        if (typeof spellCom === 'undefined' || !player.isComponentVisible(spellCom) || (spellCom.actionTarget & ComActionTarget.NPC) === 0) {
            player.write(new UnsetMapFlag());
            player.clearPendingAction();
            return false;
        }

        const npc = World.getNpc(nid);
        if (!npc || npc.delayed) {
            player.write(new UnsetMapFlag());
            player.clearPendingAction();
            return false;
        }

        if (!rsbuf.hasNpc(player.pid, npc.nid)) {
            player.write(new UnsetMapFlag());
            player.clearPendingAction();
            return false;
        }

        player.clearPendingAction();
        player.setInteraction(Interaction.ENGINE, npc, ServerTriggerType.APNPCT, spellComId);
        player.opcalled = true;
        return true;
    }
}
