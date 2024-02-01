import Zone from '#lostcity/engine/zone/Zone.js';

export default class ZoneManager {
    // 256x256 mapsquares (room for instances): 2048 * 2048 * 4 = ((256 * 256) * 64) * 4
    // 60x160 mapsquares (we don't support instances): ((60 * 160) * 64) * 4
    private static TOTAL_ZONE_COUNT: number = 60 * 160 * 64 * 4;

    private static zoneIndex(x: number, z: number, level: number): number {
        return ((x >> 3) & 0x7ff) | (((z >> 3) & 0x7ff) << 11) | ((level & 0x3) << 22);
    }

    zones = new Array<Zone>(ZoneManager.TOTAL_ZONE_COUNT);

    // ----

    getZone(absoluteX: number, absoluteZ: number, level: number): Zone {
        const zoneIndex = ZoneManager.zoneIndex(absoluteX, absoluteZ, level);
        let zone = this.zones[zoneIndex];
        if (zone == null) {
            zone = new Zone(zoneIndex);
            this.zones[zoneIndex] = zone;
        }
        return zone;
    }
}
