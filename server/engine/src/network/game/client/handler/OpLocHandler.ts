import LocType from '#/cache/config/LocType.js';
import { Interaction } from '#/engine/entity/Interaction.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import World from '#/engine/World.js';
import ClientGameMessageHandler from '#/network/game/client/ClientGameMessageHandler.js';
import OpLoc from '#/network/game/client/model/OpLoc.js';
import UnsetMapFlag from '#/network/game/server/model/UnsetMapFlag.js';

export default class OpLocHandler extends ClientGameMessageHandler<OpLoc> {
    handle(message: OpLoc, player: NetworkPlayer): boolean {
        const { x, z, loc: locId } = message;

        if (player.delayed) {
            // normal: cannot interact while delayed
            player.write(new UnsetMapFlag());
            return false;
        }

        const absLeftX = player.originX - 52;
        const absRightX = player.originX + 52;
        const absTopZ = player.originZ + 52;
        const absBottomZ = player.originZ - 52;
        if (x < absLeftX || x > absRightX || z < absBottomZ || z > absTopZ) {
            // bad client: tile is not visible on client
            player.write(new UnsetMapFlag());
            return false;
        }

        const loc = World.getLoc(x, z, player.level, locId);
        if (!loc) {
            // bad client or lag: loc does not exist
            player.write(new UnsetMapFlag());
            return false;
        }

        let locType = LocType.get(loc.type);
        if (locType.multivarbit !== -1) {
            const state = player.getVarBit(locType.multivarbit);

            if (state >= 0 && state < locType.multiloc.length && locType.multiloc[state] !== -1) {
                locType = LocType.get(locType.multiloc[state]);
            }
        }

        if (!locType.op || locType.op[message.op - 1] === null || locType.op[message.op - 1] === 'hidden') {
            // bad client: not a valid loc option
            player.write(new UnsetMapFlag());
            return false;
        }

        const trigger: ServerTriggerType = ServerTriggerType.APLOC1 + (message.op - 1);
        player.clearPendingAction();
        player.setInteraction(Interaction.ENGINE, loc, trigger);
        player.opcalled = true;
        return true;
    }
}
