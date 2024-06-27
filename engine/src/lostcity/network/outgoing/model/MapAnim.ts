import ZoneMessage from '#lostcity/network/outgoing/ZoneMessage.js';

export default class MapAnim extends ZoneMessage {
    constructor(
        readonly coord: number,
        readonly spotanim: number,
        readonly height: number,
        readonly delay: number
    ) {
        super(coord);
    }
}