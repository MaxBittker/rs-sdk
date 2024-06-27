import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';

export default class UpdateRebootTimer extends OutgoingMessage {
    priority = ServerProtPriority.LOW; // todo: confirm if reboot timer is low or high priority

    constructor(readonly ticks: number) {
        super();
    }
}