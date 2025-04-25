import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class UpdateFriendList extends OutgoingMessage {
    priority = ServerProtPriority.BUFFERED;

    constructor(
        readonly name: bigint,
        readonly nodeId: number
    ) {
        super();
    }
}
