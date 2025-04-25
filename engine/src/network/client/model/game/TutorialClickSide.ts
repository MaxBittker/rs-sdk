import IncomingMessage from '#/network/client/IncomingMessage.js';
import ClientProtCategory from '#/network/client/prot/ClientProtCategory.js';

export default class TutorialClickSide extends IncomingMessage {
    category = ClientProtCategory.USER_EVENT;

    constructor(readonly tab: number) {
        super();
    }
}
