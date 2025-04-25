import IncomingMessage from '#/network/client/IncomingMessage.js';
import ClientProtCategory from '#/network/client/prot/ClientProtCategory.js';

export default class InvButton extends IncomingMessage {
    category = ClientProtCategory.USER_EVENT;

    constructor(
        readonly op: number,
        readonly obj: number,
        readonly slot: number,
        readonly component: number
    ) {
        super();
    }
}
