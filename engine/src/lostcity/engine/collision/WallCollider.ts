import { CollisionFlagMap } from '@2004scape/rsmod-pathfinder';

import LocShape from '#lostcity/engine/collision/LocShape.js';
import WallStraightCollider from '#lostcity/engine/collision/wall/WallStraightCollider.js';
import WallCornerCollider from '#lostcity/engine/collision/wall/WallCornerCollider.js';
import WallCornerLCollider from '#lostcity/engine/collision/wall/WallCornerLCollider.js';

export default class WallCollider {
    private readonly wallStraightCollider: WallStraightCollider;
    private readonly wallCornerCollider: WallCornerCollider;
    private readonly wallCornerLCollider: WallCornerLCollider;

    constructor(flags: CollisionFlagMap) {
        this.wallStraightCollider = new WallStraightCollider(flags);
        this.wallCornerCollider = new WallCornerCollider(flags);
        this.wallCornerLCollider = new WallCornerLCollider(flags);
    }

    change(x: number, z: number, level: number, angle: number, shape: number, blockrange: boolean, add: boolean): void {
        switch (shape) {
            case LocShape.WALL_STRAIGHT:
                this.wallStraightCollider.change(x, z, level, angle, blockrange, add);
                break;
            case LocShape.WALL_DIAGONAL_CORNER:
            case LocShape.WALL_SQUARE_CORNER:
                this.wallCornerCollider.change(x, z, level, angle, blockrange, add);
                break;
            case LocShape.WALL_L:
                this.wallCornerLCollider.change(x, z, level, angle, blockrange, add);
                break;
            default:
                throw new Error(`Invalid loc shape for wall collider. Shape was: ${shape}.`);
        }
    }
}
