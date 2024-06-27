import MessageHandler from '#lostcity/network/incoming/handler/MessageHandler.js';
import { NetworkPlayer } from '#lostcity/entity/NetworkPlayer.js';
import Component from '#lostcity/cache/config/Component.js';
import OpLocT from '#lostcity/network/incoming/model/OpLocT.js';
import World from '#lostcity/engine/World.js';
import Interaction from '#lostcity/entity/Interaction.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';

export default class OpLocTHandler extends MessageHandler<OpLocT> {
    handle(message: OpLocT, player: NetworkPlayer): boolean {
        const { x, z, loc: locId, spellComponent: spellComId } = message;

        if (player.delayed()) {
            player.unsetMapFlag();
            return false;
        }

        const spellCom = Component.get(spellComId);
        if (typeof spellCom === 'undefined' || !player.isComponentVisible(spellCom)) {
            player.unsetMapFlag();
            return false;
        }

        const absLeftX = player.originX - 52;
        const absRightX = player.originX + 52;
        const absTopZ = player.originZ + 52;
        const absBottomZ = player.originZ - 52;
        if (x < absLeftX || x > absRightX || z < absBottomZ || z > absTopZ) {
            player.unsetMapFlag();
            return false;
        }

        const loc = World.getLoc(x, z, player.level, locId);
        if (!loc) {
            player.unsetMapFlag();
            return false;
        }

        player.clearPendingAction();
        player.setInteraction(Interaction.ENGINE, loc, ServerTriggerType.APLOCT, { type: loc.type, com: spellComId });
        player.opcalled = true;
        return true;
    }
}
