import IncomingMessage from '#/network/client/IncomingMessage.js';
import ClientProtCategory from '#/network/client/prot/ClientProtCategory.js';

export default class IfPlayerDesign extends IncomingMessage {
    category = ClientProtCategory.USER_EVENT;

    constructor(
        readonly gender: number,
        readonly idkit: number[],
        readonly color: number[]
    ) {
        super();
    }
}
