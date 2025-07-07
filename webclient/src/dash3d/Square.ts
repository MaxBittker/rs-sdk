import Linkable from '#/datastruct/Linkable.js';

import GroundDecor from '#/dash3d/GroundDecor.js';
import Sprite from '#/dash3d/Sprite.js';
import GroundObject from '#/dash3d/GroundObject.js';
import Ground from '#/dash3d/Ground.js';
import QuickGround from '#/dash3d/QuickGround.js';
import Wall from '#/dash3d/Wall.js';
import Decor from '#/dash3d/Decor.js';

import { TypedArray1d } from '#/util/Arrays.js';

export default class Square extends Linkable {
    // constructor
    level: number;
    readonly x: number;
    readonly z: number;
    readonly originalLevel: number;
    readonly locs: (Sprite | null)[];
    readonly primaryExtendDirections: Int32Array;

    // runtime
    quickGround: QuickGround | null = null;
    ground: Ground | null = null;
    wall: Wall | null = null;
    decor: Decor | null = null;
    groundDecor: GroundDecor | null = null;
    groundObject: GroundObject | null = null;
    linkedSquare: Square | null = null;
    primaryCount: number = 0;
    combinedPrimaryExtendDirections: number = 0;
    drawLevel: number = 0;
    drawFront: boolean = false;
    drawBack: boolean = false;
    drawPrimaries: boolean = false;
    cornerSides: number = 0;
    sidesBeforeCorner: number = 0;
    sidesAfterCorner: number = 0;
    backWallTypes: number = 0;

    constructor(level: number, x: number, z: number) {
        super();
        this.originalLevel = this.level = level;
        this.x = x;
        this.z = z;
        this.locs = new TypedArray1d(5, null);
        this.primaryExtendDirections = new Int32Array(5);
    }
}
