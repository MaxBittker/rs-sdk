import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class MessagePrivate extends OutgoingMessage {
    priority = ServerProtPriority.IMMEDIATE;

    constructor(
        readonly from: bigint,
        readonly messageId: number,
        readonly staffModLevel: number,
        readonly msg: string
    ) {
        super();
    }
}
