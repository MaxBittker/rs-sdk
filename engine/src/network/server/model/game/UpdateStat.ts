import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class UpdateStat extends OutgoingMessage {
    priority = ServerProtPriority.BUFFERED;

    constructor(
        readonly stat: number,
        readonly exp: number,
        readonly level: number
    ) {
        super();
    }
}
