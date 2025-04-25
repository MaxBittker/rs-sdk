import ZoneMessage from '#/network/server/ZoneMessage.js';

export default class LocAnim extends ZoneMessage {
    constructor(
        readonly coord: number,
        readonly shape: number,
        readonly angle: number,
        readonly seq: number
    ) {
        super(coord);
    }
}
