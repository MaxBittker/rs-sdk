import { CoordGrid } from '#/engine/CoordGrid.js';
import ZoneMessage from '#/network/server/ZoneMessage.js';

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
        super(CoordGrid.packZoneCoord(srcX, srcZ));
    }
}
