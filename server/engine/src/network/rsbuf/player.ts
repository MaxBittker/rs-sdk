import { BuildArea } from './build.js';
import { CoordGrid } from './coord.js';
import { Visibility } from './visibility.js';

export class Chat {
    constructor(
        readonly bytes: Uint8Array,
        readonly color: number,
        readonly effect: number,
        readonly ignored: number
    ) {}
}

export class ExactMove {
    constructor(
        readonly startX: number,
        readonly startZ: number,
        readonly endX: number,
        readonly endZ: number,
        readonly begin: number,
        readonly finish: number,
        readonly dir: number
    ) {}
}

export class Player {
    coord = CoordGrid.from(0, 0, 0);
    origin = CoordGrid.from(0, 0, 0);
    tele = false;
    jump = false;
    runDir = -1;
    walkDir = -1;
    visibility = Visibility.DEFAULT;
    active = false;
    build = new BuildArea();
    masks = 0;
    appearance = new Uint8Array(0);
    lastAppearance = -1;
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
    chat: Chat | null = null;
    graphicId = -1;
    graphicHeight = -1;
    graphicDelay = -1;
    exactMove: ExactMove | null = null;

    constructor(readonly pid: number) {}

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
        this.chat = null;
        this.graphicId = -1;
        this.graphicHeight = -1;
        this.graphicDelay = -1;
        this.exactMove = null;
    }
}
