import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtPriority from '#lostcity/network/outgoing/prot/ServerProtPriority.js';
import {Position} from '#lostcity/entity/Position.js';

export default class RebuildNormal extends OutgoingMessage {
    priority = ServerProtPriority.HIGH;

    constructor(
        readonly zoneX: number,
        readonly zoneZ: number
    ) {
        super();
    }

    get mapsquares(): Set<number> {
        const minX: number = this.zoneX - 6;
        const maxX: number = this.zoneX + 6;
        const minZ: number = this.zoneZ - 6;
        const maxZ: number = this.zoneZ + 6;
        const result: Set<number> = new Set();
        // build area is 13x13 zones (8*13 = 104 tiles), so we need to load 6 zones in each direction
        for (let x: number = minX; x <= maxX; x++) {
            const mx: number = Position.mapsquare(x << 3);
            for (let z: number = minZ; z <= maxZ; z++) {
                const mz: number = Position.mapsquare(z << 3);
                result.add(mx << 8 | mz);
            }
        }
        return result;
    }
}