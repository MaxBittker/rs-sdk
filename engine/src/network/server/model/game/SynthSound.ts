import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class SynthSound extends OutgoingMessage {
    priority = ServerProtPriority.BUFFERED;

    constructor(
        readonly synth: number,
        readonly loops: number,
        readonly delay: number
    ) {
        super();
    }
}
