export default class Occlude {
    readonly minTileX: number;
    readonly maxTileX: number;
    readonly minTileZ: number;
    readonly maxTileZ: number;
    readonly type: number;
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
    readonly minY: number;
    readonly maxY: number;

    mode: number = 0;
    minDeltaX: number = 0;
    maxDeltaX: number = 0;
    minDeltaZ: number = 0;
    maxDeltaZ: number = 0;
    minDeltaY: number = 0;
    maxDeltaY: number = 0;

    constructor(minTileX: number, maxTileX: number, minTileZ: number, maxTileZ: number, type: number, minX: number, maxX: number, minZ: number, maxZ: number, minY: number, maxY: number) {
        this.minTileX = minTileX;
        this.maxTileX = maxTileX;
        this.minTileZ = minTileZ;
        this.maxTileZ = maxTileZ;
        this.type = type;
        this.minX = minX;
        this.maxX = maxX;
        this.minZ = minZ;
        this.maxZ = maxZ;
        this.minY = minY;
        this.maxY = maxY;
    }
}
