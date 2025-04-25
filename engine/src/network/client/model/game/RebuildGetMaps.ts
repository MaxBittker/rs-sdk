import IncomingMessage from '#/network/client/IncomingMessage.js';
import ClientProtCategory from '#/network/client/prot/ClientProtCategory.js';

export default class RebuildGetMaps extends IncomingMessage {
    category = ClientProtCategory.RESTRICTED_EVENT;

    constructor(readonly maps: Int32Array) {
        super();
    }
}
