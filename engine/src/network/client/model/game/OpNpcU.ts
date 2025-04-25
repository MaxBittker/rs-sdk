import IncomingMessage from '#/network/client/IncomingMessage.js';
import ClientProtCategory from '#/network/client/prot/ClientProtCategory.js';

export default class OpNpcU extends IncomingMessage {
    category = ClientProtCategory.USER_EVENT;

    constructor(
        readonly nid: number,
        readonly useObj: number,
        readonly useSlot: number,
        readonly useComponent: number
    ) {
        super();
    }
}
