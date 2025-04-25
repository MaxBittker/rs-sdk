import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class CamShake extends OutgoingMessage {
    priority = ServerProtPriority.BUFFERED;

    constructor(
        readonly type: number,
        readonly jitter: number,
        readonly amplitude: number,
        readonly frequency: number
    ) {
        super();
    }
}
