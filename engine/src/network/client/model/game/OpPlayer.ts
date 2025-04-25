import IncomingMessage from '#/network/client/IncomingMessage.js';
import ClientProtCategory from '#/network/client/prot/ClientProtCategory.js';

export default class OpPlayer extends IncomingMessage {
    category = ClientProtCategory.USER_EVENT;

    constructor(
        readonly op: number,
        readonly pid: number
    ) {
        super();
    }
}
