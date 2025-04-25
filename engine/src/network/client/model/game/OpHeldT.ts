import IncomingMessage from '#/network/client/IncomingMessage.js';
import ClientProtCategory from '#/network/client/prot/ClientProtCategory.js';

export default class OpHeldT extends IncomingMessage {
    category = ClientProtCategory.USER_EVENT;

    constructor(
        readonly obj: number,
        readonly slot: number,
        readonly component: number,
        readonly spellComponent: number
    ) {
        super();
    }
}
