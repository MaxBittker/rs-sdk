import Packet from '#jagex2/io/Packet.js';

import NpcType from '#lostcity/cache/config/NpcType.js';
import VarNpcType from '#lostcity/cache/config/VarNpcType.js';

import World from '#lostcity/engine/World.js';

import Script from '#lostcity/engine/script/Script.js';
import ScriptPointer from '#lostcity/engine/script/ScriptPointer.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import ScriptRunner from '#lostcity/engine/script/ScriptRunner.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';

import BlockWalk from '#lostcity/entity/BlockWalk.js';
import {EntityQueueRequest, NpcQueueType, ScriptArgument} from '#lostcity/entity/EntityQueueRequest.js';
import Loc from '#lostcity/entity/Loc.js';
import MoveRestrict from '#lostcity/entity/MoveRestrict.js';
import NpcMode from '#lostcity/entity/NpcMode.js';
import Obj from '#lostcity/entity/Obj.js';
import PathingEntity from '#lostcity/entity/PathingEntity.js';
import Player from '#lostcity/entity/Player.js';
import {Direction, Position} from '#lostcity/entity/Position.js';
import HuntType from '#lostcity/cache/config/HuntType.js';
import HuntModeType from '#lostcity/entity/hunt/HuntModeType.js';
import HuntCheckNotTooStrong from '#lostcity/entity/hunt/HuntCheckNotTooStrong.js';

import LinkList from '#jagex2/datastruct/LinkList.js';

import ScriptVarType from '#lostcity/cache/config/ScriptVarType.js';
import {HuntIterator} from '#lostcity/engine/script/ScriptIterators.js';
import MoveSpeed from '#lostcity/entity/MoveSpeed.js';
import Entity from '#lostcity/entity/Entity.js';
import Interaction from '#lostcity/entity/Interaction.js';
import EntityLifeCycle from '#lostcity/entity/EntityLifeCycle.js';
import NpcStat from '#lostcity/entity/NpcStat.js';

import * as rsmod from '@2004scape/rsmod-pathfinder';
import {CollisionFlag, CollisionType} from '@2004scape/rsmod-pathfinder';

export default class Npc extends PathingEntity {
    static readonly ANIM = 0x2;
    static readonly FACE_ENTITY = 0x4;
    static readonly SAY = 0x8;
    static readonly DAMAGE = 0x10;
    static readonly CHANGE_TYPE = 0x20;
    static readonly SPOTANIM = 0x40;
    static readonly FACE_COORD = 0x80;

    // constructor properties
    nid: number;
    type: number;
    uid: number;
    origType: number;
    startX: number;
    startZ: number;
    levels: Uint8Array = new Uint8Array(6);
    baseLevels: Uint8Array = new Uint8Array(6);

    // runtime variables
    vars: Int32Array;
    varsString: string[];

    // script variables
    activeScript: ScriptState | null = null;
    delay: number = 0;
    queue: LinkList<EntityQueueRequest> = new LinkList();
    timerInterval: number = 0;
    timerClock: number = 0;
    huntMode: number = -1;
    nextHuntTick: number = -1;
    huntrange: number = 5;

    nextPatrolTick: number = -1;
    nextPatrolPoint : number = 0;
    delayedPatrol : boolean = false;

    heroPoints: {
        uid: number;
        points: number;
    }[] = new Array(16); // be sure to reset when stats are recovered/reset

    constructor(level: number, x: number, z: number, width: number, length: number, lifecycle: EntityLifeCycle, nid: number, type: number, moveRestrict: MoveRestrict, blockWalk: BlockWalk) {
        super(level, x, z, width, length, lifecycle, moveRestrict, blockWalk, Npc.FACE_COORD, Npc.FACE_ENTITY, false);
        this.nid = nid;
        this.type = type;
        this.uid = (type << 16) | nid;
        this.startX = this.x;
        this.startZ = this.z;
        this.origType = type;

        const npcType = NpcType.get(type);

        for (let index = 0; index < npcType.stats.length; index++) {
            const level = npcType.stats[index];
            this.levels[index] = level;
            this.baseLevels[index] = level;
        }

        if (npcType.timer !== -1) {
            this.setTimer(npcType.timer);
        }

        this.vars = new Int32Array(VarNpcType.count);
        this.varsString = new Array(VarNpcType.count);
        this.targetOp = npcType.defaultmode;
        this.huntMode = npcType.huntmode;
        this.huntrange = npcType.huntrange;
    }

    resetHeroPoints() {
        this.heroPoints = new Array(16);
        this.heroPoints.fill({ uid: -1, points: 0 });
    }

    addHero(uid: number, points: number) {
        // check if hero already exists, then add points
        const index = this.heroPoints.findIndex(hero => hero && hero.uid === uid);
        if (index !== -1) {
            this.heroPoints[index].points += points;
            return;
        }

        // otherwise, add a new uid. if all 16 spaces are taken do we replace the lowest?
        const emptyIndex = this.heroPoints.findIndex(hero => hero && hero.uid === -1);
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

    getVar(id: number) {
        const varn = VarNpcType.get(id);
        return varn.type === ScriptVarType.STRING ? this.varsString[varn.id] : this.vars[varn.id];
    }

    setVar(id: number, value: number | string) {
        const varn = VarNpcType.get(id);

        if (varn.type === ScriptVarType.STRING && typeof value === 'string') {
            this.varsString[varn.id] = value;
        } else if (typeof value === 'number') {
            this.vars[varn.id] = value;
        }
    }

    resetEntity(respawn: boolean) {
        if (respawn) {
            this.type = this.origType;
            this.uid = (this.type << 16) | this.nid;
            this.orientation = Direction.SOUTH;
            for (let index = 0; index < this.baseLevels.length; index++) {
                this.levels[index] = this.baseLevels[index];
            }
            this.resetHeroPoints();
            this.defaultMode();

            const npcType: NpcType = NpcType.get(this.type);
            this.huntrange = npcType.huntrange;
        }
        super.resetPathingEntity();
    }

    updateMovement(repathAllowed: boolean = true): boolean {
        const type = NpcType.get(this.type);
        if (type.moverestrict === MoveRestrict.NOMOVE) {
            return false;
        }

        if (repathAllowed && this.target instanceof PathingEntity && !this.interacted && this.walktrigger === -1) {
            this.pathToPathingTarget();
        }

        if (this.walktrigger !== -1) {
            const type = NpcType.get(this.type);
            const script = ScriptProvider.getByTrigger(ServerTriggerType.AI_QUEUE1 + this.walktrigger, type.id, type.category);
            this.walktrigger = -1;

            if (script) {
                const state = ScriptRunner.init(script, this, null, [this.walktriggerArg]);
                ScriptRunner.execute(state);
            }
        }

        if (this.moveSpeed !== MoveSpeed.INSTANT) {
            this.moveSpeed = this.defaultMoveSpeed();
        }

        return super.processMovement();
    }

    blockWalkFlag(): CollisionFlag {
        if (this.moveRestrict === MoveRestrict.NORMAL) {
            return CollisionFlag.NPC;
        } else if (this.moveRestrict === MoveRestrict.BLOCKED) {
            return CollisionFlag.OPEN;
        } else if (this.moveRestrict === MoveRestrict.BLOCKED_NORMAL) {
            return CollisionFlag.NPC;
        } else if (this.moveRestrict === MoveRestrict.INDOORS) {
            return CollisionFlag.NPC;
        } else if (this.moveRestrict === MoveRestrict.OUTDOORS) {
            return CollisionFlag.NPC;
        } else if (this.moveRestrict === MoveRestrict.NOMOVE) {
            return CollisionFlag.NULL;
        } else if (this.moveRestrict === MoveRestrict.PASSTHRU) {
            return CollisionFlag.OPEN;
        }
        return CollisionFlag.NULL;
    }

    defaultMoveSpeed(): MoveSpeed {
        return MoveSpeed.WALK;
    }

    // ----

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
            if (state === ScriptState.WORLD_SUSPENDED) {
                World.enqueueScript(script, script.popInt());
            } else if (state === ScriptState.NPC_SUSPENDED) {
                script.activeNpc.activeScript = script;
            } else {
                script.activePlayer.activeScript = script;
            }
        } else if (script === this.activeScript) {
            this.activeScript = null;
        }

        if (script.pointerGet(ScriptPointer.ProtectedActivePlayer) && script._activePlayer) {
            script._activePlayer.protect = false;
            script.pointerRemove(ScriptPointer.ProtectedActivePlayer);
        }

        if (script.pointerGet(ScriptPointer.ProtectedActivePlayer2) && script._activePlayer2) {
            script._activePlayer2.protect = false;
            script.pointerRemove(ScriptPointer.ProtectedActivePlayer2);
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
        for (let request = this.queue.head(); request !== null; request = this.queue.next()) {
            // purposely only decrements the delay when the npc is not delayed
            if (!this.delayed()) {
                request.delay--;
            }

            if (!this.delayed() && request.delay <= 0) {
                const state = ScriptRunner.init(request.script, this, null, request.args);
                this.executeScript(state);
                request.unlink();
            }
        }
    }

    enqueueScript(script: Script, delay = 0, args: ScriptArgument[] = []) {
        const request = new EntityQueueRequest(NpcQueueType.NORMAL, script, args, delay);
        this.queue.addTail(request);
    }

    randomWalk(range: number) {
        const dx = Math.round(Math.random() * (range * 2) - range);
        const dz = Math.round(Math.random() * (range * 2) - range);
        const destX = this.startX + dx;
        const destZ = this.startZ + dz;

        if (destX !== this.x || destZ !== this.z) {
            this.queueWaypoint(destX, destZ);
        }
    }

    processNpcModes() {
        if (this.targetOp === NpcMode.NULL) {
            this.defaultMode();
        } else if (this.targetOp === NpcMode.NONE) {
            this.noMode();
        } else if (this.targetOp === NpcMode.WANDER) {
            this.wanderMode();
        } else if (this.targetOp === NpcMode.PATROL) {
            this.patrolMode();
        } else if (this.targetOp === NpcMode.PLAYERESCAPE) {
            this.playerEscapeMode();
        } else if (this.targetOp === NpcMode.PLAYERFOLLOW) {
            this.playerFollowMode();
        } else if (this.targetOp === NpcMode.PLAYERFACE) {
            this.playerFaceMode();
        } else if (this.targetOp === NpcMode.PLAYERFACECLOSE) {
            this.playerFaceCloseMode();
        } else {
            this.aiMode();
        }
    }

    noMode(): void {
        this.clearInteraction();
        this.updateMovement(false);
        this.targetOp = NpcMode.NONE;
        this.faceEntity = -1;
        this.mask |= Npc.FACE_ENTITY;
    }

    defaultMode(): void {
        this.clearInteraction();
        this.updateMovement(false);
        const type: NpcType = NpcType.get(this.type);
        this.targetOp = type.defaultmode;
        this.faceEntity = -1;
        this.mask |= Npc.FACE_ENTITY;
    }

    wanderMode(): void {
        const type = NpcType.get(this.type);
        if (type.moverestrict !== MoveRestrict.NOMOVE && Math.random() < 0.125) {
            this.randomWalk(type.wanderrange);
        }
        this.updateMovement(false);
    }

    patrolMode(): void {
        const type = NpcType.get(this.type);
        const patrolPoints = type.patrolCoord;
        const patrolDelay = type.patrolDelay[this.nextPatrolPoint];
        let dest = Position.unpackCoord(patrolPoints[this.nextPatrolPoint]);

        this.updateMovement(false);
        if (!this.hasWaypoints() && !this.target) { // requeue waypoints in cases where an npc was interacting and the interaction has been cleared
            this.queueWaypoint(dest.x, dest.z);
        }
        if(!(this.x === dest.x && this.z === dest.z) && World.currentTick > this.nextPatrolTick) {
            this.teleJump(dest.x, dest.z, dest.level);
        }
        if ((this.x === dest.x && this.z === dest.z) && !this.delayedPatrol) {
            this.nextPatrolTick = World.currentTick + patrolDelay;
            this.delayedPatrol = true;
        }
        if(this.nextPatrolTick > World.currentTick) {
            return;
        }

        this.nextPatrolPoint = (this.nextPatrolPoint + 1) % patrolPoints.length;
        this.nextPatrolTick = World.currentTick + 30; // 30 ticks until we force the npc to the next patrol coord
        this.delayedPatrol = false;
        dest = Position.unpackCoord(patrolPoints[this.nextPatrolPoint]); // recalc dest
        this.queueWaypoint(dest.x, dest.z);
    }

    playerEscapeMode(): void {
        // if (!this.static) {
        //     this.noMode();
        //     World.removeNpc(this);
        //     return;
        // }
        if (!this.target) {
            return;
        }

        if (!(this.target instanceof Player)) {
            throw new Error('[Npc] Target must be a Player for playerescape mode.');
        }

        const collisionStrategy: CollisionType | null = this.getCollisionStrategy();
        if (collisionStrategy === null) {
            // nomove moverestrict returns as null = no walking allowed.
            this.defaultMode();
            return;
        }
        const extraFlag: CollisionFlag = this.blockWalkFlag();
        if (extraFlag === CollisionFlag.NULL) {
            // nomove moverestrict returns as null = no walking allowed.
            this.defaultMode();
            return;
        }
        // this might have to be a smart path idk tho
        this.queueWaypoints(rsmod.findNaivePath(this.level, this.x, this.z, this.startX, this.startZ, this.width, this.length, this.width, this.length, extraFlag, collisionStrategy));
        this.updateMovement(false);
    }

    playerFollowMode(): void {
        if (!this.target) {
            return;
        }

        if (!(this.target instanceof Player)) {
            throw new Error('[Npc] Target must be a Player for playerfollow mode.');
        }

        if (World.getPlayerByUid(this.target.uid) === null) {
            this.defaultMode();
            return;
        }

        if (this.level !== this.target.level) {
            this.defaultMode();
            return;
        }

        this.pathToTarget();
        this.updateMovement();
    }

    playerFaceMode(): void {
        if (!this.target) {
            return;
        }

        if (!(this.target instanceof Player)) {
            throw new Error('[Npc] Target must be a Player for playerface mode.');
        }

        if (World.getPlayerByUid(this.target.uid) === null) {
            this.defaultMode();
            return;
        }

        if (this.level !== this.target.level) {
            this.defaultMode();
            return;
        }

        const type = NpcType.get(this.type);

        if (Position.distanceTo(this, this.target) > type.maxrange) {
            this.defaultMode();
            return;
        }

        this.updateMovement(false);
    }

    playerFaceCloseMode(): void {
        if (!this.target) {
            return;
        }

        if (!(this.target instanceof Player)) {
            throw new Error('[Npc] Target must be a Player for playerfaceclose mode.');
        }

        if (World.getPlayerByUid(this.target.uid) == null) {
            this.defaultMode();
            return;
        }

        if (this.level !== this.target.level) {
            this.defaultMode();
            return;
        }

        if (Position.distanceTo(this, this.target) > 1) {
            this.defaultMode();
            return;
        }

        this.updateMovement(false);
    }

    aiMode(): void {
        if (this.delayed() || !this.target) {
            return;
        }

        if (this.target.level !== this.level) {
            this.defaultMode();
            return;
        }

        if (this.target instanceof Npc && (World.getNpc(this.target.nid) === null || this.target.delayed())) {
            this.defaultMode();
            return;
        }

        // this is effectively checking if the npc did a changetype
        if (this.target instanceof Npc && this.targetSubject.type !== -1 && World.getNpcByUid((this.targetSubject.type << 16) | this.target.nid) === null) {
            this.defaultMode();
            return;
        }

        if (this.target instanceof Obj && World.getObj(this.target.x, this.target.z, this.level, this.target.type) === null) {
            this.defaultMode();
            return;
        }

        if (this.target instanceof Loc && World.getLoc(this.target.x, this.target.z, this.level, this.target.type) === null) {
            this.defaultMode();
            return;
        }

        if (this.target instanceof Player && World.getPlayerByUid(this.target.uid) == null) {
            this.defaultMode();
            return;
        }

        const distanceToTarget = Position.distanceTo(this, this.target);
        const type = NpcType.get(this.type);

        if (distanceToTarget > type.maxrange) {
            this.defaultMode();
            return;
        }

        const apTrigger: boolean =
            (this.targetOp >= NpcMode.APNPC1 && this.targetOp <= NpcMode.APNPC5) ||
            (this.targetOp >= NpcMode.APPLAYER1 && this.targetOp <= NpcMode.APPLAYER5) ||
            (this.targetOp >= NpcMode.APLOC1 && this.targetOp <= NpcMode.APLOC5) ||
            (this.targetOp >= NpcMode.APOBJ1 && this.targetOp <= NpcMode.APOBJ5);
        const opTrigger: boolean = !apTrigger;

        const script: Script | null = this.getTrigger();
        if (script && opTrigger && this.inOperableDistance(this.target) && this.target instanceof PathingEntity) {
            this.executeScript(ScriptRunner.init(script, this, this.target));
            this.interacted = true;
            this.clearWaypoints();
        } else if (script && apTrigger && this.inApproachDistance(type.attackrange, this.target)) {
            this.executeScript(ScriptRunner.init(script, this, this.target));
            this.interacted = true;
            this.clearWaypoints();
        } else if (this.inOperableDistance(this.target) && this.target instanceof PathingEntity) {
            this.target = null;
            this.interacted = true;
            this.clearWaypoints();
        }

        // stand there stupidly
        if (this.target) {
            const distanceToEscape = Position.distanceTo(this, {
                x: this.startX,
                z: this.startZ,
                width: this.width,
                length: this.length
            });
            const targetDistanceFromStart = Position.distanceTo(this.target, {
                x: this.startX,
                z: this.startZ,
                width: this.target.width,
                length: this.target.length
            });
            if (targetDistanceFromStart > type.attackrange && distanceToEscape > type.attackrange) {
                return;
            }
        }

        const moved: boolean = this.updateMovement();
        if (moved) {
            this.alreadyFacedEntity = false;
            this.alreadyFacedCoord = false;
        }

        if (this.target && !this.interacted) {
            this.interacted = false;
            if (script && opTrigger && this.inOperableDistance(this.target) && (this.target instanceof PathingEntity || !moved)) {
                this.executeScript(ScriptRunner.init(script, this, this.target));
                this.interacted = true;
                this.clearWaypoints();
            } else if (script && apTrigger && this.inApproachDistance(type.attackrange, this.target)) {
                this.executeScript(ScriptRunner.init(script, this, this.target));
                this.interacted = true;
                this.clearWaypoints();
            } else if (this.inOperableDistance(this.target) && (this.target instanceof PathingEntity || !moved)) {
                this.target = null;
                this.interacted = true;
                this.clearWaypoints();
            }
        }
    }

    private getTrigger(): Script | null {
        const trigger: ServerTriggerType | null = this.getTriggerForMode(this.targetOp);
        if (trigger) {
            return ScriptProvider.getByTrigger(trigger, this.type, -1) ?? null;
        }
        return null;
    }

    private getTriggerForMode(mode: NpcMode | ServerTriggerType): ServerTriggerType | null {
        if (mode === NpcMode.OPPLAYER1) {
            return ServerTriggerType.AI_OPPLAYER1;
        } else if (mode === NpcMode.OPPLAYER2) {
            return ServerTriggerType.AI_OPPLAYER2;
        } else if (mode === NpcMode.OPPLAYER3) {
            return ServerTriggerType.AI_OPPLAYER3;
        } else if (mode === NpcMode.OPPLAYER4) {
            return ServerTriggerType.AI_OPPLAYER4;
        } else if (mode === NpcMode.OPPLAYER5) {
            return ServerTriggerType.AI_OPPLAYER5;
        } else if (mode === NpcMode.APPLAYER1) {
            return ServerTriggerType.AI_APPLAYER1;
        } else if (mode === NpcMode.APPLAYER2) {
            return ServerTriggerType.AI_APPLAYER2;
        } else if (mode === NpcMode.APPLAYER3) {
            return ServerTriggerType.AI_APPLAYER3;
        } else if (mode === NpcMode.APPLAYER4) {
            return ServerTriggerType.AI_APPLAYER4;
        } else if (mode === NpcMode.APPLAYER5) {
            return ServerTriggerType.AI_APPLAYER5;
        } else if (mode === NpcMode.OPLOC1) {
            return ServerTriggerType.AI_OPLOC1;
        } else if (mode === NpcMode.OPLOC2) {
            return ServerTriggerType.AI_OPLOC2;
        } else if (mode === NpcMode.OPLOC3) {
            return ServerTriggerType.AI_OPLOC3;
        } else if (mode === NpcMode.OPLOC4) {
            return ServerTriggerType.AI_OPLOC4;
        } else if (mode === NpcMode.OPLOC5) {
            return ServerTriggerType.AI_OPLOC5;
        } else if (mode === NpcMode.APLOC1) {
            return ServerTriggerType.AI_APLOC1;
        } else if (mode === NpcMode.APLOC2) {
            return ServerTriggerType.AI_APLOC2;
        } else if (mode === NpcMode.APLOC3) {
            return ServerTriggerType.AI_APLOC3;
        } else if (mode === NpcMode.APLOC4) {
            return ServerTriggerType.AI_APLOC4;
        } else if (mode === NpcMode.APLOC5) {
            return ServerTriggerType.AI_APLOC5;
        } else if (mode === NpcMode.OPOBJ1) {
            return ServerTriggerType.AI_OPOBJ1;
        } else if (mode === NpcMode.OPOBJ2) {
            return ServerTriggerType.AI_OPOBJ2;
        } else if (mode === NpcMode.OPOBJ3) {
            return ServerTriggerType.AI_OPOBJ3;
        } else if (mode === NpcMode.OPOBJ4) {
            return ServerTriggerType.AI_OPOBJ4;
        } else if (mode === NpcMode.OPOBJ5) {
            return ServerTriggerType.AI_OPOBJ5;
        } else if (mode === NpcMode.APOBJ1) {
            return ServerTriggerType.AI_APOBJ1;
        } else if (mode === NpcMode.APOBJ2) {
            return ServerTriggerType.AI_APOBJ2;
        } else if (mode === NpcMode.APOBJ3) {
            return ServerTriggerType.AI_APOBJ3;
        } else if (mode === NpcMode.APOBJ4) {
            return ServerTriggerType.AI_APOBJ4;
        } else if (mode === NpcMode.APOBJ5) {
            return ServerTriggerType.AI_APOBJ5;
        } else if (mode === NpcMode.OPNPC1) {
            return ServerTriggerType.AI_OPNPC1;
        } else if (mode === NpcMode.OPNPC2) {
            return ServerTriggerType.AI_OPNPC2;
        } else if (mode === NpcMode.OPNPC3) {
            return ServerTriggerType.AI_OPNPC3;
        } else if (mode === NpcMode.OPNPC4) {
            return ServerTriggerType.AI_OPNPC4;
        } else if (mode === NpcMode.OPNPC5) {
            return ServerTriggerType.AI_OPNPC5;
        } else if (mode === NpcMode.APNPC1) {
            return ServerTriggerType.AI_APNPC1;
        } else if (mode === NpcMode.APNPC2) {
            return ServerTriggerType.AI_APNPC2;
        } else if (mode === NpcMode.APNPC3) {
            return ServerTriggerType.AI_APNPC3;
        } else if (mode === NpcMode.APNPC4) {
            return ServerTriggerType.AI_APNPC4;
        } else if (mode === NpcMode.APNPC5) {
            return ServerTriggerType.AI_APNPC5;
        } else if (mode === NpcMode.QUEUE1) {
            return ServerTriggerType.AI_QUEUE1;
        } else if (mode === NpcMode.QUEUE2) {
            return ServerTriggerType.AI_QUEUE2;
        } else if (mode === NpcMode.QUEUE3) {
            return ServerTriggerType.AI_QUEUE3;
        } else if (mode === NpcMode.QUEUE4) {
            return ServerTriggerType.AI_QUEUE4;
        } else if (mode === NpcMode.QUEUE5) {
            return ServerTriggerType.AI_QUEUE5;
        } else if (mode === NpcMode.QUEUE6) {
            return ServerTriggerType.AI_QUEUE6;
        } else if (mode === NpcMode.QUEUE7) {
            return ServerTriggerType.AI_QUEUE7;
        } else if (mode === NpcMode.QUEUE8) {
            return ServerTriggerType.AI_QUEUE8;
        } else if (mode === NpcMode.QUEUE9) {
            return ServerTriggerType.AI_QUEUE9;
        } else if (mode === NpcMode.QUEUE10) {
            return ServerTriggerType.AI_QUEUE10;
        } else if (mode === NpcMode.QUEUE11) {
            return ServerTriggerType.AI_QUEUE11;
        } else if (mode === NpcMode.QUEUE12) {
            return ServerTriggerType.AI_QUEUE12;
        } else if (mode === NpcMode.QUEUE13) {
            return ServerTriggerType.AI_QUEUE13;
        } else if (mode === NpcMode.QUEUE14) {
            return ServerTriggerType.AI_QUEUE14;
        } else if (mode === NpcMode.QUEUE15) {
            return ServerTriggerType.AI_QUEUE15;
        } else if (mode === NpcMode.QUEUE16) {
            return ServerTriggerType.AI_QUEUE16;
        } else if (mode === NpcMode.QUEUE17) {
            return ServerTriggerType.AI_QUEUE17;
        } else if (mode === NpcMode.QUEUE18) {
            return ServerTriggerType.AI_QUEUE18;
        } else if (mode === NpcMode.QUEUE19) {
            return ServerTriggerType.AI_QUEUE19;
        } else if (mode === NpcMode.QUEUE20) {
            return ServerTriggerType.AI_QUEUE20;
        }
        return null;
    }

    huntAll() {
        const type = NpcType.get(this.type);
        const hunt = HuntType.get(this.huntMode);
        if (hunt.type === HuntModeType.OFF) {
            return;
        }
        if (!hunt.findKeepHunting && this.target !== null) {
            return;
        }

        if (this.nextHuntTick > World.currentTick) {
            return;
        }

        const hunted: Entity[] = [];
        const huntAll: HuntIterator = new HuntIterator(World.currentTick, this.level, this.x, this.z, this.huntrange, hunt.checkVis, hunt.type);

        if (hunt.type === HuntModeType.PLAYER) {
            for (const player of huntAll) {
                if (!(player instanceof Player)) {
                    throw new Error('[Npc] huntAll must be of type Player here.');
                }

                // TODO: probably zone check to see if they're in the wilderness as well?
                if (hunt.checkNotTooStrong === HuntCheckNotTooStrong.OUTSIDE_WILDERNESS && player.combatLevel > type.vislevel * 2) {
                    continue;
                }

                if (hunt.checkNotCombat !== -1 && (player.getVar(hunt.checkNotCombat) as number) + 8 > World.currentTick) {
                    continue;
                } else if (hunt.checkNotCombatSelf !== -1 && (this.getVar(hunt.checkNotCombatSelf) as number) >= World.currentTick) {
                    continue;
                }

                if (hunt.checkNotBusy && player.busy()) {
                    continue;
                }

                hunted.push(player);
            }
        } else {
            for (const entity of huntAll) {
                // npc, loc and obj here.
                hunted.push(entity);
            }
        }

        // pick randomly from the hunted entities
        if (hunted.length > 0) {
            const entity: Entity = hunted[Math.floor(Math.random() * hunted.length)];
            this.setInteraction(Interaction.SCRIPT, entity, hunt.findNewMode);
        }
        this.nextHuntTick = World.currentTick + hunt.rate;
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

        const current = this.levels[NpcStat.HITPOINTS];
        if (current - damage <= 0) {
            this.levels[NpcStat.HITPOINTS] = 0;
            this.damageTaken = current;
        } else {
            this.levels[NpcStat.HITPOINTS] = current - damage;
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

    changeType(type: number) {
        this.type = type;
        this.mask |= Npc.CHANGE_TYPE;
        this.uid = (type << 16) | this.nid;
    }

    calculateUpdateSize(newlyObserved: boolean) {
        let length = 0;
        let mask = this.mask;
        if (newlyObserved && (this.orientation !== -1 || this.faceX !== -1 || this.faceZ != -1)) {
            mask |= Npc.FACE_COORD;
        }
        if (newlyObserved && this.faceEntity !== -1) {
            mask |= Npc.FACE_ENTITY;
        }
        length += 1;

        if (mask & Npc.ANIM) {
            length += 3;
        }

        if (mask & Npc.FACE_ENTITY) {
            length += 2;
        }

        if (mask & Npc.SAY) {
            length += this.chat?.length ?? 0;
        }

        if (mask & Npc.DAMAGE) {
            length += 4;
        }

        if (mask & Npc.CHANGE_TYPE) {
            length += 2;
        }

        if (mask & Npc.SPOTANIM) {
            length += 6;
        }

        if (mask & Npc.FACE_COORD) {
            length += 4;
        }

        return length;
    }

    writeUpdate(out: Packet, newlyObserved: boolean) {
        let mask = this.mask;
        if (newlyObserved && (this.orientation !== -1 || this.faceX !== -1 || this.faceZ != -1)) {
            mask |= Npc.FACE_COORD;
        }
        if (newlyObserved && this.faceEntity !== -1) {
            mask |= Npc.FACE_ENTITY;
        }
        out.p1(mask);

        if (mask & Npc.ANIM) {
            out.p2(this.animId);
            out.p1(this.animDelay);
        }

        if (mask & Npc.FACE_ENTITY) {
            if (this.faceEntity !== -1) {
                this.alreadyFacedEntity = true;
            }

            out.p2(this.faceEntity);
        }

        if (mask & Npc.SAY) {
            out.pjstr(this.chat);
        }

        if (mask & Npc.DAMAGE) {
            out.p1(this.damageTaken);
            out.p1(this.damageType);
            out.p1(this.levels[NpcStat.HITPOINTS]);
            out.p1(this.baseLevels[NpcStat.HITPOINTS]);
        }

        if (mask & Npc.CHANGE_TYPE) {
            out.p2(this.type);
        }

        if (mask & Npc.SPOTANIM) {
            out.p2(this.graphicId);
            out.p2(this.graphicHeight);
            out.p2(this.graphicDelay);
        }

        if (mask & Npc.FACE_COORD) {
            if (this.faceX !== -1) {
                this.alreadyFacedCoord = true;
            }

            if (newlyObserved && this.faceX != -1) {
                out.p2(this.faceX);
                out.p2(this.faceZ);
            } else if (newlyObserved && this.orientation != -1) {
                const faceX = Position.moveX(this.x, this.orientation);
                const faceZ = Position.moveZ(this.z, this.orientation);
                out.p2(faceX * 2 + 1);
                out.p2(faceZ * 2 + 1);
            } else {
                out.p2(this.faceX);
                out.p2(this.faceZ);
            }
        }
    }
}
