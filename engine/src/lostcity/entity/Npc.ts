import ScriptRunner from '#lostcity/engine/script/ScriptRunner.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import { EntityQueueRequest, ScriptArgument } from '#lostcity/entity/EntityQueueRequest.js';
import Script from '#lostcity/engine/script/Script.js';
import PathingEntity from '#lostcity/entity/PathingEntity.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';
import NpcType from '#lostcity/cache/NpcType.js';
import { Interaction } from '#lostcity/entity/Interaction.js';
import World from '#lostcity/engine/World.js';
import { MoveRestrict } from '#lostcity/entity/MoveRestrict.js';

export default class Npc extends PathingEntity {
    static ANIM = 0x2;
    static FACE_ENTITY = 0x4;
    static SAY = 0x8;
    static DAMAGE = 0x10;
    static TRANSMOGRIFY = 0x20;
    static SPOTANIM = 0x40;
    static FACE_COORD = 0x80;

    // constructor properties
    nid: number;
    type: number;
    startX: number;
    startZ: number;

    // runtime variables
    static: boolean = true; // static (map) or dynamic (scripted) npc
    despawn: number = -1;
    respawn: number = -1;
    orientation: number = -1;

    mask: number = 0;
    faceX: number = -1;
    faceZ: number = -1;
    faceEntity: number = -1;
    damageTaken: number = -1;
    damageType: number = -1;
    currentHealth: number = 10;
    maxHealth: number = 10;

    hero: number = 0; // temp damage source

    // script variables
    delay: number = 0;
    queue: EntityQueueRequest[] = [];
    timerInterval: number = 1;
    timerClock: number = 0;
    interaction: Interaction | null = null;

    private animId: number = -1;
    private animDelay: number = -1;
    private chat: string | null = null;
    private graphicId: number = -1;
    private graphicHeight: number = -1;
    private graphicDelay: number = -1;

    constructor(level: number, x: number, z: number, width: number, length: number, nid: number, type: number, moveRestrict: MoveRestrict) {
        super(level, x, z, width, length, moveRestrict);
        this.nid = nid;
        this.type = type;
        this.startX = this.x;
        this.startZ = this.z;
    }

    updateMovement(): void {
        if (this.walkStep != -1 && this.walkStep < this.walkQueue.length) {
            const capturedX = this.x;
            const capturedZ = this.z;

            this.walkDir = this.updateMovementStep();

            if (this.walkDir != -1) {
                this.orientation = this.walkDir;
                // Remove collision at their previous position.
                World.collisionManager.changeEntityCollision(capturedX, capturedZ, this.level, false);
                // Add collision at their new position.
                World.collisionManager.changeEntityCollision(this.x, this.z, this.level, true);
            }
        } else {
            this.walkDir = -1;
            this.walkQueue = [];
        }
    }

    delayed() {
        return this.delay > 0;
    }

    setTimer(interval: number) {
        this.timerInterval = interval;
    }

    processTimers() {
        if (this.timerInterval !== 0 && ++this.timerClock >= this.timerInterval) {
            this.timerClock = 0;

            const type = NpcType.get(this.type);
            const script = ScriptProvider.getByTrigger(ServerTriggerType.AI_TIMER, type.id, type.category);
            if (script) {
                const state = ScriptRunner.init(script, this);
                ScriptRunner.execute(state);
            }
        }
    }

    processQueue() {
        let processedQueueCount = 0;

        this.queue = this.queue.filter(queue => {
            // purposely only decrements the delay when the npc is not delayed
            if (!this.delayed() && queue.delay-- <= 0) {
                const state = ScriptRunner.init(queue.script, this, null, null, queue.args);
                const executionState = ScriptRunner.execute(state);

                const finished = executionState === ScriptState.ABORTED || executionState === ScriptState.FINISHED;
                if (!finished) {
                    throw new Error(`Script didn't finish: ${queue.script.name}`);
                }
                processedQueueCount++;
                return false;
            }

            return true;
        });

        return processedQueueCount;
    }

    enqueueScript(script: Script, delay = 0, args: ScriptArgument[] = []) {
        const request = new EntityQueueRequest('npc', script, args, delay + 1);
        this.queue.push(request);
    }

    randomWalk() {
        const type = NpcType.get(this.type);

        const dx = Math.round((Math.random() * (type.wanderrange * 2)) - type.wanderrange);
        const dz = Math.round((Math.random() * (type.wanderrange * 2)) - type.wanderrange);

        if (dx != 0 || dz != 0) {
            const destX = this.startX + dx;
            const destZ = this.startZ + dz;

            const path = World.pathFinder.naiveDestination(this.x, this.z, type.size, type.size, destX, destZ, 1, 1);
            this.queueWalkWaypoint(path.x, path.z);
        }
    }

    processNpcModes() {
        if (!this.hasSteps() && Math.random() * 1000 < 300) {
            this.randomWalk();
        }

        this.updateMovement();
    }

    // ----

    resetTransient() {
        if (this.mask === 0) {
            return;
        }

        this.mask = 0;
        this.damageTaken = -1;
        this.damageType = -1;
    }

    // ----

    playAnimation(seq: number, delay: number) {
        this.animId = seq;
        this.animDelay = delay;
        this.mask |= Npc.ANIM;
    }

    spotanim(spotanim: number, height: number, delay: number) {
        this.graphicId = spotanim;
        this.graphicHeight = height;
        this.graphicDelay = delay;
        this.mask |= Npc.SPOTANIM;
    }

    applyDamage(damage: number, type: number, hero: number) {
        this.damageTaken = damage;
        this.damageType = type;
        this.hero = hero;

        this.currentHealth -= damage;
        if (this.currentHealth < 0) {
            this.currentHealth = 0;
        }

        this.mask |= Npc.DAMAGE;
    }

    say(text: string) {
        if (!text) {
            return;
        }

        this.chat = text;
        this.mask |= Npc.SAY;
    }

    faceSquare(x: number, z: number) {
        this.faceX = x * 2 + 1;
        this.faceZ = z * 2 + 1;
        this.mask |= Npc.FACE_COORD;
    }
}
