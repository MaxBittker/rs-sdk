import type ModelSource from '#/dash3d/ModelSource.js';

// Sprites are an abstract entity - a model to be rendered.
// It can be a Loc, Player, NPC, or another renderable class
export default class Sprite {
    level: number;
    readonly y: number;
    readonly x: number;
    readonly z: number;
    model: ModelSource | null;
    readonly yaw: number;
    readonly minTileX: number;
    readonly maxTileX: number;
    readonly minTileZ: number;
    readonly maxTileZ: number;
    readonly typecode: number;
    readonly typecode2: number;

    distance: number = 0;
    cycle: number = 0;

    constructor(level: number, y: number, x: number, z: number, model: ModelSource | null, yaw: number, minSceneTileX: number, maxSceneTileX: number, minSceneTileZ: number, maxSceneTileZ: number, typecode: number, info: number) {
        this.level = level;
        this.y = y;
        this.x = x;
        this.z = z;
        this.model = model;
        this.yaw = yaw;
        this.minTileX = minSceneTileX;
        this.maxTileX = maxSceneTileX;
        this.minTileZ = minSceneTileZ;
        this.maxTileZ = maxSceneTileZ;
        this.typecode = typecode;
        this.typecode2 = info;
    }
}
