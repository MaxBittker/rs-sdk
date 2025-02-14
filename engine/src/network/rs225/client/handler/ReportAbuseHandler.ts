import MessageHandler from '#/network/client/handler/MessageHandler.js';
import Player from '#/engine/entity/Player.js';
import ReportAbuse from '#/network/client/model/ReportAbuse.js';
import World from '#/engine/World.js';
import { fromBase37 } from '#/util/JString.js';

export default class ReportAbuseHandler extends MessageHandler<ReportAbuse> {
    handle(message: ReportAbuse, player: Player): boolean {
        if (message.reason > 11 || fromBase37(message.offender) === 'invalid_name') {
            World.notifyPlayerBan('automated', player.username, Date.now() + 172800000);
            return false;
        }

        if (message.moderatorMute && player.staffModLevel > 0) {
            // 2 day mute
            World.notifyPlayerMute(player.username, fromBase37(message.offender), Date.now() + 172800000);
        }

        World.notifyPlayerReport(player, fromBase37(message.offender), message.reason);
        player.messageGame('Thank-you, your abuse report has been received.');
        return true;
    }
}
