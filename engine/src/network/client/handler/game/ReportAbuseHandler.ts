import Player from '#/engine/entity/Player.js';
import World from '#/engine/World.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import ReportAbuse, { ReportAbuseReason } from '#/network/client/model/game/ReportAbuse.js';
import Environment from '#/util/Environment.js';
import { fromBase37 } from '#/util/JString.js';

export default class ReportAbuseHandler extends MessageHandler<ReportAbuse> {
    handle(message: ReportAbuse, player: Player): boolean {
        if (player.reportAbuseProtect) {
            return false;
        }

        if (message.reason < ReportAbuseReason.OFFENSIVE_LANGUAGE || message.reason > ReportAbuseReason.REAL_WORLD_TRADING) {
            World.notifyPlayerBan('automated', player.username, Date.now() + 172800000);
            return false;
        }

        if (message.moderatorMute && player.staffModLevel > 0 && Environment.NODE_PRODUCTION) {
            // 2 day mute
            World.notifyPlayerMute(player.username, fromBase37(message.offender), Date.now() + 172800000);
        }

        World.notifyPlayerReport(player, fromBase37(message.offender), message.reason);
        player.messageGame('Thank-you, your abuse report has been received');
        player.reportAbuseProtect = true;
        return true;
    }
}
