import IncomingMessage from '#/network/client/IncomingMessage.js';
import ClientProtCategory from '#/network/client/prot/ClientProtCategory.js';

export default class OpLocT extends IncomingMessage {
    category = ClientProtCategory.USER_EVENT;

    constructor(
        readonly x: number,
        readonly z: number,
        readonly loc: number,
        readonly spellComponent: number
    ) {
        super();
    }
}
