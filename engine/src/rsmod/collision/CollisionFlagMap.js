export default class CollisionFlagMap {
    static DEFAULT_COLLISION_FLAG = 0xFFFFFFFF; // -1
    static TOTAL_ZONE_COUNT = 2048 * 2048 * 8;
    static ZONE_TILE_COUNT = 8 * 8;

    static tileIndex(x, z) {
        return (x & 0x7) | ((z & 0x7) << 3);
    }

    static zoneIndex(x, z, level) {
        return ((x >> 3) & 0x7FF) | (((z >> 3) & 0x7FF) << 11) | ((level & 0x3) << 22);
    }

    // ----

    getZone(absoluteX, absoluteZ, level) {
        let zoneIndex = CollisionFlagMap.zoneIndex(absoluteX, absoluteZ, level);
        return this.flags[zoneIndex];
    }

    // ----

    flags = new Array(CollisionFlagMap.TOTAL_ZONE_COUNT);

    get(absoluteX, absoluteZ, level) {
        let zoneIndex = CollisionFlagMap.zoneIndex(absoluteX, absoluteZ, level);
        let tileIndex = CollisionFlagMap.tileIndex(absoluteX, absoluteZ);

        if (!this.flags[zoneIndex]) {
            return CollisionFlagMap.DEFAULT_COLLISION_FLAG;
        }

        return this.flags[zoneIndex][tileIndex];
    }

    set(absoluteX, absoluteZ, level, mask) {
        let zoneIndex = CollisionFlagMap.zoneIndex(absoluteX, absoluteZ, level);
        let tileIndex = CollisionFlagMap.tileIndex(absoluteX, absoluteZ);

        let tiles = this.flags[zoneIndex] ?? this.allocateIfAbsent(absoluteX, absoluteZ, level);
        tiles[tileIndex] = mask;
    }

    add(absoluteX, absoluteZ, level, mask) {
        let zoneIndex = CollisionFlagMap.zoneIndex(absoluteX, absoluteZ, level);
        let tileIndex = CollisionFlagMap.tileIndex(absoluteX, absoluteZ);

        let currentFlags = this.flags[zoneIndex] ? this.flags[zoneIndex][tileIndex] : 0;
        this.set(absoluteX, absoluteZ, level, currentFlags | mask);
    }

    remove(absoluteX, absoluteZ, level, mask) {
        let zoneIndex = CollisionFlagMap.zoneIndex(absoluteX, absoluteZ, level);
        let tileIndex = CollisionFlagMap.tileIndex(absoluteX, absoluteZ);

        let currentFlags = this.flags[zoneIndex] ? this.flags[zoneIndex][tileIndex] : 0;
        this.set(absoluteX, absoluteZ, level, currentFlags & ~mask);
    }

    allocateIfAbsent(absoluteX, absoluteZ, level) {
        let zoneIndex = CollisionFlagMap.zoneIndex(absoluteX, absoluteZ, level);
        let existingFlags = this.flags[zoneIndex];
        if (existingFlags) {
            return;
        }

        let tileFlags = new Int32Array(CollisionFlagMap.ZONE_TILE_COUNT);
        this.flags[zoneIndex] = tileFlags;
        return tileFlags;
    }

    deallocateIfPresent(absoluteX, absoluteZ, level) {
        let zoneIndex = CollisionFlagMap.zoneIndex(absoluteX, absoluteZ, level);
        this.flags[zoneIndex] = null;
    }

    isZoneAllocated(absoluteX, absoluteZ, level) {
        let zoneIndex = CollisionFlagMap.zoneIndex(absoluteX, absoluteZ, level);
        return this.flags[zoneIndex] != null;
    }
}
