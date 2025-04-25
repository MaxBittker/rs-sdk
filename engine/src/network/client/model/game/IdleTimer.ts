import IncomingMessage from '#/network/client/IncomingMessage.js';
import ClientProtCategory from '#/network/client/prot/ClientProtCategory.js';

export default class IdleTimer extends IncomingMessage {
    category = ClientProtCategory.CLIENT_EVENT;
}
