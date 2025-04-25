import Player from '#/engine/entity/Player.js';
import MessageHandler from '#/network/client/handler/MessageHandler.js';
import EventTracking from '#/network/client/model/game/EventTracking.js';
import Environment from '#/util/Environment.js';

export default class EventTrackingHandler extends MessageHandler<EventTracking> {
    handle(message: EventTracking, player: Player): boolean {
        const bytes: Uint8Array = message.bytes;
        if (bytes.length === 0 || bytes.length > 500) {
            return false;
        }
        if (!player.input.isActive()) {
            return false;
        }
        // Mark that the player has sent at least one report in this tracking.
        player.input.hasSeenReport = true;
        // Only parse the data if we're specifically profiling this player.
        if (!player.input.shouldSubmitTrackingDetails()) {
            return true;
        }
        if (player.input.recordedBlobsSizeTotal > Environment.NODE_LIMIT_BYTES_PER_TRACKING_SESSION) {
            // An upper limit for the quantity of data used for a tracking session.
            // Prevents further parsing/storing of events.
            return false;
        }
        player.input.record(bytes);
        return true;
    }
}
