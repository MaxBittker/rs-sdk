import IncomingMessage from '#/network/client/IncomingMessage.js';
import ClientProtCategory from '#/network/client/prot/ClientProtCategory.js';

export default class OpHeldU extends IncomingMessage {
    category = ClientProtCategory.USER_EVENT;

    constructor(
        readonly obj: number,
        readonly slot: number,
        readonly component: number,
        readonly useObj: number,
        readonly useSlot: number,
        readonly useComponent: number
    ) {
        super();
    }
}
