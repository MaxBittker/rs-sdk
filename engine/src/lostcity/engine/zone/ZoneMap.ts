import Zone from '#lostcity/engine/zone/Zone.js';
import ZoneGrid from '#lostcity/engine/zone/ZoneGrid.js';
import {Position} from '#lostcity/entity/Position.js';

export default class ZoneMap {
    static zoneIndex(x: number, z: number, level: number): number {
        return ((x >> 3) & 0x7ff) | (((z >> 3) & 0x7ff) << 11) | ((level & 0x3) << 22);
    }

    static unpackIndex(index: number): Position {
        const x: number = (index & 0x7ff) << 3;
        const z: number = ((index >> 11) & 0x7ff) << 3;
        const level: number = index >> 22;
        return { x, z, level };
    }

    private readonly zones: Map<number, Zone>;
    private readonly grids: Map<number, ZoneGrid>;

    constructor() {
        this.zones = new Map();
        this.grids = new Map();
    }

    zone(x: number, z: number, level: number): Zone {
        const zoneIndex: number = ZoneMap.zoneIndex(x, z, level);
        let zone: Zone | undefined = this.zones.get(zoneIndex);
        if (typeof zone == 'undefined') {
            zone = new Zone(zoneIndex);
            this.zones.set(zoneIndex, zone);
        }
        return zone;
    }

    zoneByIndex(index: number): Zone {
        let zone: Zone | undefined = this.zones.get(index);
        if (typeof zone == 'undefined') {
            zone = new Zone(index);
            this.zones.set(index, zone);
        }
        return zone;
    }

    grid(level: number): ZoneGrid {
        let grid: ZoneGrid | undefined = this.grids.get(level);
        if (typeof grid == 'undefined') {
            grid = new ZoneGrid();
            this.grids.set(level, grid);
        }
        return grid;
    }
}
