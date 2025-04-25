import IncomingMessage from '#/network/client/IncomingMessage.js';
import ClientProtCategory from '#/network/client/prot/ClientProtCategory.js';

export default class EventTracking extends IncomingMessage {
    category = ClientProtCategory.RESTRICTED_EVENT;

    constructor(readonly bytes: Uint8Array) {
        super();
    }
}
