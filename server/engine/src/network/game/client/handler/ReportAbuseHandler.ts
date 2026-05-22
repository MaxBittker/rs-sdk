import Player from '#/engine/entity/Player.js';
import World from '#/engine/World.js';
import ClientGameMessageHandler from '#/network/game/client/ClientGameMessageHandler.js';
import ReportAbuse, { ReportAbuseReason } from '#/network/game/client/model/ReportAbuse.js';
import Environment from '#/util/Environment.js';
import { fromBase37 } from '#/util/JString.js';

export default class ReportAbuseHandler extends ClientGameMessageHandler<ReportAbuse> {
    handle(message: ReportAbuse, player: Player): boolean {
        if (player.reportAbuseProtect) {
            return false;
        }

        if (message.reason < ReportAbuseReason.OFFENSIVE_LANGUAGE || message.reason > ReportAbuseReason.REAL_WORLD_TRADING) {
            return false;
        }

        if (message.moderatorMute && player.staffModLevel > 0 && Environment.node.production) {
            // 2 day mute
            World.notifyPlayerMute(player.username, fromBase37(message.offender), Date.now() + 172800000);
        }

        World.notifyPlayerReport(player, fromBase37(message.offender), message.reason);
        player.messageGame('Thank-you, your abuse report has been received');
        player.reportAbuseProtect = true;
        return true;
    }
}
