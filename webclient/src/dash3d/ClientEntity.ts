import SeqType, { PostanimMove } from '#/config/SeqType.js';

import ModelSource from '#/dash3d/ModelSource.ts';

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
    chatColor: number = 0;
    chatStyle: number = 0;
    combatCycle: number = -1000;
    damageValues: Int32Array = new Int32Array(4);
    damageTypes: Int32Array = new Int32Array(4);
    damageCycles: Int32Array = new Int32Array(4);
    health: number = 0;
    totalHealth: number = 0;
    targetId: number = -1;
    targetTileX: number = 0;
    targetTileZ: number = 0;
    secondarySeqId: number = -1;
    secondarySeqFrame: number = 0;
    secondarySeqCycle: number = 0;
    primarySeqId: number = -1;
    primarySeqFrame: number = 0;
    primarySeqCycle: number = 0;
    primarySeqDelay: number = 0;
    primarySeqLoop: number = 0;
    spotanimId: number = -1;
    spotanimFrame: number = 0;
    spotanimCycle: number = 0;
    spotanimLastCycle: number = 0;
    spotanimHeight: number = 0;
    forceMoveStartSceneTileX: number = 0;
    forceMoveEndSceneTileX: number = 0;
    forceMoveStartSceneTileZ: number = 0;
    forceMoveEndSceneTileZ: number = 0;
    forceMoveEndCycle: number = 0;
    forceMoveStartCycle: number = 0;
    forceMoveFaceDirection: number = 0;
    cycle: number = 0;
    height: number = 0;
    dstYaw: number = 0;
    routeLength: number = 0;
    routeFlagX: Int32Array = new Int32Array(10);
    routeFlagZ: Int32Array = new Int32Array(10);
    routeRun: boolean[] = new TypedArray1d(10, false);
    seqDelayMove: number = 0;

    lastMask: number = -1;
    lastMaskCycle: number = -1;
    lastFaceX: number = -1;
    lastFaceZ: number = -1;

    preanimRouteLength: number = 0;

    abstract isVisible(): boolean;

    move(teleport: boolean, x: number, z: number): void {
        if (this.primarySeqId !== -1 && SeqType.types[this.primarySeqId].postanim_move === PostanimMove.ABORTANIM) {
            this.primarySeqId = -1;
        }

        if (!teleport) {
            const dx: number = x - this.routeFlagX[0];
            const dz: number = z - this.routeFlagZ[0];

            if (dx >= -8 && dx <= 8 && dz >= -8 && dz <= 8) {
                if (this.routeLength < 9) {
                    this.routeLength++;
                }

                for (let i: number = this.routeLength; i > 0; i--) {
                    this.routeFlagX[i] = this.routeFlagX[i - 1];
                    this.routeFlagZ[i] = this.routeFlagZ[i - 1];
                    this.routeRun[i] = this.routeRun[i - 1];
                }

                this.routeFlagX[0] = x;
                this.routeFlagZ[0] = z;
                this.routeRun[0] = false;
                return;
            }
        }

        this.routeLength = 0;
        this.preanimRouteLength = 0;
        this.seqDelayMove = 0;
        this.routeFlagX[0] = x;
        this.routeFlagZ[0] = z;
        this.x = this.routeFlagX[0] * 128 + this.size * 64;
        this.z = this.routeFlagZ[0] * 128 + this.size * 64;
    }

    step(running: boolean, direction: number): void {
        let nextX: number = this.routeFlagX[0];
        let nextZ: number = this.routeFlagZ[0];

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

        if (this.primarySeqId !== -1 && SeqType.types[this.primarySeqId].postanim_move === PostanimMove.ABORTANIM) {
            this.primarySeqId = -1;
        }

        if (this.routeLength < 9) {
            this.routeLength++;
        }

        for (let i: number = this.routeLength; i > 0; i--) {
            this.routeFlagX[i] = this.routeFlagX[i - 1];
            this.routeFlagZ[i] = this.routeFlagZ[i - 1];
            this.routeRun[i] = this.routeRun[i - 1];
        }

        this.routeFlagX[0] = nextX;
        this.routeFlagZ[0] = nextZ;
        this.routeRun[0] = running;
    }

    clearRoute() {
        this.routeLength = 0;
        this.preanimRouteLength = 0;
    }

    hit(loopCycle: number, type: number, value: number) {
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
