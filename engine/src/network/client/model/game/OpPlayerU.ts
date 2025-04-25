import IncomingMessage from '#/network/client/IncomingMessage.js';
import ClientProtCategory from '#/network/client/prot/ClientProtCategory.js';

export default class OpPlayerU extends IncomingMessage {
    category = ClientProtCategory.USER_EVENT;

    constructor(
        readonly pid: number,
        readonly useObj: number,
        readonly useSlot: number,
        readonly useComponent: number
    ) {
        super();
    }
}
