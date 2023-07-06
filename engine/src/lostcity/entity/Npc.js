import ScriptProvider from '#lostcity/engine/ScriptProvider.js';
import ScriptRunner from '#lostcity/engine/ScriptRunner.js';
import ScriptState from '#lostcity/engine/ScriptState.js';
import World from '#lostcity/engine/World.js';
import { Position } from './Position.js';

export default class Npc {
    static ANIM = 0x2;
    static FACE_ENTITY = 0x4;
    static FORCED_CHAT = 0x8;
    static DAMAGE = 0x10;
    static TRANSMOGRIFY = 0x20;
    static SPOTANIM = 0x40;
    static FACE_COORD = 0x80;

    nid = -1;
    type = -1;

    x = -1;
    z = -1;
    level = -1;

    // runtime variables
    startX = -1;
    startZ = -1;
    orientation = -1;

    walkDir = -1;
    walkStep = -1;
    walkQueue = [];

    mask = 0;
    faceX = -1;
    faceZ = -1;
    faceEntity = -1;
    damageTaken = -1;
    damageType = -1;
    currentHealth = 10;
    maxHealth = 10;

    hero = 0; // damage source

    // script variables
    delay = 0;
    queue = [];
    timers = [];
    apScript = null;
    opScript = null;
    currentApRange = 10;
    apRangeCalled = false;
    target = null;
    persistent = false;

    updateMovementStep() {
        let dst = this.walkQueue[this.walkStep];
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

    resetInteraction() {
        this.apScript = null;
        this.opScript = null;
        this.currentApRange = 10;
        this.apRangeCalled = false;
        this.target = null;
        this.persistent = false;
    }

    delayed() {
        return this.delay > 0;
    }

    hasSteps() {
        return this.walkQueue.length > 0;
    }

    processQueue() {
        let processedQueueCount = 0;

        this.queue = this.queue.filter(s => {
            if (!this.delayed() && !s.future()) {
                let state = ScriptRunner.execute(s);
                let finished = state == ScriptState.ABORTED || state == ScriptState.FINISHED;
                processedQueueCount++;
                return !finished;
            } else if (!s.future()) {
                return false;
            }

            return true;
        });

        return processedQueueCount;
    }

    enqueueScript(script, delay = 0, args = []) {
        let state = ScriptRunner.init(script, this, null, null, args);
        state.clock = World.currentTick + delay;

        this.queue.push(state);
    }

    resetMasks() {
        if (this.mask === 0) {
            return;
        }

        this.mask = 0;
        this.damageTaken = -1;
        this.damageType = -1;
    }

    playAnimation(seq, delay) {
        this.animId = seq;
        this.animDelay = delay;
        this.mask |= Npc.ANIM;
    }

    applyDamage(damage, type, hero) {
        this.damageTaken = damage;
        this.damageType = type;
        this.hero = hero;

        this.currentHealth -= damage;
        if (this.currentHealth < 0) {
            this.currentHealth = 0;
        }

        this.mask |= Npc.DAMAGE;
    }
}
