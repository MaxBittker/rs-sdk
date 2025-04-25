import IncomingMessage from '#/network/client/IncomingMessage.js';
import ClientProtCategory from '#/network/client/prot/ClientProtCategory.js';

export default class OpPlayerT extends IncomingMessage {
    category = ClientProtCategory.USER_EVENT;

    constructor(
        readonly pid: number,
        readonly spellComponent: number
    ) {
        super();
    }
}
