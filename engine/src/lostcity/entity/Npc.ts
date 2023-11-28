import ScriptRunner from '#lostcity/engine/script/ScriptRunner.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import { EntityQueueRequest, ScriptArgument } from '#lostcity/entity/EntityQueueRequest.js';
import Script from '#lostcity/engine/script/Script.js';
import PathingEntity from '#lostcity/entity/PathingEntity.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';
import NpcType from '#lostcity/cache/NpcType.js';
import { Interaction } from '#lostcity/entity/Interaction.js';
import MoveRestrict from '#lostcity/entity/MoveRestrict.js';
import NpcMode from '#lostcity/entity/NpcMode.js';
import Player from '#lostcity/entity/Player.js';
import {Direction, Position} from '#lostcity/entity/Position.js';
import World from '#lostcity/engine/World.js';
import VarNpcType from '#lostcity/cache/VarNpcType.js';
import BlockWalk from '#lostcity/entity/BlockWalk.js';
import CollisionFlag from '#rsmod/flag/CollisionFlag.js';
import Loc from '#lostcity/entity/Loc.js';
import Obj from '#lostcity/entity/Obj.js';
import LocType from '#lostcity/cache/LocType.js';
import HuntMode from '#lostcity/engine/hunt/HuntMode.js';

export default class Npc extends PathingEntity {
    static ANIM = 0x2;
    static FACE_ENTITY = 0x4;
    static SAY = 0x8;
    static DAMAGE = 0x10;
    static CHANGE_TYPE = 0x20;
    static SPOTANIM = 0x40;
    static FACE_COORD = 0x80;

    static HITPOINTS = 0;
    static ATTACK = 1;
    static STRENGTH = 2;
    static DEFENCE = 3;
    static MAGIC = 4;
    static RANGED = 5;

    // constructor properties
    nid: number;
    type: number;
    origType: number;
    startX: number;
    startZ: number;
    levels: Uint8Array;
    baseLevels: Uint8Array;

    // runtime variables
    static: boolean = true; // static (map) or dynamic (scripted) npc
    vars: Int32Array;

    mask: number = 0;
    faceX: number = -1;
    faceZ: number = -1;
    faceEntity: number = -1;
    damageTaken: number = -1;
    damageType: number = -1;
    animId: number = -1;
    animDelay: number = -1;
    chat: string | null = null;
    graphicId: number = -1;
    graphicHeight: number = -1;
    graphicDelay: number = -1;

    // script variables
    activeScript: ScriptState | null = null;
    delay: number = 0;
    queue: EntityQueueRequest[] = [];
    timerInterval: number = 1;
    timerClock: number = 0;
    mode: NpcMode = NpcMode.NONE;
    interaction: Interaction | null = null;
    huntMode: number = -1;

    heroPoints: {
        uid: number,
        points: number
    }[] = new Array(16); // be sure to reset when stats are recovered/reset

    constructor(level: number, x: number, z: number, width: number, length: number, nid: number, type: number, moveRestrict: MoveRestrict, blockWalk: BlockWalk) {
        super(level, x, z, width, length, moveRestrict, blockWalk);
        this.nid = nid;
        this.type = type;
        this.startX = this.x;
        this.startZ = this.z;
        this.origType = type;

        const npcType = NpcType.get(type);

        this.levels = new Uint8Array(6);
        this.baseLevels = new Uint8Array(6);

        for (let index = 0; index < npcType.stats.length; index++) {
            const level = npcType.stats[index];
            this.levels[index] = level;
            this.baseLevels[index] = level;
        }

        if (npcType.timer !== -1) {
            this.setTimer(npcType.timer);
        }

        this.vars = new Int32Array(VarNpcType.count);
        this.mode = npcType.defaultmode;
        this.huntMode = npcType.huntmode;
    }

    resetHeroPoints() {
        this.heroPoints = new Array(16);
        this.heroPoints.fill({ uid: -1, points: 0 });
    }

    addHero(uid: number, points: number) {
        // check if hero already exists, then add points
        const index = this.heroPoints.findIndex(hero => hero.uid === uid);
        if (index !== -1) {
            this.heroPoints[index].points += points;
            return;
        }

        // otherwise, add a new uid. if all 16 spaces are taken do we replace the lowest?
        const emptyIndex = this.heroPoints.findIndex(hero => hero.uid === -1);
        if (emptyIndex !== -1) {
            this.heroPoints[emptyIndex] = { uid, points };
            return;
        }
    }

    findHero(): number {
        // quicksort heroes by points
        this.heroPoints.sort((a, b) => {
            return b.points - a.points;
        });
        return this.heroPoints[0]?.uid ?? -1;
    }

    getVar(varn: number) {
        return this.vars[varn];
    }

    setVar(varn: number, value: number) {
        this.vars[varn] = value;
    }

    resetEntity(respawn: boolean) {
        this.resetPathingEntity();

        if (respawn) {
            this.type = this.origType;
            this.despawn = -1;
            this.respawn = -1;
            this.orientation = Direction.SOUTH;
            for (let index = 0; index < this.baseLevels.length; index++) {
                this.levels[index] = this.baseLevels[index];
            }
            this.resetHeroPoints();
            this.defaultMode();
        }

        if (this.mask === 0) {
            return;
        }

        this.mask = 0;
        this.damageTaken = -1;
        this.damageType = -1;
        this.animId = -1;
        this.animDelay = -1;
    }

    updateMovement(running: number = -1): void {
        if (this.tele) {
            this.walkDir = -1;
            this.runDir = -1;
            return;
        }

        if (this.x === this.lastX && this.z === this.lastZ) {
            if (running === -1 && !this.forceMove) {
                running = 0;
            }
            this.processMovement(running);
        }
    }

    blockWalkFlag(): number {
        return CollisionFlag.NPC;
    }

    delayed() {
        return this.delay > 0;
    }

    setTimer(interval: number) {
        this.timerInterval = interval;
    }

    executeScript(script: ScriptState) {
        if (!script) {
            return;
        }

        const state = ScriptRunner.execute(script);
        if (state !== ScriptState.FINISHED && state !== ScriptState.ABORTED) {
            this.activeScript = script;
        } else if (script === this.activeScript) {
            this.activeScript = null;
        }
    }

    processTimers() {
        if (this.timerInterval !== 0 && ++this.timerClock >= this.timerInterval) {
            this.timerClock = 0;

            const type = NpcType.get(this.type);
            const script = ScriptProvider.getByTrigger(ServerTriggerType.AI_TIMER, type.id, type.category);
            if (script) {
                this.executeScript(ScriptRunner.init(script, this));
            }
        }
    }

    processQueue() {
        let processedQueueCount = 0;

        for (let i = 0; i < this.queue.length; i++) {
            const queue = this.queue[i];

            // purposely only decrements the delay when the npc is not delayed
            if (!this.delayed()) {
                queue.delay--;
            }

            if (!this.delayed() && queue.delay <= 0) {
                const state = ScriptRunner.init(queue.script, this, null, null, queue.args);
                const executionState = ScriptRunner.execute(state);

                if (executionState !== ScriptState.FINISHED && executionState !== ScriptState.ABORTED) {
                    this.activeScript = state;
                }

                processedQueueCount++;
                this.queue.splice(i--, 1);
            }
        }

        return processedQueueCount;
    }

    enqueueScript(script: Script, delay = 0, args: ScriptArgument[] = []) {
        const request = new EntityQueueRequest('npc', script, args, delay + 1);
        this.queue.push(request);
    }

    randomWalk(range: number) {
        const dx = Math.round((Math.random() * (range * 2)) - range);
        const dz = Math.round((Math.random() * (range * 2)) - range);
        const destX = this.startX + dx;
        const destZ = this.startZ + dz;

        if (destX !== this.x || destZ !== this.z) {
            this.queueWalkStep(destX, destZ);
        }
    }

    processNpcModes() {
        switch (this.mode) {
            case NpcMode.NULL:
                this.defaultMode();
                break;
            case NpcMode.NONE:
                this.noMode();
                break;
            case NpcMode.WANDER:
                this.wanderMode();
                break;
            case NpcMode.PATROL:
                this.patrolMode();
                break;
            case NpcMode.PLAYERESCAPE:
                this.playerEscapeMode();
                break;
            case NpcMode.PLAYERFOLLOW:
                this.playerFollowMode();
                break;
            case NpcMode.PLAYERFACE:
                this.playerFaceMode();
                break;
            case NpcMode.PLAYERFACECLOSE:
                this.playerFaceCloseMode();
                break;
            default:
                this.aiMode();
                break;
        }
        if (this.mode !== NpcMode.NONE) {
            this.updateMovement();
        }
    }

    noMode(): void {
        this.mode = NpcMode.NONE;
        this.resetInteraction();
    }

    defaultMode(): void {
        const type = NpcType.get(this.type);
        this.mode = type.defaultmode;
        this.resetInteraction();
    }

    wanderMode(): void {
        const type = NpcType.get(this.type);
        if (type.moverestrict !== MoveRestrict.NOMOVE && Math.random() < 0.125) {
            this.randomWalk(type.wanderrange);
        }
    }

    patrolMode(): void {
        // TODO points
    }

    playerEscapeMode(): void {
        if (!this.static) {
            this.noMode();
            World.removeNpc(this);
            return;
        }

        this.defaultMode();
        this.queueWalkStep(this.startX, this.startZ);
    }

    playerFollowMode(): void {
        if (!this.interaction) {
            return;
        }

        const target = this.interaction.target as Player;

        if (World.getPlayer(target.pid) == null) {
            this.playerEscapeMode();
            return;
        }

        if (this.level != target.level) {
            this.defaultMode();
            return;
        }
        
        this.queueWalkStep(target.x, target.z);

        for (let x = this.x; x < this.x + this.width; x++) {
            for (let z = this.z; z < this.z + this.length; z++) {
                if (target.x === x && target.z === z) {
                    // if the npc is standing on top of the target
                    const step = this.cardinalStep();
                    this.queueWalkStep(step.x, step.z);
                    break;
                }
            }
        }
    }

    playerFaceMode(): void {
        if (!this.interaction) {
            return;
        }

        const target = this.interaction.target as Player;

        if (World.getPlayer(target.pid) == null) {
            this.defaultMode();
            return;
        }

        if (this.level != target.level) {
            this.defaultMode();
            return;
        }

        const type = NpcType.get(this.type);

        if (Position.distanceTo(this, target) > type.maxrange) {
            this.defaultMode();
            return;
        }

        this.facePlayer(target.pid);
    }

    playerFaceCloseMode(): void {
        if (!this.interaction) {
            return;
        }

        const target = this.interaction.target as Player;

        if (World.getPlayer(target.pid) == null) {
            this.defaultMode();
            return;
        }

        if (this.level != target.level) {
            this.defaultMode();
            return;
        }

        if (Position.distanceTo(this, target) > 1) {
            this.defaultMode();
            return;
        }

        this.facePlayer(target.pid);
    }

    aiMode(): void {
        if (this.delayed() || !this.interaction) {
            return;
        }

        const target = this.interaction.target as Player;

        if (World.getPlayer(target.pid) == null) {
            this.playerEscapeMode();
            return;
        }

        const distanceToTarget = Position.distanceTo(this, target);
        const distanceToEscape = Position.distanceTo(this, {x: this.startX, z: this.startZ});
        const type = NpcType.get(this.type);

        if (distanceToTarget > type.attackrange) {
            this.playerEscapeMode();
            return;
        }

        // TODO check for ap
        if (!this.inOperableDistance(this.interaction) && (distanceToEscape <= type.maxrange || Position.distanceTo(target, {x: this.startX, z: this.startZ}) <= distanceToEscape)) {
            this.playerFollowMode();
        }

        if (!this.inOperableDistance(this.interaction)) {
            return;
        }

        this.clearWalkSteps();

        const trigger = this.getTriggerForMode();
        if (trigger) {
            const script = ScriptProvider.getByTrigger(trigger, this.type, -1);

            this.facePlayer(target.pid);

            if (script) {
                this.executeScript(ScriptRunner.init(script, this, this.interaction.target, null, []));
            }
        }
    }

    getTriggerForMode(): ServerTriggerType | null {
        switch (this.mode) {
            // [ai_opplayerX,npc]
            case NpcMode.OPPLAYER1:
                return ServerTriggerType.AI_OPPLAYER1;
            case NpcMode.OPPLAYER2:
                return ServerTriggerType.AI_OPPLAYER2;
            case NpcMode.OPPLAYER3:
                return ServerTriggerType.AI_OPPLAYER3;
            case NpcMode.OPPLAYER4:
                return ServerTriggerType.AI_OPPLAYER4;
            case NpcMode.OPPLAYER5:
                return ServerTriggerType.AI_OPPLAYER5;
            // [ai_applayerX,npc]
            case NpcMode.APPLAYER1:
                return ServerTriggerType.AI_APPLAYER1;
            case NpcMode.APPLAYER2:
                return ServerTriggerType.AI_APPLAYER2;
            case NpcMode.APPLAYER3:
                return ServerTriggerType.AI_APPLAYER3;
            case NpcMode.APPLAYER4:
                return ServerTriggerType.AI_APPLAYER4;
            case NpcMode.APPLAYER5:
                return ServerTriggerType.AI_APPLAYER5;
            // [ai_oplocX,npc]
            case NpcMode.OPLOC1:
                return ServerTriggerType.AI_OPLOC1;
            case NpcMode.OPLOC2:
                return ServerTriggerType.AI_OPLOC2;
            case NpcMode.OPLOC3:
                return ServerTriggerType.AI_OPLOC3;
            case NpcMode.OPLOC4:
                return ServerTriggerType.AI_OPLOC4;
            case NpcMode.OPLOC5:
                return ServerTriggerType.AI_OPLOC5;
            // [ai_aplocX,npc]
            case NpcMode.APLOC1:
                return ServerTriggerType.AI_APLOC1;
            case NpcMode.APLOC2:
                return ServerTriggerType.AI_APLOC2;
            case NpcMode.APLOC3:
                return ServerTriggerType.AI_APLOC3;
            case NpcMode.APLOC4:
                return ServerTriggerType.AI_APLOC4;
            case NpcMode.APLOC5:
                return ServerTriggerType.AI_APLOC5;
            // [ai_opobjX,npc]
            case NpcMode.OPOBJ1:
                return ServerTriggerType.AI_OPOBJ1;
            case NpcMode.OPOBJ2:
                return ServerTriggerType.AI_OPOBJ2;
            case NpcMode.OPOBJ3:
                return ServerTriggerType.AI_OPOBJ3;
            case NpcMode.OPOBJ4:
                return ServerTriggerType.AI_OPOBJ4;
            case NpcMode.OPOBJ5:
                return ServerTriggerType.AI_OPOBJ5;
            // [ai_apobjX,npc]
            case NpcMode.APOBJ1:
                return ServerTriggerType.AI_APOBJ1;
            case NpcMode.APOBJ2:
                return ServerTriggerType.AI_APOBJ2;
            case NpcMode.APOBJ3:
                return ServerTriggerType.AI_APOBJ3;
            case NpcMode.APOBJ4:
                return ServerTriggerType.AI_APOBJ4;
            case NpcMode.APOBJ5:
                return ServerTriggerType.AI_APOBJ5;
            // [ai_opnpcX,npc]
            case NpcMode.OPNPC1:
                return ServerTriggerType.AI_OPNPC1;
            case NpcMode.OPNPC2:
                return ServerTriggerType.AI_OPNPC2;
            case NpcMode.OPNPC3:
                return ServerTriggerType.AI_OPNPC3;
            case NpcMode.OPNPC4:
                return ServerTriggerType.AI_OPNPC4;
            case NpcMode.OPNPC5:
                return ServerTriggerType.AI_OPNPC5;
            // [ai_apnpcX,npc]
            case NpcMode.APNPC1:
                return ServerTriggerType.AI_APNPC1;
            case NpcMode.APNPC2:
                return ServerTriggerType.AI_APNPC2;
            case NpcMode.APNPC3:
                return ServerTriggerType.AI_APNPC3;
            case NpcMode.APNPC4:
                return ServerTriggerType.AI_APNPC4;
            case NpcMode.APNPC5:
                return ServerTriggerType.AI_APNPC5;
            default:
                return null;
        }
    }

    setInteraction(mode: ServerTriggerType, target: Player | Npc | Loc | Obj) {
        this.interaction = {
            mode,
            target,
            x: target.x,
            z: target.z,
            ap: true,
            apRange: 10,
            apRangeCalled: false
        };

        if (target instanceof Player) {
            this.faceEntity = target.pid + 32768;
            this.mask |= Npc.FACE_ENTITY;
        } else if (target instanceof Npc) {
            this.faceEntity = target.nid;
            this.mask |= Npc.FACE_ENTITY;
        } else if (target instanceof Loc) {
            const type = LocType.get(target.type);
            this.faceX = (target.x * 2) + type.width;
            this.faceZ = (target.z * 2) + type.length;
        } else {
            this.faceX = (target.x * 2) + 1;
            this.faceZ = (target.z * 2) + 1;
        }

        if (this.inOperableDistance(this.interaction)) {
            this.interaction.ap = false;
        }
    }

    resetInteraction() {
        if (!this.interaction) {
            return;
        }
        this.interaction = null;
        this.faceEntity = -1;
        this.mask |= Npc.FACE_ENTITY;
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

    applyDamage(damage: number, type: number) {
        this.damageTaken = damage;
        this.damageType = type;

        const current = this.levels[Npc.HITPOINTS];
        if (current - damage <= 0) {
            this.levels[Npc.HITPOINTS] = 0;
            this.damageTaken = current;
        } else {
            this.levels[Npc.HITPOINTS] = current - damage;
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
        this.orientation = Position.face(this.x, this.z, x, z);
        this.mask |= Npc.FACE_COORD;
    }

    changeType(id: number) {
        this.type = id;
        this.mask |= Npc.CHANGE_TYPE;
    }

    facePlayer(pid: number) {
        if (this.faceEntity === pid + 32768) {
            return;
        }

        this.faceEntity = pid + 32768;
        this.mask |= Npc.FACE_ENTITY;
    }
}
