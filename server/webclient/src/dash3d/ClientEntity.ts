import SeqType, { PostanimMove } from '#/config/SeqType.js';

import ModelSource from '#/dash3d/ModelSource.js';

import { TypedArray1d } from '#/util/Arrays.js';

export default abstract class ClientEntity extends ModelSource {
    x: number = 0;
    z: number = 0;
    yaw: number = 0;
    needsForwardDrawPadding: boolean = false;
    size: number = 1;
    readyanim: number = -1;
    turnanim: number = -1;
    walkanim: number = -1;
    walkanim_b: number = -1;
    walkanim_l: number = -1;
    walkanim_r: number = -1;
    runanim: number = -1;
    chatMessage: string | null = null;
    chatTimer: number = 100;
    chatColour: number = 0;
    chatEffect: number = 0;
    combatCycle: number = -1000;
    damageValues: Int32Array = new Int32Array(4);
    damageTypes: Int32Array = new Int32Array(4);
    damageCycles: Int32Array = new Int32Array(4);
    health: number = 0;
    totalHealth: number = 0;
    faceEntity: number = -1;
    faceSquareX: number = 0;
    faceSquareZ: number = 0;
    secondaryAnim: number = -1;
    secondaryAnimFrame: number = 0;
    secondaryAnimCycle: number = 0;
    primaryAnim: number = -1;
    primaryAnimFrame: number = 0;
    primaryAnimCycle: number = 0;
    primaryAnimDelay: number = 0;
    primaryAnimLoop: number = 0;
    spotanimId: number = -1;
    spotanimFrame: number = 0;
    spotanimCycle: number = 0;
    spotanimLastCycle: number = 0;
    spotanimHeight: number = 0;
    exactStartX: number = 0;
    exactEndX: number = 0;
    exactStartZ: number = 0;
    exactEndZ: number = 0;
    exactMoveEnd: number = 0;
    exactMoveStart: number = 0;
    exactMoveFacing: number = 0;
    cycle: number = 0;
    height: number = 200;
    dstYaw: number = 0;
    routeLength: number = 0;
    routeX: Int32Array = new Int32Array(10);
    routeZ: Int32Array = new Int32Array(10);
    routeRun: boolean[] = new TypedArray1d(10, false);
    animDelayMove: number = 0;
    preanimRouteLength: number = 0;
    turnspeed: number = 32;

    abstract isReady(): boolean;

    teleport(jump: boolean, x: number, z: number): void {
        if (this.primaryAnim !== -1 && SeqType.list[this.primaryAnim].postanim_move === PostanimMove.ABORTANIM) {
            this.primaryAnim = -1;
        }

        if (!jump) {
            const dx: number = x - this.routeX[0];
            const dz: number = z - this.routeZ[0];

            if (dx >= -8 && dx <= 8 && dz >= -8 && dz <= 8) {
                if (this.routeLength < 9) {
                    this.routeLength++;
                }

                for (let i: number = this.routeLength; i > 0; i--) {
                    this.routeX[i] = this.routeX[i - 1];
                    this.routeZ[i] = this.routeZ[i - 1];
                    this.routeRun[i] = this.routeRun[i - 1];
                }

                this.routeX[0] = x;
                this.routeZ[0] = z;
                this.routeRun[0] = false;
                return;
            }
        }

        this.routeLength = 0;
        this.preanimRouteLength = 0;
        this.animDelayMove = 0;
        this.routeX[0] = x;
        this.routeZ[0] = z;
        this.x = this.routeX[0] * 128 + this.size * 64;
        this.z = this.routeZ[0] * 128 + this.size * 64;
    }

    moveCode(running: boolean, direction: number): void {
        let nextX: number = this.routeX[0];
        let nextZ: number = this.routeZ[0];

        if (direction === 0) {
            nextX--;
            nextZ++;
        } else if (direction === 1) {
            nextZ++;
        } else if (direction === 2) {
            nextX++;
            nextZ++;
        } else if (direction === 3) {
            nextX--;
        } else if (direction === 4) {
            nextX++;
        } else if (direction === 5) {
            nextX--;
            nextZ--;
        } else if (direction === 6) {
            nextZ--;
        } else if (direction === 7) {
            nextX++;
            nextZ--;
        }

        if (this.primaryAnim !== -1 && SeqType.list[this.primaryAnim].postanim_move === PostanimMove.ABORTANIM) {
            this.primaryAnim = -1;
        }

        if (this.routeLength < 9) {
            this.routeLength++;
        }

        for (let i: number = this.routeLength; i > 0; i--) {
            this.routeX[i] = this.routeX[i - 1];
            this.routeZ[i] = this.routeZ[i - 1];
            this.routeRun[i] = this.routeRun[i - 1];
        }

        this.routeX[0] = nextX;
        this.routeZ[0] = nextZ;
        this.routeRun[0] = running;
    }

    abortRoute() {
        this.routeLength = 0;
        this.preanimRouteLength = 0;
    }

    addHitmark(loopCycle: number, type: number, value: number) {
        for (let i = 0; i < 4; i++) {
            if (this.damageCycles[i] <= loopCycle) {
                this.damageValues[i] = value;
                this.damageTypes[i] = type;
                this.damageCycles[i] = loopCycle + 70;
                return;
            }
        }
    }
}
