import IncomingMessage from '#/network/client/IncomingMessage.js';
import ClientProtCategory from '#/network/client/prot/ClientProtCategory.js';

export default class MessagePrivate extends IncomingMessage {
    category = ClientProtCategory.USER_EVENT;

    constructor(
        readonly username: bigint,
        readonly input: Uint8Array
    ) {
        super();
    }
}
