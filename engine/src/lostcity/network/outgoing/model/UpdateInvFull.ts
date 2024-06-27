import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';
import {Inventory} from '#lostcity/engine/Inventory.js';

export default class UpdateInvFull extends OutgoingMessage {
    priority = ServerProtPriority.HIGH;

    constructor(
        readonly component: number,
        readonly inv: Inventory
    ) {
        super();
    }
}