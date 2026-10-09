import { CoordGrid } from '#/engine/CoordGrid.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import ClientGameMessageHandler from '#/network/game/client/ClientGameMessageHandler.js';
import MoveClick from '#/network/game/client/model/MoveClick.js';
import UnsetMapFlag from '#/network/game/server/model/UnsetMapFlag.js';
import Environment from '#/util/Environment.js';

import { findPath } from '#/engine/GameMap.js';

export default class MoveClickHandler extends ClientGameMessageHandler<MoveClick> {
    handle(message: MoveClick, player: NetworkPlayer): boolean {
        if (player.delayed) {
            player.write(new UnsetMapFlag());
            return false;
        }

        const start = message.path[0];

        // Validate input
        if (message.ctrlHeld < 0 || message.ctrlHeld > 1 || CoordGrid.distanceToSW(player, { x: start.x, z: start.z }) > 104) {
            player.unsetMapFlag();
            player.userPath = [];
            return false;
        }

        // Clear previous interaction — but not for op-click moves.
        // A MOVE_OPCLICK is always paired with a following op packet that clears+sets
        // the interaction itself. Clearing here would drop the target in the gap when
        // the per-tick user packet limit splits the pair across ticks.
        if (!message.opClick) {
            player.clearPendingAction();
        }

        // Handle ctrl run
        if (player.runenergy < 100 && message.ctrlHeld === 1) {
            player.tempRun = 0;
        } else {
            player.tempRun = message.ctrlHeld;
        }

        // Set new path
        if (Environment.node.clientRoutefinder) {
            player.userPath = [];

            for (let i = 0; i < message.path.length; i++) {
                player.userPath[i] = CoordGrid.packCoord(player.level, message.path[i].x, message.path[i].z);
            }
            player.queueWaypoints(player.userPath);

            player.processWalktrigger();
        } else {
            const dest = message.path[message.path.length - 1];
            player.queueWaypoints(findPath(player.level, player.x, player.z, dest.x, dest.z));
        }

        return true;
    }
}
