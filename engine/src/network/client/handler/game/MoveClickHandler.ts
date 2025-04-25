import { CoordGrid } from '#/engine/CoordGrid.js';
import { NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import MoveClick from '#/network/client/model/game/MoveClick.js';
import UnsetMapFlag from '#/network/server/model/game/UnsetMapFlag.js';
import Environment from '#/util/Environment.js';
import { WalkTriggerSetting } from '#/util/WalkTriggerSetting.js';

export default class MoveClickHandler extends MessageHandler<MoveClick> {
    handle(message: MoveClick, player: NetworkPlayer): boolean {
        if (player.delayed) {
            player.write(new UnsetMapFlag());
            return false;
        }
        const start = message.path[0];
        if (message.ctrlHeld < 0 || message.ctrlHeld > 1 || CoordGrid.distanceToSW(player, { x: start.x, z: start.z }) > 104) {
            player.unsetMapFlag();
            player.userPath = [];
            return false;
        }

        if (Environment.NODE_CLIENT_ROUTEFINDER) {
            if (message.path.length === 1 && start.x === player.x && start.z === player.z) {
                // this check ignores setting the path when the player is clicking on their current tile
                player.userPath = [];
            } else {
                player.userPath = [];

                for (let i = 0; i < message.path.length; i++) {
                    player.userPath[i] = CoordGrid.packCoord(player.level, message.path[i].x, message.path[i].z);
                }
            }
        } else {
            const dest = message.path[message.path.length - 1];
            player.userPath = [CoordGrid.packCoord(player.level, dest.x, dest.z)];
        }
        if (Environment.NODE_WALKTRIGGER_SETTING === WalkTriggerSetting.PLAYERPACKET) {
            player.pathToMoveClick(player.userPath, !Environment.NODE_CLIENT_ROUTEFINDER);
        }
        if (!message.opClick) {
            player.clearPendingAction();
            if (player.runenergy < 100 && message.ctrlHeld === 1) {
                player.tempRun = 0;
            } else {
                player.tempRun = message.ctrlHeld;
            }
            if (Environment.NODE_WALKTRIGGER_SETTING === WalkTriggerSetting.PLAYERPACKET && player.hasWaypoints()) {
                player.processWalktrigger();
            }
        }
        return true;
    }
}
