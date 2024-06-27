import ZoneMessage from '#lostcity/network/outgoing/ZoneMessage.js';

export default class ObjCount extends ZoneMessage {
    constructor(
        readonly coord: number,
        readonly obj: number,
        readonly oldCount: number,
        readonly newCount: number
    ) {
        super(coord);
    }
}