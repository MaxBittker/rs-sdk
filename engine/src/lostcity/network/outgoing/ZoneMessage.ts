import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';

export default abstract class ZoneMessage extends OutgoingMessage {
    priority = ServerProtPriority.HIGH;
    protected constructor(readonly coord: number) {
        super();
    }
}