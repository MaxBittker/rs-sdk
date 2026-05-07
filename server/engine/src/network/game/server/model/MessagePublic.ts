import ServerGameMessage from '#/network/game/server/ServerGameMessage.js';

export default class MessagePublic extends ServerGameMessage {
    constructor(
        readonly from: bigint,
        readonly msg: string
    ) {
        super();
    }
}
