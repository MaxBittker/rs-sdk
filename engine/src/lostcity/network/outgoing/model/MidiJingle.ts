import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';

export default class MidiJingle extends OutgoingMessage {
    priority = ServerProtPriority.LOW;

    constructor(
        readonly delay: number,
        readonly data: Uint8Array
    ) {
        super();
    }
}