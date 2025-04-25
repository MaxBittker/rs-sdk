import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class CamMoveTo extends OutgoingMessage {
    priority = ServerProtPriority.BUFFERED;

    constructor(
        readonly x: number,
        readonly z: number,
        readonly height: number,
        readonly speed: number,
        readonly multiplier: number
    ) {
        super();
    }
}
