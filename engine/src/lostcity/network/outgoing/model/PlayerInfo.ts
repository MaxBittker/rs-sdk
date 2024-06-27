import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';
import Player from '#lostcity/entity/Player.js';

// this is slightly unsafe.
export default class PlayerInfo extends OutgoingMessage {
    priority = ServerProtPriority.HIGH;

    constructor(
        readonly player: Player
    ) {
        super();
    }
}