import { LocAngle } from '#/dash3d/LocAngle.js';
import Occlude from '#/dash3d/Occlude.js';

import GroundDecor from '#/dash3d/GroundDecor.js';
import Sprite from '#/dash3d/Sprite.js';
import GroundObject from '#/dash3d/GroundObject.js';
import Square from '#/dash3d/Square.js';
import Ground from '#/dash3d/Ground.js';
import { TerrainOverlayShape } from '#/dash3d/TerrainOverlayShape.js';
import QuickGround from '#/dash3d/QuickGround.js';
import Wall from '#/dash3d/Wall.js';
import Decor from '#/dash3d/Decor.js';

import LinkList from '#/datastruct/LinkList.js';

import Pix2D from '#/graphics/Pix2D.js';
import Pix3D from '#/dash3d/Pix3D.js';
import Model from '#/dash3d/Model.js';

import { Int32Array3d, TypedArray1d, TypedArray2d, TypedArray3d, TypedArray4d } from '#/util/Arrays.js';
import type ModelSource from '#/dash3d/ModelSource.js';
import type PointNormal from '#/dash3d/PointNormal.js';

const PRETAB = Uint8Array.of(19, 55, 38, 155, 255, 110, 137, 205, 76);
const MIDTAB = Uint8Array.of(160, 192, 80, 96, 0, 144, 80, 48, 160);
const POSTTAB = Uint8Array.of(76, 8, 137, 4, 0, 1, 38, 2, 19);

const MIDDEP_16 = Uint8Array.of(0, 0, 2, 0, 0, 2, 1, 1, 0);
const MIDDEP_32 = Uint8Array.of(2, 0, 0, 2, 0, 0, 0, 4, 4);
const MIDDEP_64 = Uint8Array.of(0, 4, 4, 8, 0, 0, 8, 0, 0);
const MIDDEP_128 = Uint8Array.of(1, 1, 0, 0, 0, 8, 0, 0, 8);

const DECORXOF = Int8Array.of(53, -53, -53, 53);
const DECORZOF = Int8Array.of(-53, -53, 53, 53);
const DECORXOF2 = Int8Array.of(-45, 45, 45, -45);
const DECORZOF2 = Int8Array.of(45, 45, -45, -45);

// prettier-ignore
const MINIMAP_SHAPE = [
    new Uint8Array(16),
    Uint8Array.of(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1), // PLAIN_SHAPE
    Uint8Array.of(1, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 1), // DIAGONAL_SHAPE
    Uint8Array.of(1, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0), // LEFT_SEMI_DIAGONAL_SMALL_SHAPE
    Uint8Array.of(0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1), // RIGHT_SEMI_DIAGONAL_SMALL_SHAPE
    Uint8Array.of(0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1), // LEFT_SEMI_DIAGONAL_BIG_SHAPE
    Uint8Array.of(1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1), // RIGHT_SEMI_DIAGONAL_BIG_SHAPE
    Uint8Array.of(1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0), // HALF_SQUARE_SHAPE
    Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0), // CORNER_SMALL_SHAPE
    Uint8Array.of(1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1), // CORNER_BIG_SHAPE
    Uint8Array.of(1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0), // FAN_SMALL_SHAPE
    Uint8Array.of(0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1), // FAN_BIG_SHAPE
    Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1)  // TRAPEZIUM_SHAPE
];

// prettier-ignore
const MINIMAP_ROTATE = [
    Uint8Array.of(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15),
    Uint8Array.of(12, 8, 4, 0, 13, 9, 5, 1, 14, 10, 6, 2, 15, 11, 7, 3),
    Uint8Array.of(15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
    Uint8Array.of(3, 7, 11, 15, 2, 6, 10, 14, 1, 5, 9, 13, 0, 4, 8, 12)
];

// prettier-ignore
const TEXTURE_AVERAGE = Uint16Array.of(
    41,
    39248, // water
    41,
    4643, // planks
    41, 41, 41, 41, 41, 41, 41, 41, 41, 41, 41,
    43086, // marble
    41, 41, 41, 41, 41, 41, 41,
    8602, // mossybricks
    41,
    28992, // gungywater
    41, 41, 41, 41, 41,
    5056, // lava
    41, 41, 41, 41, 41, 41, 41, 41, 41, 41, 41, 41, 41, 41,
    3131, // pebblefloor
    41, 41, 41
);

const OCCLUDER_LEVELS = 4;

export default class World {
    static lowMem: boolean = true;

    private static cameraSinX: number = 0;
    private static cameraCosX: number = 0;
    private static cameraSinY: number = 0;
    private static cameraCosY: number = 0;

    private static fillLeft: number = 0;
    private static fillQueue: LinkList<Square> = new LinkList();

    static maxLevel: number = 0;

    private static cycleNo: number = 0;

    private static minX: number = 0;
    private static maxX: number = 0;
    private static minZ: number = 0;
    private static maxZ: number = 0;

    private static gx: number = 0;
    private static gz: number = 0;
    private static cx: number = 0;
    private static cy: number = 0;
    private static cz: number = 0;

    private static click: boolean = false;
    static clickX: number = 0;
    static clickY: number = 0;
    static groundX: number = -1;
    static groundZ: number = -1;

    private static visBacking: boolean[][][][] = new TypedArray4d(8, 32, 51, 51, false);
    private static visBackingDirty: boolean[][] | null = null;

    static numActiveOccluders: number = 0;
    private static activeOccluders: (Occlude | null)[] = new TypedArray1d(500, null);

    static numOccluders: Int32Array = new Int32Array(OCCLUDER_LEVELS);
    private static occluders: (Occlude | null)[][] = new TypedArray2d(OCCLUDER_LEVELS, 500, null);

    private static spriteBuffer: (Sprite | null)[] = new TypedArray1d(100, null);

    private static xClip: number = 0;
    private static yClip: number = 0;
    private static xClip2: number = 0;
    private static yClip2: number = 0;
    private static xOrig: number = 0;
    private static yOrig: number = 0;

    private minLevel: number = 0;
    private readonly maxTileLevel: number;
    private readonly maxTileX: number;
    private readonly maxTileZ: number;
    private readonly groundh: Int32Array[][];
    private readonly squares: (Square | null)[][][];
    private readonly occlusionCycle: Int32Array[][];

    private dynamicCount: number = 0;
    private readonly dynamicSprites: (Sprite | null)[] = new TypedArray1d(5000, null);

    private shareTic: number = 0;
    private readonly shareMap: Int32Array = new Int32Array(10000);
    private readonly shareMap2: Int32Array = new Int32Array(10000);

    constructor(levelHeightmaps: Int32Array[][], maxTileZ: number, maxLevel: number, maxTileX: number) {
        this.maxTileLevel = maxLevel;
        this.maxTileX = maxTileX;
        this.maxTileZ = maxTileZ;
        this.squares = new TypedArray3d(maxLevel, maxTileX, maxTileZ, null);
        this.occlusionCycle = new Int32Array3d(maxLevel, maxTileX + 1, maxTileZ + 1);
        this.groundh = levelHeightmaps;

        this.resetMap();
    }

    resetMap(): void {
        for (let level: number = 0; level < this.maxTileLevel; level++) {
            for (let x: number = 0; x < this.maxTileX; x++) {
                for (let z: number = 0; z < this.maxTileZ; z++) {
                    this.squares[level][x][z] = null;
                }
            }
        }

        for (let l: number = 0; l < OCCLUDER_LEVELS; l++) {
            for (let o: number = 0; o < World.numOccluders[l]; o++) {
                World.occluders[l][o] = null;
            }

            World.numOccluders[l] = 0;
        }

        for (let i: number = 0; i < this.dynamicCount; i++) {
            this.dynamicSprites[i] = null;
        }

        this.dynamicCount = 0;

        World.spriteBuffer.fill(null);
    }

    fillBaseLevel(level: number): void {
        this.minLevel = level;

        for (let stx: number = 0; stx < this.maxTileX; stx++) {
            for (let stz: number = 0; stz < this.maxTileZ; stz++) {
                this.squares[level][stx][stz] = new Square(level, stx, stz);
            }
        }
    }

    pushDown(stx: number, stz: number): void {
        const below: Square | null = this.squares[0][stx][stz];

        for (let level: number = 0; level < 3; level++) {
            this.squares[level][stx][stz] = this.squares[level + 1][stx][stz];

            const tile: Square | null = this.squares[level][stx][stz];
            if (tile) {
                tile.level--;

                for (let i = 0; i < tile.spriteCount; i++) {
                    const sprite = tile.sprites[i];
                    if (sprite && ((sprite.typecode >> 29) & 0x3) == 2 && sprite.minTileX == stx && sprite.minTileZ == stz) {
                        sprite.level--;
                    }
                }
            }
        }

        if (!this.squares[0][stx][stz]) {
            this.squares[0][stx][stz] = new Square(0, stx, stz);
        }

        const tile: Square | null = this.squares[0][stx][stz];
        if (tile) {
            tile.linkedSquare = below;
        }

        this.squares[3][stx][stz] = null;
    }

    static setOcclude(level: number, type: number, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void {
        World.occluders[level][World.numOccluders[level]++] = new Occlude((minX / 128) | 0, (maxX / 128) | 0, (minZ / 128) | 0, (maxZ / 128) | 0, type, minX, maxX, minZ, maxZ, minY, maxY);
    }

    setLayer(level: number, stx: number, stz: number, drawLevel: number): void {
        const tile: Square | null = this.squares[level][stx][stz];
        if (!tile) {
            return;
        }

        tile.drawLevel = drawLevel;
    }

    setGround(
        level: number, x: number, z: number,
        shape: number, rotation: number,
        texture: number,
        heightSW: number, heightSE: number, heightNE: number, heightNW: number,
        colourSW: number, colourSE: number, colourNE: number, colourNW: number,
        colour2SW: number, colour2SE: number, colour2NE: number, colour2NW: number,
        overlay: number, underlay: number
    ): void {
        if (shape === TerrainOverlayShape.PLAIN) {
            for (let l: number = level; l >= 0; l--) {
                if (!this.squares[l][x][z]) {
                    this.squares[l][x][z] = new Square(l, x, z);
                }
            }

            const tile: Square | null = this.squares[level][x][z];
            if (tile) {
                tile.quickGround = new QuickGround(
                    colourSW, colourSE, colourNE, colourNW,
                    -1,
                    overlay,
                    false
                );
            }
        } else if (shape === TerrainOverlayShape.DIAGONAL) {
            for (let l: number = level; l >= 0; l--) {
                if (!this.squares[l][x][z]) {
                    this.squares[l][x][z] = new Square(l, x, z);
                }
            }

            const tile: Square | null = this.squares[level][x][z];
            if (tile) {
                tile.quickGround = new QuickGround(
                    colour2SW, colour2SE, colour2NE, colour2NW,
                    texture,
                    underlay,
                    heightSW === heightSE && heightSW === heightNE && heightSW === heightNW
                );
            }
        } else {
            for (let l: number = level; l >= 0; l--) {
                if (!this.squares[l][x][z]) {
                    this.squares[l][x][z] = new Square(l, x, z);
                }
            }

            const tile: Square | null = this.squares[level][x][z];
            if (tile) {
                tile.ground = new Ground(
                    x, z,
                    shape, rotation,
                    texture,
                    heightSW, heightSE, heightNE, heightNW,
                    colourSW, colourSE, colourNE, colourNW,
                    colour2SW, colour2SE, colour2NE, colour2NW,
                    overlay, underlay
                );
            }
        }
    }

    setGroundDecor(model: ModelSource | null, tileLevel: number, tileX: number, tileZ: number, y: number, typecode: number, typecode2: number): void {
        if (model === null) {
            return;
        }

        if (!this.squares[tileLevel][tileX][tileZ]) {
            this.squares[tileLevel][tileX][tileZ] = new Square(tileLevel, tileX, tileZ);
        }

        const tile: Square | null = this.squares[tileLevel][tileX][tileZ];
        if (tile) {
            tile.groundDecor = new GroundDecor(y, tileX * 128 + 64, tileZ * 128 + 64, model, typecode, typecode2);
        }
    }

    delGroundDecor(level: number, x: number, z: number): void {
        const tile: Square | null = this.squares[level][x][z];
        if (!tile) {
            return;
        }

        tile.groundDecor = null;
    }

    setObj(stx: number, stz: number, y: number, level: number, typecode: number, topObj: ModelSource | null, middleObj: ModelSource | null, bottomObj: ModelSource | null): void {
        let stackOffset: number = 0;

        const tile: Square | null = this.squares[level][stx][stz];
        if (tile) {
            for (let l: number = 0; l < tile.spriteCount; l++) {
                const sprite: Sprite | null = tile.sprites[l];
                if (!sprite || !sprite.model || !(sprite.model instanceof Model)) {
                    continue;
                }

                const height: number = sprite.model.objRaise;
                if (height > stackOffset) {
                    stackOffset = height;
                }
            }
        } else {
            this.squares[level][stx][stz] = new Square(level, stx, stz);
        }

        const tile2: Square | null = this.squares[level][stx][stz];
        if (tile2) {
            tile2.groundObject = new GroundObject(y, stx * 128 + 64, stz * 128 + 64, topObj, middleObj, bottomObj, typecode, stackOffset);
        }
    }

    delObj(level: number, x: number, z: number): void {
        const tile: Square | null = this.squares[level][x][z];
        if (!tile) {
            return;
        }

        tile.groundObject = null;
    }

    setWall(level: number, tileX: number, tileZ: number, y: number, angle1: number, angle2: number, model1: ModelSource | null, model2: ModelSource | null, typecode1: number, typecode2: number): void {
        if (!model1 && !model2) {
            return;
        }

        for (let l: number = level; l >= 0; l--) {
            if (!this.squares[l][tileX][tileZ]) {
                this.squares[l][tileX][tileZ] = new Square(l, tileX, tileZ);
            }
        }

        const tile: Square | null = this.squares[level][tileX][tileZ];
        if (tile) {
            tile.wall = new Wall(y, tileX * 128 + 64, tileZ * 128 + 64, angle1, angle2, model1, model2, typecode1, typecode2);
        }
    }

    delWall(level: number, x: number, z: number): void {
        const tile: Square | null = this.squares[level][x][z];
        if (!tile) {
            return;
        }

        tile.wall = null;
    }

    setDecor(level: number, tileX: number, tileZ: number, y: number, offsetX: number, offsetZ: number, typecode: number, model: ModelSource | null, info: number, angle: number, type: number): void {
        if (!model) {
            return;
        }

        for (let l: number = level; l >= 0; l--) {
            if (!this.squares[l][tileX][tileZ]) {
                this.squares[l][tileX][tileZ] = new Square(l, tileX, tileZ);
            }
        }

        const tile: Square | null = this.squares[level][tileX][tileZ];
        if (tile) {
            tile.decor = new Decor(y, tileX * 128 + offsetX + 64, tileZ * 128 + offsetZ + 64, type, angle, model, typecode, info);
        }
    }

    delDecor(level: number, x: number, z: number): void {
        const tile: Square | null = this.squares[level][x][z];
        if (!tile) {
            return;
        }

        tile.decor = null;
    }

    moveDecor(level: number, x: number, z: number, offset: number): void {
        const tile: Square | null = this.squares[level][x][z];
        if (!tile) {
            return;
        }

        const decor: Decor | null = tile.decor;
        if (!decor) {
            return;
        }

        const sx: number = x * 128 + 64;
        const sz: number = z * 128 + 64;
        decor.x = sx + ((((decor.x - sx) * offset) / 16) | 0);
        decor.z = sz + ((((decor.z - sz) * offset) / 16) | 0);
    }

    addScenery(level: number, tileX: number, tileZ: number, y: number, model: ModelSource | null, typecode: number, info: number, width: number, length: number, yaw: number): boolean {
        if (!model) {
            return true;
        }

        const sceneX: number = tileX * 128 + width * 64;
        const sceneZ: number = tileZ * 128 + length * 64;
        return this.setSprite(sceneX, sceneZ, y, level, tileX, tileZ, width, length, model, typecode, info, yaw, false);
    }

    addDynamic(level: number, x: number, y: number, z: number, model: ModelSource | null, typecode: number, yaw: number, padding: number, forwardPadding: boolean): boolean {
        if (!model) {
            return true;
        }

        let x0: number = x - padding;
        let z0: number = z - padding;
        let x1: number = x + padding;
        let z1: number = z + padding;

        if (forwardPadding) {
            if (yaw > 640 && yaw < 1408) {
                z1 += 128;
            }
            if (yaw > 1152 && yaw < 1920) {
                x1 += 128;
            }
            if (yaw > 1664 || yaw < 384) {
                z0 -= 128;
            }
            if (yaw > 128 && yaw < 896) {
                x0 -= 128;
            }
        }

        x0 = (x0 / 128) | 0;
        z0 = (z0 / 128) | 0;
        x1 = (x1 / 128) | 0;
        z1 = (z1 / 128) | 0;

        return this.setSprite(x, z, y, level, x0, z0, x1 + 1 - x0, z1 - z0 + 1, model, typecode, 0, yaw, true);
    }

    addDynamic2(level: number, x: number, y: number, z: number, minTileX: number, minTileZ: number, maxTileX: number, maxTileZ: number, model: ModelSource | null, typecode: number, yaw: number): boolean {
        return !model || this.setSprite(x, z, y, level, minTileX, minTileZ, maxTileX + 1 - minTileX, maxTileZ - minTileZ + 1, model, typecode, 0, yaw, true);
    }

    delLoc(level: number, x: number, z: number): void {
        const tile: Square | null = this.squares[level][x][z];
        if (!tile) {
            return;
        }

        for (let l: number = 0; l < tile.spriteCount; l++) {
            const loc: Sprite | null = tile.sprites[l];
            if (loc && ((loc.typecode >> 29) & 0x3) === 2 && loc.minTileX === x && loc.minTileZ === z) {
                this.delSprite(loc);
                return;
            }
        }
    }

    removeSprites(): void {
        for (let i: number = 0; i < this.dynamicCount; i++) {
            const sprite: Sprite | null = this.dynamicSprites[i];
            if (sprite) {
                this.delSprite(sprite);
            }

            this.dynamicSprites[i] = null;
        }

        this.dynamicCount = 0;
    }

    getWall(level: number, x: number, z: number): Wall | null {
        const tile: Square | null = this.squares[level][x][z];
        return !tile || !tile.wall ? null : tile.wall;
    }

    getDecor(level: number, z: number, x: number): Decor | null {
        const tile: Square | null = this.squares[level][x][z];
        return !tile || !tile.decor ? null : tile.decor;
    }

    getScene(level: number, x: number, z: number): Sprite | null {
        const tile: Square | null = this.squares[level][x][z];
        if (!tile) {
            return null;
        }

        for (let l: number = 0; l < tile.spriteCount; l++) {
            const sprite: Sprite | null = tile.sprites[l];
            if (sprite && ((sprite.typecode >> 29) & 0x3) === 2 && sprite.minTileX === x && sprite.minTileZ === z) {
                return sprite;
            }
        }

        return null;
    }

    getGd(level: number, x: number, z: number): GroundDecor | null {
        const tile: Square | null = this.squares[level][x][z];
        return !tile || !tile.groundDecor ? null : tile.groundDecor;
    }

    wallType(level: number, x: number, z: number): number {
        const tile: Square | null = this.squares[level][x][z];
        return !tile || !tile.wall ? 0 : tile.wall.typecode;
    }

    decorType(level: number, z: number, x: number): number {
        const tile: Square | null = this.squares[level][x][z];
        return !tile || !tile.decor ? 0 : tile.decor.typecode;
    }

    sceneType(level: number, x: number, z: number): number {
        const tile: Square | null = this.squares[level][x][z];
        if (!tile) {
            return 0;
        }

        for (let l: number = 0; l < tile.spriteCount; l++) {
            const sprite: Sprite | null = tile.sprites[l];
            if (sprite && ((sprite.typecode >> 29) & 0x3) === 2 && sprite.minTileX === x && sprite.minTileZ === z) {
                return sprite.typecode;
            }
        }

        return 0;
    }

    gdType(level: number, x: number, z: number): number {
        const tile: Square | null = this.squares[level][x][z];
        return !tile || !tile.groundDecor ? 0 : tile.groundDecor.typecode;
    }

    typeCode2(level: number, x: number, z: number, typecode: number): number {
        const tile: Square | null = this.squares[level][x][z];
        if (!tile) {
            return -1;
        } else if (tile.wall && tile.wall.typecode === typecode) {
            return tile.wall.typecode2 & 0xff;
        } else if (tile.decor && tile.decor.typecode === typecode) {
            return tile.decor.typecode2 & 0xff;
        } else if (tile.groundDecor && tile.groundDecor.typecode === typecode) {
            return tile.groundDecor.typecode2 & 0xff;
        } else {
            for (let i: number = 0; i < tile.spriteCount; i++) {
                const sprite: Sprite | null = tile.sprites[i];
                if (sprite && sprite.typecode === typecode) {
                    return sprite.typecode2 & 0xff;
                }
            }
            return -1;
        }
    }

    shareLight(ambient: number, contrast: number, lightSrcX: number, lightSrcY: number, lightSrcZ: number): void {
        const lightMagnitude: number = Math.sqrt(lightSrcX * lightSrcX + lightSrcY * lightSrcY + lightSrcZ * lightSrcZ) | 0;
        const attenuation: number = (contrast * lightMagnitude) >> 8;

        for (let level: number = 0; level < this.maxTileLevel; level++) {
            for (let tileX: number = 0; tileX < this.maxTileX; tileX++) {
                for (let tileZ: number = 0; tileZ < this.maxTileZ; tileZ++) {
                    const tile: Square | null = this.squares[level][tileX][tileZ];
                    if (!tile) {
                        continue;
                    }

                    const wall: Wall | null = tile.wall;
                    if (wall && wall.model1 && wall.model1.pointNormal) {
                        this.shareLightLoc(level, tileX, tileZ, 1, 1, wall.model1 as Model);
                        if (wall.model2 && wall.model2.pointNormal) {
                            this.shareLightLoc(level, tileX, tileZ, 1, 1, wall.model2 as Model);
                            this.modelShareLight(wall.model1 as Model, wall.model2 as Model, 0, 0, 0, false);
                            (wall.model2 as Model).light(ambient, attenuation, lightSrcX, lightSrcY, lightSrcZ);
                        }
                        (wall.model1 as Model).light(ambient, attenuation, lightSrcX, lightSrcY, lightSrcZ);
                    }

                    for (let i: number = 0; i < tile.spriteCount; i++) {
                        const sprite: Sprite | null = tile.sprites[i];
                        if (sprite && sprite.model && sprite.model.pointNormal) {
                            this.shareLightLoc(level, tileX, tileZ, sprite.maxTileX + 1 - sprite.minTileX, sprite.maxTileZ - sprite.minTileZ + 1, sprite.model as Model);
                            (sprite.model as Model).light(ambient, attenuation, lightSrcX, lightSrcY, lightSrcZ);
                        }
                    }

                    const decor: GroundDecor | null = tile.groundDecor;
                    if (decor && decor.model && decor.model.pointNormal) {
                        this.shareLightGd(level, tileX, tileZ, decor.model as Model);
                        (decor.model as Model).light(ambient, attenuation, lightSrcX, lightSrcY, lightSrcZ);
                    }
                }
            }
        }
    }

    shareLightGd(level: number, tileX: number, tileZ: number, model: Model): void {
        if (tileX < this.maxTileX) {
            const tile: Square | null = this.squares[level][tileX + 1][tileZ];
            if (tile && tile.groundDecor && tile.groundDecor.model && tile.groundDecor.model.pointNormal) {
                this.modelShareLight(model, tile.groundDecor.model as Model, 128, 0, 0, true);
            }
        }

        if (tileZ < this.maxTileX) {
            const tile: Square | null = this.squares[level][tileX][tileZ + 1];
            if (tile && tile.groundDecor && tile.groundDecor.model && tile.groundDecor.model.pointNormal) {
                this.modelShareLight(model, tile.groundDecor.model as Model, 0, 0, 128, true);
            }
        }

        if (tileX < this.maxTileX && tileZ < this.maxTileZ) {
            const tile: Square | null = this.squares[level][tileX + 1][tileZ + 1];
            if (tile && tile.groundDecor && tile.groundDecor.model && tile.groundDecor.model.pointNormal) {
                this.modelShareLight(model, tile.groundDecor.model as Model, 128, 0, 128, true);
            }
        }

        if (tileX < this.maxTileX && tileZ > 0) {
            const tile: Square | null = this.squares[level][tileX + 1][tileZ - 1];
            if (tile && tile.groundDecor && tile.groundDecor.model && tile.groundDecor.model.pointNormal) {
                this.modelShareLight(model, tile.groundDecor.model as Model, 128, 0, -128, true);
            }
        }
    }

    shareLightLoc(level: number, tileX: number, tileZ: number, tileSizeX: number, tileSizeZ: number, model: Model): void {
        let allowFaceRemoval: boolean = true;

        let minTileX: number = tileX;
        const maxTileX: number = tileX + tileSizeX;
        const minTileZ: number = tileZ - 1;
        const maxTileZ: number = tileZ + tileSizeZ;

        for (let l: number = level; l <= level + 1; l++) {
            if (l === this.maxTileLevel) {
                continue;
            }

            for (let x: number = minTileX; x <= maxTileX; x++) {
                if (x < 0 || x >= this.maxTileX) {
                    continue;
                }

                for (let z: number = minTileZ; z <= maxTileZ; z++) {
                    if (z < 0 || z >= this.maxTileZ || (allowFaceRemoval && x < maxTileX && z < maxTileZ && (z >= tileZ || x === tileX))) {
                        continue;
                    }

                    const tile: Square | null = this.squares[l][x][z];
                    if (!tile) {
                        continue;
                    }

                    const offsetX: number = (x - tileX) * 128 + (1 - tileSizeX) * 64;
                    const offsetZ: number = (z - tileZ) * 128 + (1 - tileSizeZ) * 64;
                    const offsetY: number =
                        (((this.groundh[l][x][z] + this.groundh[l][x + 1][z] + this.groundh[l][x][z + 1] + this.groundh[l][x + 1][z + 1]) / 4) | 0) -
                        (((this.groundh[level][tileX][tileZ] + this.groundh[level][tileX + 1][tileZ] + this.groundh[level][tileX][tileZ + 1] + this.groundh[level][tileX + 1][tileZ + 1]) / 4) | 0);

                    const wall: Wall | null = tile.wall;
                    if (wall && wall.model1 && wall.model1.pointNormal) {
                        this.modelShareLight(model, wall.model1 as Model, offsetX, offsetY, offsetZ, allowFaceRemoval);
                    }

                    if (wall && wall.model2 && wall.model2.pointNormal) {
                        this.modelShareLight(model, wall.model2 as Model, offsetX, offsetY, offsetZ, allowFaceRemoval);
                    }

                    for (let i: number = 0; i < tile.spriteCount; i++) {
                        const sprite: Sprite | null = tile.sprites[i];
                        if (!sprite || !sprite.model || !sprite.model.pointNormal) {
                            continue;
                        }

                        const sizeX: number = sprite.maxTileX + 1 - sprite.minTileX;
                        const sizeZ: number = sprite.maxTileZ + 1 - sprite.minTileZ;
                        this.modelShareLight(model, sprite.model as Model, (sprite.minTileX - tileX) * 128 + (sizeX - tileSizeX) * 64, offsetY, (sprite.minTileZ - tileZ) * 128 + (sizeZ - tileSizeZ) * 64, allowFaceRemoval);
                    }
                }
            }

            minTileX--;
            allowFaceRemoval = false;
        }
    }

    private modelShareLight(modelA: Model, modelB: Model, offsetX: number, offsetY: number, offsetZ: number, allowFaceRemoval: boolean): void {
        this.shareTic++;

        let merged: number = 0;
        const vertexX: Int32Array = modelB.pointX!;
        const vertexCountB: number = modelB.numPoints;

        if (modelA.pointNormal && modelA.sharedPointNormal) {
            for (let vertexA: number = 0; vertexA < modelA.numPoints; vertexA++) {
                const normalA: PointNormal | null = modelA.pointNormal[vertexA];
                const originalNormalA: PointNormal | null = modelA.sharedPointNormal[vertexA];

                if (originalNormalA && originalNormalA.w !== 0) {
                    const y: number = modelA.pointY![vertexA] - offsetY;
                    if (y > modelB.maxY) {
                        continue;
                    }

                    const x: number = modelA.pointX![vertexA] - offsetX;
                    if (x < modelB.minX || x > modelB.maxX) {
                        continue;
                    }

                    const z: number = modelA.pointZ![vertexA] - offsetZ;
                    if (z < modelB.minZ || z > modelB.maxZ) {
                        continue;
                    }

                    if (modelB.pointNormal && modelB.sharedPointNormal) {
                        for (let vertexB: number = 0; vertexB < vertexCountB; vertexB++) {
                            const normalB: PointNormal | null = modelB.pointNormal[vertexB];
                            const originalNormalB: PointNormal | null = modelB.sharedPointNormal[vertexB];
                            if (x !== vertexX[vertexB] || z !== modelB.pointZ![vertexB] || y !== modelB.pointY![vertexB] || (originalNormalB && originalNormalB.w === 0)) {
                                continue;
                            }

                            if (normalA && normalB && originalNormalB) {
                                normalA.x += originalNormalB.x;
                                normalA.y += originalNormalB.y;
                                normalA.z += originalNormalB.z;
                                normalA.w += originalNormalB.w;
                                normalB.x += originalNormalA.x;
                                normalB.y += originalNormalA.y;
                                normalB.z += originalNormalA.z;
                                normalB.w += originalNormalA.w;
                                merged++;
                            }

                            this.shareMap[vertexA] = this.shareTic;
                            this.shareMap2[vertexB] = this.shareTic;
                        }
                    }
                }
            }
        }

        if (merged < 3 || !allowFaceRemoval) {
            return;
        }

        if (modelA.faceRenderType) {
            for (let i: number = 0; i < modelA.numFaces; i++) {
                if (this.shareMap[modelA.faceVertexA![i]] === this.shareTic && this.shareMap[modelA.faceVertexB![i]] === this.shareTic && this.shareMap[modelA.faceVertexC![i]] === this.shareTic) {
                    modelA.faceRenderType[i] = -1;
                }
            }
        }

        if (modelB.faceRenderType) {
            for (let i: number = 0; i < modelB.numFaces; i++) {
                if (this.shareMap2[modelB.faceVertexA![i]] === this.shareTic && this.shareMap2[modelB.faceVertexB![i]] === this.shareTic && this.shareMap2[modelB.faceVertexC![i]] === this.shareTic) {
                    modelB.faceRenderType[i] = -1;
                }
            }
        }
    }

    render2DGround(level: number, x: number, z: number, dst: Int32Array, offset: number, step: number): void {
        const tile: Square | null = this.squares[level][x][z];
        if (!tile) {
            return;
        }

        const quickGround: QuickGround | null = tile.quickGround;
        if (quickGround) {
            const rgb: number = quickGround.minimapRgb;
            if (rgb !== 0) {
                for (let i: number = 0; i < 4; i++) {
                    dst[offset] = rgb;
                    dst[offset + 1] = rgb;
                    dst[offset + 2] = rgb;
                    dst[offset + 3] = rgb;
                    offset += step;
                }
            }
            return;
        }

        const ground: Ground | null = tile.ground;
        if (ground) {
            const shape: number = ground.overlayShape;
            const rotation: number = ground.overlayRotation;
            const overlay: number = ground.minimapOverlay;
            const underlay: number = ground.minimapUnderlay;
            const minimapShape = MINIMAP_SHAPE[shape];
            const minimapRotation = MINIMAP_ROTATE[rotation];

            let off: number = 0;
            if (overlay !== 0) {
                for (let i: number = 0; i < 4; i++) {
                    dst[offset] = minimapShape[minimapRotation[off++]] === 0 ? overlay : underlay;
                    dst[offset + 1] = minimapShape[minimapRotation[off++]] === 0 ? overlay : underlay;
                    dst[offset + 2] = minimapShape[minimapRotation[off++]] === 0 ? overlay : underlay;
                    dst[offset + 3] = minimapShape[minimapRotation[off++]] === 0 ? overlay : underlay;
                    offset += step;
                }
                return;
            }

            for (let i: number = 0; i < 4; i++) {
                if (minimapShape[minimapRotation[off++]] !== 0) {
                    dst[offset] = underlay;
                }
                if (minimapShape[minimapRotation[off++]] !== 0) {
                    dst[offset + 1] = underlay;
                }
                if (minimapShape[minimapRotation[off++]] !== 0) {
                    dst[offset + 2] = underlay;
                }
                if (minimapShape[minimapRotation[off++]] !== 0) {
                    dst[offset + 3] = underlay;
                }
                offset += step;
            }
        }
    }

    static resetVisCalc(pitchDistance: Int32Array, frustumStart: number, frustumEnd: number, viewportWidth: number, viewportHeight: number): void {
        this.xClip = 0;
        this.yClip = 0;
        this.xClip2 = viewportWidth;
        this.yClip2 = viewportHeight;
        this.xOrig = (viewportWidth / 2) | 0;
        this.yOrig = (viewportHeight / 2) | 0;

        const visBacking: boolean[][][][] = new TypedArray4d(9, 32, 53, 53, false);
        for (let pitch: number = 128; pitch <= 384; pitch += 32) {
            for (let yaw: number = 0; yaw < 2048; yaw += 64) {
                this.cameraSinX = Pix3D.sinTable[pitch];
                this.cameraCosX = Pix3D.cosTable[pitch];
                this.cameraSinY = Pix3D.sinTable[yaw];
                this.cameraCosY = Pix3D.cosTable[yaw];

                const pitchLevel: number = ((pitch - 128) / 32) | 0;
                const yawLevel: number = (yaw / 64) | 0;
                for (let dx: number = -26; dx <= 26; dx++) {
                    for (let dz: number = -26; dz <= 26; dz++) {
                        const x: number = dx * 128;
                        const z: number = dz * 128;

                        let visible: boolean = false;
                        for (let y: number = -frustumStart; y <= frustumEnd; y += 128) {
                            if (this.testPoint(x, z, pitchDistance[pitchLevel] + y)) {
                                visible = true;
                                break;
                            }
                        }

                        visBacking[pitchLevel][yawLevel][dx + 25 + 1][dz + 25 + 1] = visible;
                    }
                }
            }
        }

        for (let pitchLevel: number = 0; pitchLevel < 8; pitchLevel++) {
            for (let yawLevel: number = 0; yawLevel < 32; yawLevel++) {
                for (let x: number = -25; x < 25; x++) {
                    for (let z: number = -25; z < 25; z++) {
                        let visible: boolean = false;

                        check_areas: for (let dx: number = -1; dx <= 1; dx++) {
                            for (let dz: number = -1; dz <= 1; dz++) {
                                if (visBacking[pitchLevel][yawLevel][x + dx + 25 + 1][z + dz + 25 + 1]) {
                                    visible = true;
                                    break check_areas;
                                }

                                if (visBacking[pitchLevel][(yawLevel + 1) % 31][x + dx + 25 + 1][z + dz + 25 + 1]) {
                                    visible = true;
                                    break check_areas;
                                }

                                if (visBacking[pitchLevel + 1][yawLevel][x + dx + 25 + 1][z + dz + 25 + 1]) {
                                    visible = true;
                                    break check_areas;
                                }

                                if (visBacking[pitchLevel + 1][(yawLevel + 1) % 31][x + dx + 25 + 1][z + dz + 25 + 1]) {
                                    visible = true;
                                    break check_areas;
                                }
                            }
                        }

                        this.visBacking[pitchLevel][yawLevel][x + 25][z + 25] = visible;
                    }
                }
            }
        }
    }

    private static testPoint(x: number, z: number, y: number): boolean {
        const px: number = (z * this.cameraSinY + x * this.cameraCosY) >> 16;
        const tmp: number = (z * this.cameraCosY - x * this.cameraSinY) >> 16;
        const pz: number = (y * this.cameraSinX + tmp * this.cameraCosX) >> 16;
        const py: number = (y * this.cameraCosX - tmp * this.cameraSinX) >> 16;

        if (pz < 50 || pz > 3500) {
            return false;
        }

        const viewportX: number = this.xOrig + (((px << 9) / pz) | 0);
        const viewportY: number = this.yOrig + (((py << 9) / pz) | 0);
        return viewportX >= this.xClip && viewportX <= this.xClip2 && viewportY >= this.yClip && viewportY <= this.yClip2;
    }

    updateMousePicking(mouseX: number, mouseY: number): void {
        World.click = true;
        World.clickX = mouseX;
        World.clickY = mouseY;
        World.groundX = -1;
        World.groundZ = -1;
    }

    renderAll(eyeX: number, eyeY: number, eyeZ: number, maxLevel: number, eyeYaw: number, eyePitch: number): void {
        if (eyeX < 0) {
            eyeX = 0;
        } else if (eyeX >= this.maxTileX * 128) {
            eyeX = this.maxTileX * 128 - 1;
        }

        if (eyeZ < 0) {
            eyeZ = 0;
        } else if (eyeZ >= this.maxTileZ * 128) {
            eyeZ = this.maxTileZ * 128 - 1;
        }

        World.cycleNo++;
        World.cameraSinX = Pix3D.sinTable[eyePitch];
        World.cameraCosX = Pix3D.cosTable[eyePitch];
        World.cameraSinY = Pix3D.sinTable[eyeYaw];
        World.cameraCosY = Pix3D.cosTable[eyeYaw];

        World.visBackingDirty = World.visBacking[((eyePitch - 128) / 32) | 0][(eyeYaw / 64) | 0];
        World.cx = eyeX;
        World.cy = eyeY;
        World.cz = eyeZ;
        World.gx = (eyeX / 128) | 0;
        World.gz = (eyeZ / 128) | 0;
        World.maxLevel = maxLevel;

        World.minX = World.gx - 25;
        if (World.minX < 0) {
            World.minX = 0;
        }

        World.minZ = World.gz - 25;
        if (World.minZ < 0) {
            World.minZ = 0;
        }

        World.maxX = World.gx + 25;
        if (World.maxX > this.maxTileX) {
            World.maxX = this.maxTileX;
        }

        World.maxZ = World.gz + 25;
        if (World.maxZ > this.maxTileZ) {
            World.maxZ = this.maxTileZ;
        }

        this.calcOcclude();
        World.fillLeft = 0;

        for (let level: number = this.minLevel; level < this.maxTileLevel; level++) {
            const tiles: (Square | null)[][] = this.squares[level];
            for (let x: number = World.minX; x < World.maxX; x++) {
                for (let z: number = World.minZ; z < World.maxZ; z++) {
                    const tile: Square | null = tiles[x][z];
                    if (!tile) {
                        continue;
                    }

                    if (tile.drawLevel <= maxLevel && (World.visBackingDirty[x + 25 - World.gx][z + 25 - World.gz] || this.groundh[level][x][z] - eyeY >= 2000)) {
                        tile.drawFront = true;
                        tile.drawBack = true;
                        tile.drawSprites = tile.spriteCount > 0;
                        World.fillLeft++;
                    } else {
                        tile.drawFront = false;
                        tile.drawBack = false;
                        tile.cornerSides = 0;
                    }
                }
            }
        }

        for (let level: number = this.minLevel; level < this.maxTileLevel; level++) {
            const tiles: (Square | null)[][] = this.squares[level];
            for (let dx: number = -25; dx <= 0; dx++) {
                const rightTileX: number = World.gx + dx;
                const leftTileX: number = World.gx - dx;

                if (rightTileX < World.minX && leftTileX >= World.maxX) {
                    continue;
                }

                for (let dz: number = -25; dz <= 0; dz++) {
                    const forwardTileZ: number = World.gz + dz;
                    const backwardTileZ: number = World.gz - dz;
                    let tile: Square | null;

                    if (rightTileX >= World.minX) {
                        if (forwardTileZ >= World.minZ) {
                            tile = tiles[rightTileX][forwardTileZ];
                            if (tile && tile.drawFront) {
                                this.fill(tile, true);
                            }
                        }

                        if (backwardTileZ < World.maxZ) {
                            tile = tiles[rightTileX][backwardTileZ];
                            if (tile && tile.drawFront) {
                                this.fill(tile, true);
                            }
                        }
                    }

                    if (leftTileX < World.maxX) {
                        if (forwardTileZ >= World.minZ) {
                            tile = tiles[leftTileX][forwardTileZ];
                            if (tile && tile.drawFront) {
                                this.fill(tile, true);
                            }
                        }

                        if (backwardTileZ < World.maxZ) {
                            tile = tiles[leftTileX][backwardTileZ];
                            if (tile && tile.drawFront) {
                                this.fill(tile, true);
                            }
                        }
                    }

                    if (World.fillLeft === 0) {
                        World.click = false;
                        return;
                    }
                }
            }
        }

        for (let level: number = this.minLevel; level < this.maxTileLevel; level++) {
            const tiles: (Square | null)[][] = this.squares[level];
            for (let dx: number = -25; dx <= 0; dx++) {
                const rightTileX: number = World.gx + dx;
                const leftTileX: number = World.gx - dx;

                if (rightTileX < World.minX && leftTileX >= World.maxX) {
                    continue;
                }

                for (let dz: number = -25; dz <= 0; dz++) {
                    const forwardTileZ: number = World.gz + dz;
                    const backgroundTileZ: number = World.gz - dz;
                    let tile: Square | null;

                    if (rightTileX >= World.minX) {
                        if (forwardTileZ >= World.minZ) {
                            tile = tiles[rightTileX][forwardTileZ];
                            if (tile && tile.drawFront) {
                                this.fill(tile, false);
                            }
                        }

                        if (backgroundTileZ < World.maxZ) {
                            tile = tiles[rightTileX][backgroundTileZ];
                            if (tile && tile.drawFront) {
                                this.fill(tile, false);
                            }
                        }
                    }

                    if (leftTileX < World.maxX) {
                        if (forwardTileZ >= World.minZ) {
                            tile = tiles[leftTileX][forwardTileZ];
                            if (tile && tile.drawFront) {
                                this.fill(tile, false);
                            }
                        }

                        if (backgroundTileZ < World.maxZ) {
                            tile = tiles[leftTileX][backgroundTileZ];
                            if (tile && tile.drawFront) {
                                this.fill(tile, false);
                            }
                        }
                    }

                    if (World.fillLeft === 0) {
                        World.click = false;
                        return;
                    }
                }
            }
        }
    }

    private setSprite(
        x: number,
        z: number,
        y: number,
        level: number,
        tileX: number,
        tileZ: number,
        tileSizeX: number,
        tileSizeZ: number,
        model: ModelSource | null,
        typecode: number,
        info: number,
        yaw: number,
        dynamic: boolean
    ): boolean {
        if (!model) {
            return false;
        }

        for (let tx: number = tileX; tx < tileX + tileSizeX; tx++) {
            for (let tz: number = tileZ; tz < tileZ + tileSizeZ; tz++) {
                if (tx < 0 || tz < 0 || tx >= this.maxTileX || tz >= this.maxTileZ) {
                    return false;
                }

                const tile: Square | null = this.squares[level][tx][tz];
                if (tile && tile.spriteCount >= 5) {
                    return false;
                }
            }
        }

        const sprite: Sprite = new Sprite(level, y, x, z, model, yaw, tileX, tileX + tileSizeX - 1, tileZ, tileZ + tileSizeZ - 1, typecode, info);
        for (let tx: number = tileX; tx < tileX + tileSizeX; tx++) {
            for (let tz: number = tileZ; tz < tileZ + tileSizeZ; tz++) {
                let spans: number = 0;
                if (tx > tileX) {
                    spans |= 0x1;
                }
                if (tx < tileX + tileSizeX - 1) {
                    spans += 0x4;
                }
                if (tz > tileZ) {
                    spans += 0x8;
                }
                if (tz < tileZ + tileSizeZ - 1) {
                    spans += 0x2;
                }

                for (let l: number = level; l >= 0; l--) {
                    if (!this.squares[l][tx][tz]) {
                        this.squares[l][tx][tz] = new Square(l, tx, tz);
                    }
                }

                const tile: Square | null = this.squares[level][tx][tz];
                if (tile) {
                    tile.sprites[tile.spriteCount] = sprite;
                    tile.spriteSpan[tile.spriteCount] = spans;
                    tile.spriteSpans |= spans;
                    tile.spriteCount++;
                }
            }
        }

        if (dynamic) {
            this.dynamicSprites[this.dynamicCount++] = sprite;
        }

        return true;
    }

    private delSprite(sprite: Sprite): void {
        for (let tx: number = sprite.minTileX; tx <= sprite.maxTileX; tx++) {
            for (let tz: number = sprite.minTileZ; tz <= sprite.maxTileZ; tz++) {
                const tile: Square | null = this.squares[sprite.level][tx][tz];
                if (!tile) {
                    continue;
                }

                for (let i: number = 0; i < tile.spriteCount; i++) {
                    if (tile.sprites[i] === sprite) {
                        tile.spriteCount--;
                        for (let j: number = i; j < tile.spriteCount; j++) {
                            tile.sprites[j] = tile.sprites[j + 1];
                            tile.spriteSpan[j] = tile.spriteSpan[j + 1];
                        }
                        tile.sprites[tile.spriteCount] = null;
                        break;
                    }
                }

                tile.spriteSpans = 0;

                for (let i: number = 0; i < tile.spriteCount; i++) {
                    tile.spriteSpans |= tile.spriteSpan[i];
                }
            }
        }
    }

    private calcOcclude(): void {
        const count: number = World.numOccluders[World.maxLevel];
        const occluders: (Occlude | null)[] = World.occluders[World.maxLevel];

        World.numActiveOccluders = 0;

        for (let i: number = 0; i < count; i++) {
            const occluder: Occlude | null = occluders[i];
            if (!occluder) {
                continue;
            }

            let deltaMaxY: number;
            let deltaMinTileZ: number;
            let deltaMaxTileZ: number;
            let deltaMaxTileX: number;

            if (occluder.type === 1) {
                deltaMaxY = occluder.minTileX + 25 - World.gx;
                if (deltaMaxY >= 0 && deltaMaxY <= 50) {
                    deltaMinTileZ = occluder.minTileZ + 25 - World.gz;
                    if (deltaMinTileZ < 0) {
                        deltaMinTileZ = 0;
                    }

                    deltaMaxTileZ = occluder.maxTileZ + 25 - World.gz;
                    if (deltaMaxTileZ > 50) {
                        deltaMaxTileZ = 50;
                    }

                    let ok: boolean = false;
                    while (deltaMinTileZ <= deltaMaxTileZ) {
                        if (World.visBackingDirty && World.visBackingDirty[deltaMaxY][deltaMinTileZ++]) {
                            ok = true;
                            break;
                        }
                    }

                    if (ok) {
                        deltaMaxTileX = World.cx - occluder.minX;
                        if (deltaMaxTileX > 32) {
                            occluder.mode = 1;
                        } else {
                            if (deltaMaxTileX >= -32) {
                                continue;
                            }

                            occluder.mode = 2;
                            deltaMaxTileX = -deltaMaxTileX;
                        }

                        occluder.minDeltaZ = (((occluder.minZ - World.cz) << 8) / deltaMaxTileX) | 0;
                        occluder.maxDeltaZ = (((occluder.maxZ - World.cz) << 8) / deltaMaxTileX) | 0;
                        occluder.minDeltaY = (((occluder.minY - World.cy) << 8) / deltaMaxTileX) | 0;
                        occluder.maxDeltaY = (((occluder.maxY - World.cy) << 8) / deltaMaxTileX) | 0;
                        World.activeOccluders[World.numActiveOccluders++] = occluder;
                    }
                }
            } else if (occluder.type === 2) {
                deltaMaxY = occluder.minTileZ + 25 - World.gz;

                if (deltaMaxY >= 0 && deltaMaxY <= 50) {
                    deltaMinTileZ = occluder.minTileX + 25 - World.gx;
                    if (deltaMinTileZ < 0) {
                        deltaMinTileZ = 0;
                    }

                    deltaMaxTileZ = occluder.maxTileX + 25 - World.gx;
                    if (deltaMaxTileZ > 50) {
                        deltaMaxTileZ = 50;
                    }

                    let ok: boolean = false;
                    while (deltaMinTileZ <= deltaMaxTileZ) {
                        if (World.visBackingDirty && World.visBackingDirty[deltaMinTileZ++][deltaMaxY]) {
                            ok = true;
                            break;
                        }
                    }

                    if (ok) {
                        deltaMaxTileX = World.cz - occluder.minZ;
                        if (deltaMaxTileX > 32) {
                            occluder.mode = 3;
                        } else {
                            if (deltaMaxTileX >= -32) {
                                continue;
                            }

                            occluder.mode = 4;
                            deltaMaxTileX = -deltaMaxTileX;
                        }

                        occluder.minDeltaX = (((occluder.minX - World.cx) << 8) / deltaMaxTileX) | 0;
                        occluder.maxDeltaX = (((occluder.maxX - World.cx) << 8) / deltaMaxTileX) | 0;
                        occluder.minDeltaY = (((occluder.minY - World.cy) << 8) / deltaMaxTileX) | 0;
                        occluder.maxDeltaY = (((occluder.maxY - World.cy) << 8) / deltaMaxTileX) | 0;
                        World.activeOccluders[World.numActiveOccluders++] = occluder;
                    }
                }
            } else if (occluder.type === 4) {
                deltaMaxY = occluder.minY - World.cy;

                if (deltaMaxY > 128) {
                    deltaMinTileZ = occluder.minTileZ + 25 - World.gz;
                    if (deltaMinTileZ < 0) {
                        deltaMinTileZ = 0;
                    }

                    deltaMaxTileZ = occluder.maxTileZ + 25 - World.gz;
                    if (deltaMaxTileZ > 50) {
                        deltaMaxTileZ = 50;
                    }

                    if (deltaMinTileZ <= deltaMaxTileZ) {
                        let deltaMinTileX: number = occluder.minTileX + 25 - World.gx;
                        if (deltaMinTileX < 0) {
                            deltaMinTileX = 0;
                        }

                        deltaMaxTileX = occluder.maxTileX + 25 - World.gx;
                        if (deltaMaxTileX > 50) {
                            deltaMaxTileX = 50;
                        }

                        let ok: boolean = false;
                        find_visible_tile: for (let x: number = deltaMinTileX; x <= deltaMaxTileX; x++) {
                            for (let z: number = deltaMinTileZ; z <= deltaMaxTileZ; z++) {
                                if (World.visBackingDirty && World.visBackingDirty[x][z]) {
                                    ok = true;
                                    break find_visible_tile;
                                }
                            }
                        }

                        if (ok) {
                            occluder.mode = 5;
                            occluder.minDeltaX = (((occluder.minX - World.cx) << 8) / deltaMaxY) | 0;
                            occluder.maxDeltaX = (((occluder.maxX - World.cx) << 8) / deltaMaxY) | 0;
                            occluder.minDeltaZ = (((occluder.minZ - World.cz) << 8) / deltaMaxY) | 0;
                            occluder.maxDeltaZ = (((occluder.maxZ - World.cz) << 8) / deltaMaxY) | 0;
                            World.activeOccluders[World.numActiveOccluders++] = occluder;
                        }
                    }
                }
            }
        }
    }

    private fill(next: Square, checkAdjacent: boolean): void {
        World.fillQueue.push(next);

        while (true) {
            let tile: Square | null;

            do {
                tile = World.fillQueue.popFront();

                if (!tile) {
                    return;
                }
            } while (!tile.drawBack);

            const tileX: number = tile.x;
            const tileZ: number = tile.z;
            const level: number = tile.level;
            const originalLevel: number = tile.originalLevel;
            const tiles: (Square | null)[][] = this.squares[level];

            if (tile.drawFront) {
                if (checkAdjacent) {
                    if (level > 0) {
                        const above: Square | null = this.squares[level - 1][tileX][tileZ];

                        if (above && above.drawBack) {
                            continue;
                        }
                    }

                    if (tileX <= World.gx && tileX > World.minX) {
                        const adjacent: Square | null = tiles[tileX - 1][tileZ];

                        if (adjacent && adjacent.drawBack && (adjacent.drawFront || (tile.spriteSpans & 0x1) === 0)) {
                            continue;
                        }
                    }

                    if (tileX >= World.gx && tileX < World.maxX - 1) {
                        const adjacent: Square | null = tiles[tileX + 1][tileZ];

                        if (adjacent && adjacent.drawBack && (adjacent.drawFront || (tile.spriteSpans & 0x4) === 0)) {
                            continue;
                        }
                    }

                    if (tileZ <= World.gz && tileZ > World.minZ) {
                        const adjacent: Square | null = tiles[tileX][tileZ - 1];

                        if (adjacent && adjacent.drawBack && (adjacent.drawFront || (tile.spriteSpans & 0x8) === 0)) {
                            continue;
                        }
                    }

                    if (tileZ >= World.gz && tileZ < World.maxZ - 1) {
                        const adjacent: Square | null = tiles[tileX][tileZ + 1];

                        if (adjacent && adjacent.drawBack && (adjacent.drawFront || (tile.spriteSpans & 0x2) === 0)) {
                            continue;
                        }
                    }
                } else {
                    checkAdjacent = true;
                }

                tile.drawFront = false;

                if (tile.linkedSquare) {
                    const linkedSquare: Square = tile.linkedSquare;

                    if (!linkedSquare.quickGround) {
                        if (linkedSquare.ground && !this.groundOccluded(0, tileX, tileZ)) {
                            this.renderGround(tileX, tileZ, linkedSquare.ground, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY);
                        }
                    } else if (!this.groundOccluded(0, tileX, tileZ)) {
                        this.renderQuickGround(linkedSquare.quickGround, 0, tileX, tileZ, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY);
                    }

                    const wall: Wall | null = linkedSquare.wall;
                    if (wall) {
                        wall.model1?.worldRender(0, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, wall.x - World.cx, wall.y - World.cy, wall.z - World.cz, wall.typecode);
                    }

                    for (let i: number = 0; i < linkedSquare.spriteCount; i++) {
                        const sprite: Sprite | null = linkedSquare.sprites[i];

                        if (sprite) {
                            sprite.model?.worldRender(sprite.yaw, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, sprite.x - World.cx, sprite.y - World.cy, sprite.z - World.cz, sprite.typecode);
                        }
                    }
                }

                let tileDrawn: boolean = false;
                if (!tile.quickGround) {
                    if (tile.ground && !this.groundOccluded(originalLevel, tileX, tileZ)) {
                        tileDrawn = true;
                        this.renderGround(tileX, tileZ, tile.ground, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY);
                    }
                } else if (!this.groundOccluded(originalLevel, tileX, tileZ)) {
                    tileDrawn = true;
                    this.renderQuickGround(tile.quickGround, originalLevel, tileX, tileZ, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY);
                }

                let direction: number = 0;
                let frontWallTypes: number = 0;

                const wall: Wall | null = tile.wall;
                const decor: Decor | null = tile.decor;

                if (wall || decor) {
                    if (World.gx === tileX) {
                        direction += 1;
                    } else if (World.gx < tileX) {
                        direction += 2;
                    }

                    if (World.gz === tileZ) {
                        direction += 3;
                    } else if (World.gz > tileZ) {
                        direction += 6;
                    }

                    frontWallTypes = PRETAB[direction];
                    tile.backWallTypes = POSTTAB[direction];
                }

                if (wall) {
                    if ((wall.angle1 & MIDTAB[direction]) === 0) {
                        tile.cornerSides = 0;
                    } else if (wall.angle1 === 16) {
                        tile.cornerSides = 3;
                        tile.sidesBeforeCorner = MIDDEP_16[direction];
                        tile.sidesAfterCorner = 3 - tile.sidesBeforeCorner;
                    } else if (wall.angle1 === 32) {
                        tile.cornerSides = 6;
                        tile.sidesBeforeCorner = MIDDEP_32[direction];
                        tile.sidesAfterCorner = 6 - tile.sidesBeforeCorner;
                    } else if (wall.angle1 === 64) {
                        tile.cornerSides = 12;
                        tile.sidesBeforeCorner = MIDDEP_64[direction];
                        tile.sidesAfterCorner = 12 - tile.sidesBeforeCorner;
                    } else {
                        tile.cornerSides = 9;
                        tile.sidesBeforeCorner = MIDDEP_128[direction];
                        tile.sidesAfterCorner = 9 - tile.sidesBeforeCorner;
                    }

                    if ((wall.angle1 & frontWallTypes) !== 0 && !this.wallOccluded(originalLevel, tileX, tileZ, wall.angle1)) {
                        wall.model1?.worldRender(0, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, wall.x - World.cx, wall.y - World.cy, wall.z - World.cz, wall.typecode);
                    }

                    if ((wall.angle2 & frontWallTypes) !== 0 && !this.wallOccluded(originalLevel, tileX, tileZ, wall.angle2)) {
                        wall.model2?.worldRender(0, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, wall.x - World.cx, wall.y - World.cy, wall.z - World.cz, wall.typecode);
                    }
                }

                if (decor && !this.spriteOccluded(originalLevel, tileX, tileZ, decor.model.minY)) {
                    if ((decor.wshape & frontWallTypes) !== 0) {
                        decor.model.worldRender(decor.angle, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, decor.x - World.cx, decor.y - World.cy, decor.z - World.cz, decor.typecode);
                    } else if ((decor.wshape & 0x300) !== 0) {
                        const x: number = decor.x - World.cx;
                        const y: number = decor.y - World.cy;
                        const z: number = decor.z - World.cz;
                        const angle: number = decor.angle;

                        let nearestX: number;
                        if (angle === LocAngle.NORTH || angle === LocAngle.EAST) {
                            nearestX = -x;
                        } else {
                            nearestX = x;
                        }

                        let nearestZ: number;
                        if (angle === LocAngle.EAST || angle === LocAngle.SOUTH) {
                            nearestZ = -z;
                        } else {
                            nearestZ = z;
                        }

                        if ((decor.wshape & 0x100) !== 0 && nearestZ < nearestX) {
                            const drawX: number = x + DECORXOF[angle];
                            const drawZ: number = z + DECORZOF[angle];
                            decor.model.worldRender(angle * 512 + 256, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, drawX, y, drawZ, decor.typecode);
                        }

                        if ((decor.wshape & 0x200) !== 0 && nearestZ > nearestX) {
                            const drawX: number = x + DECORXOF2[angle];
                            const drawZ: number = z + DECORZOF2[angle];
                            decor.model.worldRender((angle * 512 + 1280) & 0x7ff, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, drawX, y, drawZ, decor.typecode);
                        }
                    }
                }

                if (tileDrawn) {
                    const groundDecor: GroundDecor | null = tile.groundDecor;
                    if (groundDecor) {
                        groundDecor.model?.worldRender(0, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, groundDecor.x - World.cx, groundDecor.y - World.cy, groundDecor.z - World.cz, groundDecor.typecode);
                    }

                    const objs: GroundObject | null = tile.groundObject;
                    if (objs && objs.height === 0) {
                        if (objs.bottomObj) {
                            objs.bottomObj.worldRender(0, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, objs.x - World.cx, objs.y - World.cy, objs.z - World.cz, objs.typecode);
                        }

                        if (objs.middleObj) {
                            objs.middleObj.worldRender(0, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, objs.x - World.cx, objs.y - World.cy, objs.z - World.cz, objs.typecode);
                        }

                        if (objs.topObj) {
                            objs.topObj.worldRender(0, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, objs.x - World.cx, objs.y - World.cy, objs.z - World.cz, objs.typecode);
                        }
                    }
                }

                const spans: number = tile.spriteSpans;

                if (spans !== 0) {
                    if (tileX < World.gx && (spans & 0x4) !== 0) {
                        const adjacent: Square | null = tiles[tileX + 1][tileZ];
                        if (adjacent && adjacent.drawBack) {
                            World.fillQueue.push(adjacent);
                        }
                    }

                    if (tileZ < World.gz && (spans & 0x2) !== 0) {
                        const adjacent: Square | null = tiles[tileX][tileZ + 1];
                        if (adjacent && adjacent.drawBack) {
                            World.fillQueue.push(adjacent);
                        }
                    }

                    if (tileX > World.gx && (spans & 0x1) !== 0) {
                        const adjacent: Square | null = tiles[tileX - 1][tileZ];
                        if (adjacent && adjacent.drawBack) {
                            World.fillQueue.push(adjacent);
                        }
                    }

                    if (tileZ > World.gz && (spans & 0x8) !== 0) {
                        const adjacent: Square | null = tiles[tileX][tileZ - 1];
                        if (adjacent && adjacent.drawBack) {
                            World.fillQueue.push(adjacent);
                        }
                    }
                }
            }

            if (tile.cornerSides !== 0) {
                let draw: boolean = true;
                for (let i: number = 0; i < tile.spriteCount; i++) {
                    const sprite: Sprite | null = tile.sprites[i];
                    if (!sprite) {
                        continue;
                    }

                    if (sprite.cycle !== World.cycleNo && (tile.spriteSpan[i] & tile.cornerSides) === tile.sidesBeforeCorner) {
                        draw = false;
                        break;
                    }
                }

                if (draw) {
                    const wall: Wall | null = tile.wall;

                    if (wall && !this.wallOccluded(originalLevel, tileX, tileZ, wall.angle1)) {
                        wall.model1?.worldRender(0, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, wall.x - World.cx, wall.y - World.cy, wall.z - World.cz, wall.typecode);
                    }

                    tile.cornerSides = 0;
                }
            }

            if (tile.drawSprites) {
                const spriteCount: number = tile.spriteCount;
                tile.drawSprites = false;
                let spriteBufferSize: number = 0;

                iterate_sprites: for (let i: number = 0; i < spriteCount; i++) {
                    const sprite: Sprite | null = tile.sprites[i];

                    if (!sprite || sprite.cycle === World.cycleNo) {
                        continue;
                    }

                    for (let x: number = sprite.minTileX; x <= sprite.maxTileX; x++) {
                        for (let z: number = sprite.minTileZ; z <= sprite.maxTileZ; z++) {
                            const other: Square | null = tiles[x][z];

                            if (!other) {
                                continue;
                            }

                            if (other.drawFront) {
                                tile.drawSprites = true;
                                continue iterate_sprites;
                            }

                            if (other.cornerSides === 0) {
                                continue;
                            }

                            let spans: number = 0;

                            if (x > sprite.minTileX) {
                                spans += 1;
                            }

                            if (x < sprite.maxTileX) {
                                spans += 4;
                            }

                            if (z > sprite.minTileZ) {
                                spans += 8;
                            }

                            if (z < sprite.maxTileZ) {
                                spans += 2;
                            }

                            if ((spans & other.cornerSides) !== tile.sidesAfterCorner) {
                                continue;
                            }
                        }
                    }

                    World.spriteBuffer[spriteBufferSize++] = sprite;

                    let minTileDistanceX: number = World.gx - sprite.minTileX;
                    const maxTileDistanceX: number = sprite.maxTileX - World.gx;

                    if (maxTileDistanceX > minTileDistanceX) {
                        minTileDistanceX = maxTileDistanceX;
                    }

                    const minTileDistanceZ: number = World.gz - sprite.minTileZ;
                    const maxTileDistanceZ: number = sprite.maxTileZ - World.gz;

                    if (maxTileDistanceZ > minTileDistanceZ) {
                        sprite.distance = minTileDistanceX + maxTileDistanceZ;
                    } else {
                        sprite.distance = minTileDistanceX + minTileDistanceZ;
                    }
                }

                while (spriteBufferSize > 0) {
                    let farthestDistance: number = -50;
                    let farthestIndex: number = -1;

                    for (let index: number = 0; index < spriteBufferSize; index++) {
                        const sprite: Sprite | null = World.spriteBuffer[index];
                        if (!sprite) {
                            continue;
                        }

                        if (sprite.distance > farthestDistance && sprite.cycle !== World.cycleNo) {
                            farthestDistance = sprite.distance;
                            farthestIndex = index;
                        }
                    }

                    if (farthestIndex === -1) {
                        break;
                    }

                    const farthest: Sprite | null = World.spriteBuffer[farthestIndex];
                    if (farthest) {
                        farthest.cycle = World.cycleNo;

                        if (!this.spriteOccluded2(originalLevel, farthest.minTileX, farthest.maxTileX, farthest.minTileZ, farthest.maxTileZ, farthest.model?.minY ?? 0)) {
                            farthest.model?.worldRender(farthest.yaw, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, farthest.x - World.cx, farthest.y - World.cy, farthest.z - World.cz, farthest.typecode);
                        }

                        for (let x: number = farthest.minTileX; x <= farthest.maxTileX; x++) {
                            for (let z: number = farthest.minTileZ; z <= farthest.maxTileZ; z++) {
                                const occupied: Square | null = tiles[x][z];
                                if (!occupied) {
                                    continue;
                                }

                                if (occupied.cornerSides !== 0) {
                                    World.fillQueue.push(occupied);
                                } else if ((x !== tileX || z !== tileZ) && occupied.drawBack) {
                                    World.fillQueue.push(occupied);
                                }
                            }
                        }
                    }
                }

                if (tile.drawSprites) {
                    continue;
                }
            }

            if (!tile.drawBack || tile.cornerSides !== 0) {
                continue;
            }

            if (tileX <= World.gx && tileX > World.minX) {
                const adjacent: Square | null = tiles[tileX - 1][tileZ];
                if (adjacent && adjacent.drawBack) {
                    continue;
                }
            }

            if (tileX >= World.gx && tileX < World.maxX - 1) {
                const adjacent: Square | null = tiles[tileX + 1][tileZ];
                if (adjacent && adjacent.drawBack) {
                    continue;
                }
            }

            if (tileZ <= World.gz && tileZ > World.minZ) {
                const adjacent: Square | null = tiles[tileX][tileZ - 1];
                if (adjacent && adjacent.drawBack) {
                    continue;
                }
            }

            if (tileZ >= World.gz && tileZ < World.maxZ - 1) {
                const adjacent: Square | null = tiles[tileX][tileZ + 1];
                if (adjacent && adjacent.drawBack) {
                    continue;
                }
            }

            tile.drawBack = false;
            World.fillLeft--;

            const objs: GroundObject | null = tile.groundObject;
            if (objs && objs.height !== 0) {
                if (objs.bottomObj) {
                    objs.bottomObj.worldRender(0, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, objs.x - World.cx, objs.y - World.cy - objs.height, objs.z - World.cz, objs.typecode);
                }

                if (objs.middleObj) {
                    objs.middleObj.worldRender(0, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, objs.x - World.cx, objs.y - World.cy - objs.height, objs.z - World.cz, objs.typecode);
                }

                if (objs.topObj) {
                    objs.topObj.worldRender(0, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, objs.x - World.cx, objs.y - World.cy - objs.height, objs.z - World.cz, objs.typecode);
                }
            }

            if (tile.backWallTypes !== 0) {
                const decor: Decor | null = tile.decor;

                if (decor && !this.spriteOccluded(originalLevel, tileX, tileZ, decor.model.minY)) {
                    if ((decor.wshape & tile.backWallTypes) !== 0) {
                        decor.model.worldRender(decor.angle, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, decor.x - World.cx, decor.y - World.cy, decor.z - World.cz, decor.typecode);
                    } else if ((decor.wshape & 0x300) !== 0) {
                        const x: number = decor.x - World.cx;
                        const y: number = decor.y - World.cy;
                        const z: number = decor.z - World.cz;
                        const angle: number = decor.angle;

                        let nearestX: number;
                        if (angle === LocAngle.NORTH || angle === LocAngle.EAST) {
                            nearestX = -x;
                        } else {
                            nearestX = x;
                        }

                        let nearestZ: number;
                        if (angle === LocAngle.EAST || angle === LocAngle.SOUTH) {
                            nearestZ = -z;
                        } else {
                            nearestZ = z;
                        }

                        if ((decor.wshape & 0x100) !== 0 && nearestZ >= nearestX) {
                            const drawX: number = x + DECORXOF[angle];
                            const drawZ: number = z + DECORZOF[angle];
                            decor.model.worldRender(angle * 512 + 256, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, drawX, y, drawZ, decor.typecode);
                        }

                        if ((decor.wshape & 0x200) !== 0 && nearestZ <= nearestX) {
                            const drawX: number = x + DECORXOF2[angle];
                            const drawZ: number = z + DECORZOF2[angle];
                            decor.model.worldRender((angle * 512 + 1280) & 0x7ff, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, drawX, y, drawZ, decor.typecode);
                        }
                    }
                }

                const wall: Wall | null = tile.wall;
                if (wall) {
                    if ((wall.angle2 & tile.backWallTypes) !== 0 && !this.wallOccluded(originalLevel, tileX, tileZ, wall.angle2)) {
                        wall.model2?.worldRender(0, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, wall.x - World.cx, wall.y - World.cy, wall.z - World.cz, wall.typecode);
                    }

                    if ((wall.angle1 & tile.backWallTypes) !== 0 && !this.wallOccluded(originalLevel, tileX, tileZ, wall.angle1)) {
                        wall.model1?.worldRender(0, World.cameraSinX, World.cameraCosX, World.cameraSinY, World.cameraCosY, wall.x - World.cx, wall.y - World.cy, wall.z - World.cz, wall.typecode);
                    }
                }
            }

            if (level < this.maxTileLevel - 1) {
                const above: Square | null = this.squares[level + 1][tileX][tileZ];
                if (above && above.drawBack) {
                    World.fillQueue.push(above);
                }
            }

            if (tileX < World.gx) {
                const adjacent: Square | null = tiles[tileX + 1][tileZ];
                if (adjacent && adjacent.drawBack) {
                    World.fillQueue.push(adjacent);
                }
            }

            if (tileZ < World.gz) {
                const adjacent: Square | null = tiles[tileX][tileZ + 1];
                if (adjacent && adjacent.drawBack) {
                    World.fillQueue.push(adjacent);
                }
            }

            if (tileX > World.gx) {
                const adjacent: Square | null = tiles[tileX - 1][tileZ];
                if (adjacent && adjacent.drawBack) {
                    World.fillQueue.push(adjacent);
                }
            }

            if (tileZ > World.gz) {
                const adjacent: Square | null = tiles[tileX][tileZ - 1];
                if (adjacent && adjacent.drawBack) {
                    World.fillQueue.push(adjacent);
                }
            }
        }
    }

    private renderQuickGround(ground: QuickGround, level: number, tileX: number, tileZ: number, sinEyePitch: number, cosEyePitch: number, sinEyeYaw: number, cosEyeYaw: number): void {
        let x3: number;
        let x0: number = (x3 = (tileX << 7) - World.cx);
        let z1: number;
        let z0: number = (z1 = (tileZ << 7) - World.cz);
        let x2: number;
        let x1: number = (x2 = x0 + 128);
        let z3: number;
        let z2: number = (z3 = z0 + 128);

        let y0: number = this.groundh[level][tileX][tileZ] - World.cy;
        let y1: number = this.groundh[level][tileX + 1][tileZ] - World.cy;
        let y2: number = this.groundh[level][tileX + 1][tileZ + 1] - World.cy;
        let y3: number = this.groundh[level][tileX][tileZ + 1] - World.cy;

        let tmp: number = (z0 * sinEyeYaw + x0 * cosEyeYaw) >> 16;
        z0 = (z0 * cosEyeYaw - x0 * sinEyeYaw) >> 16;
        x0 = tmp;

        tmp = (y0 * cosEyePitch - z0 * sinEyePitch) >> 16;
        z0 = (y0 * sinEyePitch + z0 * cosEyePitch) >> 16;
        y0 = tmp;

        if (z0 < 50) {
            return;
        }

        tmp = (z1 * sinEyeYaw + x1 * cosEyeYaw) >> 16;
        z1 = (z1 * cosEyeYaw - x1 * sinEyeYaw) >> 16;
        x1 = tmp;

        tmp = (y1 * cosEyePitch - z1 * sinEyePitch) >> 16;
        z1 = (y1 * sinEyePitch + z1 * cosEyePitch) >> 16;
        y1 = tmp;

        if (z1 < 50) {
            return;
        }

        tmp = (z2 * sinEyeYaw + x2 * cosEyeYaw) >> 16;
        z2 = (z2 * cosEyeYaw - x2 * sinEyeYaw) >> 16;
        x2 = tmp;

        tmp = (y2 * cosEyePitch - z2 * sinEyePitch) >> 16;
        z2 = (y2 * sinEyePitch + z2 * cosEyePitch) >> 16;
        y2 = tmp;

        if (z2 < 50) {
            return;
        }

        tmp = (z3 * sinEyeYaw + x3 * cosEyeYaw) >> 16;
        z3 = (z3 * cosEyeYaw - x3 * sinEyeYaw) >> 16;
        x3 = tmp;

        tmp = (y3 * cosEyePitch - z3 * sinEyePitch) >> 16;
        z3 = (y3 * sinEyePitch + z3 * cosEyePitch) >> 16;
        y3 = tmp;

        if (z3 < 50) {
            return;
        }

        const px0: number = Pix3D.originX + (((x0 << 9) / z0) | 0);
        const py0: number = Pix3D.originY + (((y0 << 9) / z0) | 0);
        const pz0: number = Pix3D.originX + (((x1 << 9) / z1) | 0);
        const px1: number = Pix3D.originY + (((y1 << 9) / z1) | 0);
        const py1: number = Pix3D.originX + (((x2 << 9) / z2) | 0);
        const pz1: number = Pix3D.originY + (((y2 << 9) / z2) | 0);
        const px3: number = Pix3D.originX + (((x3 << 9) / z3) | 0);
        const py3: number = Pix3D.originY + (((y3 << 9) / z3) | 0);

        Pix3D.trans = 0;

        if ((py1 - px3) * (px1 - py3) - (pz1 - py3) * (pz0 - px3) > 0) {
            Pix3D.hclip = py1 < 0 || px3 < 0 || pz0 < 0 || py1 > Pix2D.sizeX || px3 > Pix2D.sizeX || pz0 > Pix2D.sizeX;

            if (World.click && this.insideTriangle(World.clickX, World.clickY, pz1, py3, px1, py1, px3, pz0)) {
                World.groundX = tileX;
                World.groundZ = tileZ;
            }

            if (ground.texture !== -1) {
                if (!World.lowMem) {
                    if (ground.flat) {
                        Pix3D.textureTriangle(
                            py1, px3, pz0,
                            pz1, py3, px1,
                            ground.colourNE, ground.colourNW, ground.colourSE,
                            x0, y0, z0,
                            x1, x3,
                            y1, y3,
                            z1, z3,
                            ground.texture
                        );
                    } else {
                        Pix3D.textureTriangle(
                            py1, px3, pz0,
                            pz1, py3, px1,
                            ground.colourNE, ground.colourNW, ground.colourSE,
                            x2, y2, z2,
                            x3, x1,
                            y3, y1,
                            z3, z1,
                            ground.texture
                        );
                    }
                } else {
                    const textureAverage: number = TEXTURE_AVERAGE[ground.texture];
                    Pix3D.gouraudTriangle(
                        py1, px3, pz0,
                        pz1, py3, px1,
                        this.getTable(textureAverage, ground.colourNE), this.getTable(textureAverage, ground.colourNW), this.getTable(textureAverage, ground.colourSE)
                    );
                }
            } else {
                if (ground.colourNE !== 12345678) {
                    Pix3D.gouraudTriangle(
                        py1, px3, pz0,
                        pz1, py3, px1,
                        ground.colourNE, ground.colourNW, ground.colourSE
                    );
                }
            }
        }

        if ((px0 - pz0) * (py3 - px1) - (py0 - px1) * (px3 - pz0) > 0) {
            Pix3D.hclip = px0 < 0 || pz0 < 0 || px3 < 0 || px0 > Pix2D.sizeX || pz0 > Pix2D.sizeX || px3 > Pix2D.sizeX;

            if (World.click && this.insideTriangle(World.clickX, World.clickY, py0, px1, py3, px0, pz0, px3)) {
                World.groundX = tileX;
                World.groundZ = tileZ;
            }

            if (ground.texture !== -1) {
                if (!World.lowMem) {
                    Pix3D.textureTriangle(
                        px0, pz0, px3,
                        py0, px1, py3,
                        ground.colourSW, ground.colourSE, ground.colourNW,
                        x0, y0, z0,
                        x1, x3,
                        y1, y3,
                        z1, z3,
                        ground.texture
                    );
                } else {
                    const textureAverage: number = TEXTURE_AVERAGE[ground.texture];
                    Pix3D.gouraudTriangle(
                        px0, pz0, px3,
                        py0, px1, py3,
                        this.getTable(textureAverage, ground.colourSW), this.getTable(textureAverage, ground.colourSE), this.getTable(textureAverage, ground.colourNW)
                    );
                }
            } else {
                if (ground.colourSW !== 12345678) {
                    Pix3D.gouraudTriangle(
                        px0, pz0, px3,
                        py0, px1, py3,
                        ground.colourSW, ground.colourSE, ground.colourNW
                    );
                }
            }
        }
    }

    private renderGround(tileX: number, tileZ: number, ground: Ground, sinEyePitch: number, cosEyePitch: number, sinEyeYaw: number, cosEyeYaw: number): void {
        let vertexCount: number = ground.vertexX.length;

        for (let i: number = 0; i < vertexCount; i++) {
            let x: number = ground.vertexX[i] - World.cx;
            let y: number = ground.vertexY[i] - World.cy;
            let z: number = ground.vertexZ[i] - World.cz;

            let tmp: number = (z * sinEyeYaw + x * cosEyeYaw) >> 16;
            z = (z * cosEyeYaw - x * sinEyeYaw) >> 16;
            x = tmp;

            tmp = (y * cosEyePitch - z * sinEyePitch) >> 16;
            z = (y * sinEyePitch + z * cosEyePitch) >> 16;
            y = tmp;

            if (z < 50) {
                return;
            }

            if (ground.faceTexture) {
                Ground.drawTextureVertexX[i] = x;
                Ground.drawTextureVertexY[i] = y;
                Ground.drawTextureVertexZ[i] = z;
            }

            Ground.drawVertexX[i] = Pix3D.originX + (((x << 9) / z) | 0);
            Ground.drawVertexY[i] = Pix3D.originY + (((y << 9) / z) | 0);
        }

        Pix3D.trans = 0;

        vertexCount = ground.faceVertexA.length;
        for (let v: number = 0; v < vertexCount; v++) {
            const a: number = ground.faceVertexA[v];
            const b: number = ground.faceVertexB[v];
            const c: number = ground.faceVertexC[v];

            const x0: number = Ground.drawVertexX[a];
            const x1: number = Ground.drawVertexX[b];
            const x2: number = Ground.drawVertexX[c];

            const y0: number = Ground.drawVertexY[a];
            const y1: number = Ground.drawVertexY[b];
            const y2: number = Ground.drawVertexY[c];

            if ((x0 - x1) * (y2 - y1) - (y0 - y1) * (x2 - x1) > 0) {
                Pix3D.hclip = x0 < 0 || x1 < 0 || x2 < 0 || x0 > Pix2D.sizeX || x1 > Pix2D.sizeX || x2 > Pix2D.sizeX;

                if (World.click && this.insideTriangle(World.clickX, World.clickY, y0, y1, y2, x0, x1, x2)) {
                    World.groundX = tileX;
                    World.groundZ = tileZ;
                }

                if (ground.faceTexture && ground.faceTexture[v] !== -1) {
                    if (!World.lowMem) {
                        if (ground.flat) {
                            Pix3D.textureTriangle(
                                x0, x1, x2,
                                y0, y1, y2,
                                ground.faceColourA[v], ground.faceColourB[v], ground.faceColourC[v],
                                Ground.drawTextureVertexX[0], Ground.drawTextureVertexY[0], Ground.drawTextureVertexZ[0],
                                Ground.drawTextureVertexX[1], Ground.drawTextureVertexX[3],
                                Ground.drawTextureVertexY[1], Ground.drawTextureVertexY[3],
                                Ground.drawTextureVertexZ[1], Ground.drawTextureVertexZ[3],
                                ground.faceTexture[v]
                            );
                        } else {
                            Pix3D.textureTriangle(
                                x0, x1, x2,
                                y0, y1, y2,
                                ground.faceColourA[v], ground.faceColourB[v], ground.faceColourC[v],
                                Ground.drawTextureVertexX[a], Ground.drawTextureVertexY[a], Ground.drawTextureVertexZ[a],
                                Ground.drawTextureVertexX[b], Ground.drawTextureVertexX[c],
                                Ground.drawTextureVertexY[b], Ground.drawTextureVertexY[c],
                                Ground.drawTextureVertexZ[b], Ground.drawTextureVertexZ[c],
                                ground.faceTexture[v]
                            );
                        }
                    } else {
                        const textureAverage: number = TEXTURE_AVERAGE[ground.faceTexture[v]];
                        Pix3D.gouraudTriangle(
                            x0, x1, x2,
                            y0, y1, y2,
                            this.getTable(textureAverage, ground.faceColourA[v]), this.getTable(textureAverage, ground.faceColourB[v]), this.getTable(textureAverage, ground.faceColourC[v])
                        );
                    }
                } else {
                    if (ground.faceColourA[v] !== 12345678) {
                        Pix3D.gouraudTriangle(
                            x0, x1, x2,
                            y0, y1, y2,
                            ground.faceColourA[v], ground.faceColourB[v], ground.faceColourC[v]
                        );
                    }
                }
            }
        }
    }

    private groundOccluded(level: number, x: number, z: number): boolean {
        const cycle: number = this.occlusionCycle[level][x][z];
        if (cycle === -World.cycleNo) {
            return false;
        } else if (cycle === World.cycleNo) {
            return true;
        } else {
            const sx: number = x << 7;
            const sz: number = z << 7;
            if (
                this.occluded(sx + 1, this.groundh[level][x][z], sz + 1) &&
                this.occluded(sx + 128 - 1, this.groundh[level][x + 1][z], sz + 1) &&
                this.occluded(sx + 128 - 1, this.groundh[level][x + 1][z + 1], sz + 128 - 1) &&
                this.occluded(sx + 1, this.groundh[level][x][z + 1], sz + 128 - 1)
            ) {
                this.occlusionCycle[level][x][z] = World.cycleNo;
                return true;
            } else {
                this.occlusionCycle[level][x][z] = -World.cycleNo;
                return false;
            }
        }
    }

    private wallOccluded(level: number, x: number, z: number, type: number): boolean {
        if (!this.groundOccluded(level, x, z)) {
            return false;
        }

        const sceneX: number = x << 7;
        const sceneZ: number = z << 7;
        const sceneY: number = this.groundh[level][x][z] - 1;
        const y0: number = sceneY - 120;
        const y1: number = sceneY - 230;
        const y2: number = sceneY - 238;
        if (type < 16) {
            if (type === 1) {
                if (sceneX > World.cx) {
                    if (!this.occluded(sceneX, sceneY, sceneZ)) {
                        return false;
                    }
                    if (!this.occluded(sceneX, sceneY, sceneZ + 128)) {
                        return false;
                    }
                }
                if (level > 0) {
                    if (!this.occluded(sceneX, y0, sceneZ)) {
                        return false;
                    }
                    if (!this.occluded(sceneX, y0, sceneZ + 128)) {
                        return false;
                    }
                }
                if (!this.occluded(sceneX, y1, sceneZ)) {
                    return false;
                }
                return this.occluded(sceneX, y1, sceneZ + 128);
            }
            if (type === 2) {
                if (sceneZ < World.cz) {
                    if (!this.occluded(sceneX, sceneY, sceneZ + 128)) {
                        return false;
                    }
                    if (!this.occluded(sceneX + 128, sceneY, sceneZ + 128)) {
                        return false;
                    }
                }
                if (level > 0) {
                    if (!this.occluded(sceneX, y0, sceneZ + 128)) {
                        return false;
                    }
                    if (!this.occluded(sceneX + 128, y0, sceneZ + 128)) {
                        return false;
                    }
                }
                if (!this.occluded(sceneX, y1, sceneZ + 128)) {
                    return false;
                }
                return this.occluded(sceneX + 128, y1, sceneZ + 128);
            }
            if (type === 4) {
                if (sceneX < World.cx) {
                    if (!this.occluded(sceneX + 128, sceneY, sceneZ)) {
                        return false;
                    }
                    if (!this.occluded(sceneX + 128, sceneY, sceneZ + 128)) {
                        return false;
                    }
                }
                if (level > 0) {
                    if (!this.occluded(sceneX + 128, y0, sceneZ)) {
                        return false;
                    }
                    if (!this.occluded(sceneX + 128, y0, sceneZ + 128)) {
                        return false;
                    }
                }
                if (!this.occluded(sceneX + 128, y1, sceneZ)) {
                    return false;
                }
                return this.occluded(sceneX + 128, y1, sceneZ + 128);
            }
            if (type === 8) {
                if (sceneZ > World.cz) {
                    if (!this.occluded(sceneX, sceneY, sceneZ)) {
                        return false;
                    }
                    if (!this.occluded(sceneX + 128, sceneY, sceneZ)) {
                        return false;
                    }
                }
                if (level > 0) {
                    if (!this.occluded(sceneX, y0, sceneZ)) {
                        return false;
                    }
                    if (!this.occluded(sceneX + 128, y0, sceneZ)) {
                        return false;
                    }
                }
                if (!this.occluded(sceneX, y1, sceneZ)) {
                    return false;
                }
                return this.occluded(sceneX + 128, y1, sceneZ);
            }
        }

        if (!this.occluded(sceneX + 64, y2, sceneZ + 64)) {
            return false;
        } else if (type === 16) {
            return this.occluded(sceneX, y1, sceneZ + 128);
        } else if (type === 32) {
            return this.occluded(sceneX + 128, y1, sceneZ + 128);
        } else if (type === 64) {
            return this.occluded(sceneX + 128, y1, sceneZ);
        } else if (type === 128) {
            return this.occluded(sceneX, y1, sceneZ);
        }

        console.warn('Warning unsupported wall type');
        return true;
    }

    private spriteOccluded(level: number, tileX: number, tileZ: number, y: number): boolean {
        if (this.groundOccluded(level, tileX, tileZ)) {
            const x: number = tileX << 7;
            const z: number = tileZ << 7;
            return (
                this.occluded(x + 1, this.groundh[level][tileX][tileZ] - y, z + 1) &&
                this.occluded(x + 128 - 1, this.groundh[level][tileX + 1][tileZ] - y, z + 1) &&
                this.occluded(x + 128 - 1, this.groundh[level][tileX + 1][tileZ + 1] - y, z + 128 - 1) &&
                this.occluded(x + 1, this.groundh[level][tileX][tileZ + 1] - y, z + 128 - 1)
            );
        }
        return false;
    }

    private spriteOccluded2(level: number, minX: number, maxX: number, minZ: number, maxZ: number, y: number): boolean {
        let x: number;
        let z: number;
        if (minX !== maxX || minZ !== maxZ) {
            for (x = minX; x <= maxX; x++) {
                for (z = minZ; z <= maxZ; z++) {
                    if (this.occlusionCycle[level][x][z] === -World.cycleNo) {
                        return false;
                    }
                }
            }

            z = (minX << 7) + 1;
            const z0: number = (minZ << 7) + 2;
            const y0: number = this.groundh[level][minX][minZ] - y;
            if (!this.occluded(z, y0, z0)) {
                return false;
            }

            const x1: number = (maxX << 7) - 1;
            if (!this.occluded(x1, y0, z0)) {
                return false;
            }

            const z1: number = (maxZ << 7) - 1;
            if (!this.occluded(z, y0, z1)) {
                return false;
            } else if (this.occluded(x1, y0, z1)) {
                return true;
            } else {
                return false;
            }
        } else if (this.groundOccluded(level, minX, minZ)) {
            x = minX << 7;
            z = minZ << 7;
            return (
                this.occluded(x + 1, this.groundh[level][minX][minZ] - y, z + 1) &&
                this.occluded(x + 128 - 1, this.groundh[level][minX + 1][minZ] - y, z + 1) &&
                this.occluded(x + 128 - 1, this.groundh[level][minX + 1][minZ + 1] - y, z + 128 - 1) &&
                this.occluded(x + 1, this.groundh[level][minX][minZ + 1] - y, z + 128 - 1)
            );
        }
        return false;
    }

    private occluded(x: number, y: number, z: number): boolean {
        for (let i: number = 0; i < World.numActiveOccluders; i++) {
            const occluder: Occlude | null = World.activeOccluders[i];
            if (!occluder) {
                continue;
            }

            if (occluder.mode === 1) {
                const dx: number = occluder.minX - x;
                if (dx > 0) {
                    const minZ: number = occluder.minZ + ((occluder.minDeltaZ * dx) >> 8);
                    const maxZ: number = occluder.maxZ + ((occluder.maxDeltaZ * dx) >> 8);
                    const minY: number = occluder.minY + ((occluder.minDeltaY * dx) >> 8);
                    const maxY: number = occluder.maxY + ((occluder.maxDeltaY * dx) >> 8);
                    if (z >= minZ && z <= maxZ && y >= minY && y <= maxY) {
                        return true;
                    }
                }
            } else if (occluder.mode === 2) {
                const dx: number = x - occluder.minX;
                if (dx > 0) {
                    const minZ: number = occluder.minZ + ((occluder.minDeltaZ * dx) >> 8);
                    const maxZ: number = occluder.maxZ + ((occluder.maxDeltaZ * dx) >> 8);
                    const minY: number = occluder.minY + ((occluder.minDeltaY * dx) >> 8);
                    const maxY: number = occluder.maxY + ((occluder.maxDeltaY * dx) >> 8);
                    if (z >= minZ && z <= maxZ && y >= minY && y <= maxY) {
                        return true;
                    }
                }
            } else if (occluder.mode === 3) {
                const dz: number = occluder.minZ - z;
                if (dz > 0) {
                    const minX: number = occluder.minX + ((occluder.minDeltaX * dz) >> 8);
                    const maxX: number = occluder.maxX + ((occluder.maxDeltaX * dz) >> 8);
                    const minY: number = occluder.minY + ((occluder.minDeltaY * dz) >> 8);
                    const maxY: number = occluder.maxY + ((occluder.maxDeltaY * dz) >> 8);
                    if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                        return true;
                    }
                }
            } else if (occluder.mode === 4) {
                const dz: number = z - occluder.minZ;
                if (dz > 0) {
                    const minX: number = occluder.minX + ((occluder.minDeltaX * dz) >> 8);
                    const maxX: number = occluder.maxX + ((occluder.maxDeltaX * dz) >> 8);
                    const minY: number = occluder.minY + ((occluder.minDeltaY * dz) >> 8);
                    const maxY: number = occluder.maxY + ((occluder.maxDeltaY * dz) >> 8);
                    if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                        return true;
                    }
                }
            } else if (occluder.mode === 5) {
                const dy: number = y - occluder.minY;
                if (dy > 0) {
                    const minX: number = occluder.minX + ((occluder.minDeltaX * dy) >> 8);
                    const maxX: number = occluder.maxX + ((occluder.maxDeltaX * dy) >> 8);
                    const minZ: number = occluder.minZ + ((occluder.minDeltaZ * dy) >> 8);
                    const maxZ: number = occluder.maxZ + ((occluder.maxDeltaZ * dy) >> 8);
                    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private insideTriangle(x: number, y: number, y0: number, y1: number, y2: number, x0: number, x1: number, x2: number): boolean {
        if (y < y0 && y < y1 && y < y2) {
            return false;
        } else if (y > y0 && y > y1 && y > y2) {
            return false;
        } else if (x < x0 && x < x1 && x < x2) {
            return false;
        } else if (x > x0 && x > x1 && x > x2) {
            return false;
        }

        const crossProduct_01: number = (y - y0) * (x1 - x0) - (x - x0) * (y1 - y0);
        const crossProduct_20: number = (y - y2) * (x0 - x2) - (x - x2) * (y0 - y2);
        const crossProduct_12: number = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1);
        return crossProduct_01 * crossProduct_12 > 0 && crossProduct_12 * crossProduct_20 > 0;
    }

    private getTable(hsl: number, lightness: number): number {
        const invLightness: number = 127 - lightness;
        lightness = ((invLightness * (hsl & 0x7f)) / 160) | 0;
        if (lightness < 2) {
            lightness = 2;
        } else if (lightness > 126) {
            lightness = 126;
        }
        return (hsl & 0xff80) + lightness;
    }
}
