import { CoordGrid } from './coord.js';

export class Npc {
    coord = CoordGrid.from(0, 0, 0);
    tele = false;
    jump = false;
    runDir = -1;
    walkDir = -1;
    active = false;
    masks = 0;
    faceEntity = -1;
    faceX = -1;
    faceZ = -1;
    orientationX = -1;
    orientationZ = -1;
    damageTaken = -1;
    damageType = -1;
    damageTaken2 = -1;
    damageType2 = -1;
    currentHitpoints = -1;
    baseHitpoints = -1;
    animId = -1;
    animDelay = -1;
    say: string | null = null;
    graphicId = -1;
    graphicHeight = -1;
    graphicDelay = -1;
    observers = 0;

    constructor(
        readonly nid: number,
        public ntype: number
    ) {}

    cleanup(): void {
        this.walkDir = -1;
        this.runDir = -1;
        this.jump = false;
        this.tele = false;
        this.masks = 0;
        this.faceX = -1;
        this.faceZ = -1;
        this.damageTaken = -1;
        this.damageType = -1;
        this.damageTaken2 = -1;
        this.damageType2 = -1;
        this.currentHitpoints = -1;
        this.baseHitpoints = -1;
        this.animId = -1;
        this.animDelay = -1;
        this.say = null;
        this.graphicId = -1;
        this.graphicHeight = -1;
        this.graphicDelay = -1;
    }
}
