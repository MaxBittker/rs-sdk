import MessageHandler from '#lostcity/network/incoming/handler/MessageHandler.js';
import OpLoc from '#lostcity/network/incoming/model/OpLoc.js';
import World from '#lostcity/engine/World.js';
import LocType from '#lostcity/cache/config/LocType.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';
import Interaction from '#lostcity/entity/Interaction.js';
import { NetworkPlayer } from '#lostcity/entity/NetworkPlayer.js';

export default class OpLocHandler extends MessageHandler<OpLoc> {
    handle(message: OpLoc, player: NetworkPlayer): boolean {
        const { x, z, loc: locId } = message;

        if (player.delayed()) {
            player.unsetMapFlag();
            return false;
        }

        const absLeftX = player.originX - 52;
        const absRightX = player.originX + 52;
        const absTopZ = player.originZ + 52;
        const absBottomZ = player.originZ - 52;
        if (x < absLeftX || x > absRightX || z < absBottomZ || z > absTopZ) {
            return false;
        }

        const loc = World.getLoc(x, z, player.level, locId);
        if (!loc) {
            player.unsetMapFlag();
            return false;
        }

        const locType = LocType.get(loc.type);
        if (!locType.op || !locType.op[message.op - 1]) {
            player.unsetMapFlag();
            return false;
        }

        let mode: ServerTriggerType;
        if (message.op === 1) {
            mode = ServerTriggerType.APLOC1;
        } else if (message.op === 2) {
            mode = ServerTriggerType.APLOC2;
        } else if (message.op === 3) {
            mode = ServerTriggerType.APLOC3;
        } else if (message.op === 4) {
            mode = ServerTriggerType.APLOC4;
        } else {
            mode = ServerTriggerType.APLOC5;
        }

        player.clearPendingAction();
        player.setInteraction(Interaction.ENGINE, loc, mode);
        player.opcalled = true;
        return true;
    }
}
