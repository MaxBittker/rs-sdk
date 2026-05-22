import ServerGameMessage from '#/network/game/server/ServerGameMessage.js';

export default class MinimapToggle extends ServerGameMessage {
    constructor(
        readonly minimapType: number
    ) {
        super();
    }
}
