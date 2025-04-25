import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class MidiJingle extends OutgoingMessage {
    priority = ServerProtPriority.BUFFERED;

    constructor(
        readonly delay: number,
        readonly data: Uint8Array
    ) {
        super();
    }
}
