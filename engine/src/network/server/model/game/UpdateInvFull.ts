import { Inventory } from '#/engine/Inventory.js';
import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class UpdateInvFull extends OutgoingMessage {
    priority = ServerProtPriority.IMMEDIATE;

    constructor(
        readonly component: number,
        readonly inv: Inventory
    ) {
        super();
    }
}
