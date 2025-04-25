import { Inventory } from '#/engine/Inventory.js';
import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtPriority } from '#/network/server/prot/ServerProtPriority.js';

export default class UpdateInvPartial extends OutgoingMessage {
    priority = ServerProtPriority.IMMEDIATE;

    readonly slots: number[];

    constructor(
        readonly component: number,
        readonly inv: Inventory,
        ...slots: number[]
    ) {
        super();
        this.slots = slots;
    }
}
