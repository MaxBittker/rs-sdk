import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';

export default class SynthSound extends OutgoingMessage {
    priority = ServerProtPriority.LOW;

    constructor(
        readonly synth: number,
        readonly loops: number,
        readonly delay: number
    ) {
        super();
    }
}