import ZoneMessage from '#lostcity/network/outgoing/ZoneMessage.js';
import {Position} from '#lostcity/entity/Position.js';

export default class LocMerge extends ZoneMessage {
    constructor(
        readonly srcX: number,
        readonly srcZ: number,
        readonly shape: number,
        readonly angle: number,
        readonly locId: number,
        readonly startCycle: number,
        readonly endCycle: number,
        readonly pid: number,
        readonly east: number,
        readonly south: number,
        readonly west: number,
        readonly north: number
    ) {
        super(Position.packZoneCoord(srcX, srcZ));
    }
}