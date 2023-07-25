import ScriptRunner from '#lostcity/engine/script/ScriptRunner.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import { Position } from './Position.js';
import { EntityQueueRequest, ScriptArgument } from '#lostcity/entity/EntityQueueRequest.js';
import Script from '#lostcity/engine/script/Script.js';
import PathingEntity from '#lostcity/entity/PathingEntity.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';
import NpcType from '#lostcity/cache/NpcType.js';
import { Interaction } from '#lostcity/entity/Interaction.js';
import World from '#lostcity/engine/World.js';
import CollisionStrategies from '#rsmod/collision/CollisionStrategies.js';

export default class Npc extends PathingEntity {
    static ANIM = 0x2;
    static FACE_ENTITY = 0x4;
    static FORCED_CHAT = 0x8;
    static DAMAGE = 0x10;
    static TRANSMOGRIFY = 0x20;
    static SPOTANIM = 0x40;
    static FACE_COORD = 0x80;

    nid = -1;
    type = -1;

    // runtime variables
    static = true; // static (map) or dynamic (scripted) npc
    despawn = -1;
    respawn = -1;
    startX = -1;
    startZ = -1;
    orientation = -1;

    mask = 0;
    faceX = -1;
    faceZ = -1;
    faceEntity = -1;
    damageTaken = -1;
    damageType = -1;
    currentHealth = 10;
    maxHealth = 10;

    hero = 0; // temp damage source

    // script variables
    delay = 0;
    queue: EntityQueueRequest[] = [];
    timerInterval = 1;
    timerClock = 0;
    interaction: Interaction | null = null;

    private animId: number = -1;
    private animDelay: number = -1;
    private forcedChat: string | null = null;
    private graphicId: number = -1;
    private graphicHeight: number = -1;
    private graphicDelay: number = -1;

    updateMovementStep() {
        const dst = this.walkQueue[this.walkStep];
        let dir = Position.face(this.x, this.z, dst.x, dst.z);

        this.x = Position.moveX(this.x, dir);
        this.z = Position.moveZ(this.z, dir);

        if (dir == -1) {
            this.walkStep--;

            if (this.walkStep < this.walkQueue.length - 1 && this.walkStep != -1) {
                dir = this.updateMovementStep();
            }
        }

        return dir;
    }

    updateMovement() {
        if (this.walkStep != -1 && this.walkStep < this.walkQueue.length) {
            this.walkDir = this.updateMovementStep();

            if (this.walkDir != -1) {
                this.orientation = this.walkDir;
            }
        } else {
            this.walkDir = -1;
            this.walkQueue = [];
        }
    }

    delayed() {
        return this.delay > 0;
    }

    hasSteps() {
        return this.walkQueue.length > 0;
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
        const request = new EntityQueueRequest('npc', script, args, delay);
        this.queue.push(request);
    }

    randomWalk() {
        const dx = Math.round((Math.random() * 10) - 5);
        const dz = Math.round((Math.random() * 10) - 5);

        const type = NpcType.get(this.type);
        if (dx != 0 || dz != 0) {
            const destX = this.startX + dx;
            const destZ = this.startZ + dz;

            const path = World.linePathFinder!.lineOfWalk(this.level, this.x, this.z, destX, destZ, type.size);
            // const path = World.pathFinder!.findPath(this.level, this.x, this.z, destX, destZ, type.size, 1, 1, 0, -2, false, 0, 10, CollisionStrategies.NORMAL);
            this.walkQueue = [];
            // for (const waypoint of path.waypoints) {
            for (const waypoint of path.coordinates) {
                this.walkQueue.push({ x: waypoint.x, z: waypoint.z });
            }
            this.walkQueue.reverse();
            this.walkStep = this.walkQueue.length - 1;
        }
    }

    processNpcModes() {
        if (!this.hasSteps() && Math.random() * 1000 < 300) {
            this.randomWalk();
        }

        this.updateMovement();
    }

    // ----

    resetMasks() {
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

        this.forcedChat = text;
        this.mask |= Npc.FORCED_CHAT;
    }
}
