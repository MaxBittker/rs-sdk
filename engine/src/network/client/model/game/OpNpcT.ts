import IncomingMessage from '#/network/client/IncomingMessage.js';
import ClientProtCategory from '#/network/client/prot/ClientProtCategory.js';

export default class OpNpcT extends IncomingMessage {
    category = ClientProtCategory.USER_EVENT;

    constructor(
        readonly nid: number,
        readonly spellComponent: number
    ) {
        super();
    }
}
