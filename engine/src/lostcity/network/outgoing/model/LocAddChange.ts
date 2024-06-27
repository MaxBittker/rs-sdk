import ZoneMessage from '#lostcity/network/outgoing/ZoneMessage.js';

export default class LocAddChange extends ZoneMessage {
    constructor(
        readonly coord: number,
        readonly loc: number,
        readonly shape: number,
        readonly angle: number
    ) {
        super(coord);
    }
}