import ZoneMessage from '#/network/server/ZoneMessage.js';

export default class ObjReveal extends ZoneMessage {
    constructor(
        readonly coord: number,
        readonly obj: number,
        readonly count: number,
        readonly receiverId: number
    ) {
        super(coord);
    }
}
