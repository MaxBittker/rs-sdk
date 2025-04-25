import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class MidiSong extends OutgoingMessage {
    priority = ServerProtPriority.BUFFERED;

    constructor(
        readonly name: string,
        readonly crc: number,
        readonly length: number
    ) {
        super();
    }
}
