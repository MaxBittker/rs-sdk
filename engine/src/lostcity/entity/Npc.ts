import NpcType from '#lostcity/cache/config/NpcType.js';
import VarNpcType from '#lostcity/cache/config/VarNpcType.js';
import HuntType from '#lostcity/cache/config/HuntType.js';
import ScriptVarType from '#lostcity/cache/config/ScriptVarType.js';
import SeqType from '#lostcity/cache/config/SeqType.js';

import World from '#lostcity/engine/World.js';
import {Direction, CoordGrid} from '#lostcity/engine/CoordGrid.js';

import ScriptFile from '#lostcity/engine/script/ScriptFile.js';
import ScriptPointer from '#lostcity/engine/script/ScriptPointer.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import ScriptRunner from '#lostcity/engine/script/ScriptRunner.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';
import {HuntIterator} from '#lostcity/engine/script/ScriptIterators.js';

import BlockWalk from '#lostcity/entity/BlockWalk.js';
import {EntityQueueRequest, NpcQueueType} from '#lostcity/entity/EntityQueueRequest.js';
import Loc from '#lostcity/entity/Loc.js';
import MoveRestrict from '#lostcity/entity/MoveRestrict.js';
import NpcMode from '#lostcity/entity/NpcMode.js';
import Obj from '#lostcity/entity/Obj.js';
import PathingEntity from '#lostcity/entity/PathingEntity.js';
import Player from '#lostcity/entity/Player.js';
import MoveStrategy from '#lostcity/entity/MoveStrategy.js';
import HuntModeType from '#lostcity/entity/hunt/HuntModeType.js';
import HuntCheckNotTooStrong from '#lostcity/entity/hunt/HuntCheckNotTooStrong.js';
import MoveSpeed from '#lostcity/entity/MoveSpeed.js';
import Entity from '#lostcity/entity/Entity.js';
import Interaction from '#lostcity/entity/Interaction.js';
import EntityLifeCycle from '#lostcity/entity/EntityLifeCycle.js';
import NpcStat from '#lostcity/entity/NpcStat.js';
import HuntNobodyNear from '#lostcity/entity/hunt/HuntNobodyNear.js';

import LinkList from '#jagex2/datastruct/LinkList.js';

import {CollisionFlag} from '@2004scape/rsmod-pathfinder';
import {isFlagged} from '#lostcity/engine/GameMap.js';
import InfoProt from '#lostcity/network/225/outgoing/prot/InfoProt.js';

export default class Npc extends PathingEntity {
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
    regenClock: number = 0;
    huntMode: number = -1;
    nextHuntTick: number = -1;
    huntTarget: Entity | null = null;
    huntrange: number = 0;

    nextPatrolTick: number = -1;
    nextPatrolPoint : number = 0;
    delayedPatrol : boolean = false;

    heroPoints: {
        uid: number;
        points: number;
    }[] = new Array(16); // be sure to reset when stats are recovered/reset

    constructor(level: number, x: number, z: number, width: number, length: number, lifecycle: EntityLifeCycle, nid: number, type: number, moveRestrict: MoveRestrict, blockWalk: BlockWalk) {
        super(level, x, z, width, length, lifecycle, moveRestrict, blockWalk, MoveStrategy.NAIVE, InfoProt.NPC_FACE_COORD.id, InfoProt.NPC_FACE_ENTITY.id);
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

        this.setTimer(npcType.timer);

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
            this.faceX = -1;
            this.faceZ = -1;
            this.orientationX = -1;
            this.orientationZ = -1;
            this.playAnimation(-1, 0); // reset animation or last anim has a chance to appear on respawn
            for (let index = 0; index < this.baseLevels.length; index++) {
                this.levels[index] = this.baseLevels[index];
            }
            this.resetHeroPoints();
            this.queue.clear();
            this.defaultMode();

            const npcType: NpcType = NpcType.get(this.type);
            this.huntrange = npcType.huntrange;
            const hunt = HuntType.get(this.huntMode);
            if (hunt) {
                this.nextHuntTick = World.currentTick + hunt.rate;
            }
        }
        super.resetPathingEntity();
    }

    updateMovement(repathAllowed: boolean = true): boolean {
        const type = NpcType.get(this.type);
        if (!this.targetWithinMaxRange()) {
            this.defaultMode();
            return false;
        }
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

        if (!super.processMovement()) {
            // nothing
        }

        const moved = this.lastTickX !== this.x || this.lastTickZ !== this.z;
        if (moved) {
            this.lastMovement = World.currentTick + 1;
        }
        return moved;
    }

    clearInteraction() {
        super.clearInteraction();
        this.huntTarget = null;
    }

    pathToTarget(): void {
        if (!this.targetWithinMaxRange()) {
            this.defaultMode();
            return;
        }
        super.pathToTarget();
    }

    targetWithinMaxRange(): boolean {
        if (!this.target) {
            return true;
        }
        if (this.targetOp === NpcMode.PLAYERFOLLOW) {
            return true;
        }
        const type = NpcType.get(this.type);

        const apTrigger: boolean =
        (this.targetOp >= NpcMode.APNPC1 && this.targetOp <= NpcMode.APNPC5) ||
        (this.targetOp >= NpcMode.APPLAYER1 && this.targetOp <= NpcMode.APPLAYER5) ||
        (this.targetOp >= NpcMode.APLOC1 && this.targetOp <= NpcMode.APLOC5) ||
        (this.targetOp >= NpcMode.APOBJ1 && this.targetOp <= NpcMode.APOBJ5);
        const opTrigger: boolean = !apTrigger;
        if (opTrigger) {
            const distanceToX = Math.abs(this.target.x - this.startX);
            const distanceToZ = Math.abs(this.target.z - this.startZ);
            if (Math.max(distanceToX, distanceToZ) > type.maxrange + 1) {
                return false;
            }
            // remove corner
            if (distanceToX === type.maxrange + 1 && distanceToZ === type.maxrange + 1) {
                return false; 
            }
        } else if (apTrigger) {
            if (CoordGrid.distanceToSW(this.target, {x: this.startX, z: this.startZ}) > type.maxrange + type.attackrange) {
                return false; 
            }
        } else if (this.targetOp === NpcMode.PLAYERESCAPE) {
            const distanceToEscape = CoordGrid.distanceTo(this, {
                x: this.startX,
                z: this.startZ,
                width: this.width,
                length: this.length
            });
            const targetDistanceFromStart = CoordGrid.distanceTo(this.target, {
                x: this.startX,
                z: this.startZ,
                width: this.target.width,
                length: this.target.length
            });

            if (targetDistanceFromStart > type.maxrange && distanceToEscape > type.maxrange) {
                return false;
            }
        } else if (CoordGrid.distanceToSW(this.target, {x: this.startX, z: this.startZ}) > type.maxrange) {
            return false;
        }
        return true;
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
        if (interval !== -1) {
            this.timerInterval = interval;
            this.timerClock = 0;
        }
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

    processRegen() {
        const type = NpcType.get(this.type);
        if (type.regenRate !== 0 && ++this.regenClock >= type.regenRate) {
            this.regenClock = 0;

            for (let index = 0; index < this.baseLevels.length; index++) {
                const stat = this.levels[index];
                const baseStat = this.baseLevels[index];
                if (stat < baseStat) {
                    this.levels[index]++;
                } else if (stat > baseStat) {
                    this.levels[index]--;
                }
            }

        }
    }

    processTimers() {
        if (this.timerInterval !== 0 && this.timerClock >= this.timerInterval) {
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
                request.unlink();

                const state = ScriptRunner.init(request.script, this, null, request.args);
                state.lastInt = request.lastInt;
                const save = this.queue.cursor; // LinkList-specific behavior so we can getqueue/clearqueue inside of this
                this.executeScript(state);
                this.queue.cursor = save;
            }
        }
    }

    enqueueScript(script: ScriptFile, delay = 0, arg: number = 0) {
        const request = new EntityQueueRequest(NpcQueueType.NORMAL, script, [], delay);
        request.lastInt = arg;
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
        this.masks |= InfoProt.NPC_FACE_ENTITY.id;
    }

    defaultMode(): void {
        this.clearInteraction();
        this.updateMovement(false);
        const type: NpcType = NpcType.get(this.type);
        this.targetOp = type.defaultmode;
        this.faceEntity = -1;
        this.masks |= InfoProt.NPC_FACE_ENTITY.id;
    }

    wanderMode(): void {
        const type = NpcType.get(this.type);
        if (type.moverestrict !== MoveRestrict.NOMOVE && Math.random() < 0.125) {
            // 1/8 chance to move every tick (even if they already have a destination)
            this.randomWalk(type.wanderrange);
        }
        this.updateMovement(false);
    }

    patrolMode(): void {
        const type = NpcType.get(this.type);
        const patrolPoints = type.patrolCoord;
        const patrolDelay = type.patrolDelay[this.nextPatrolPoint];
        let dest = CoordGrid.unpackCoord(patrolPoints[this.nextPatrolPoint]);

        this.updateMovement(false);
        if (!this.hasWaypoints() && !this.target) { // requeue waypoints in cases where an npc was interacting and the interaction has been cleared
            this.queueWaypoint(dest.x, dest.z);
        }
        if(!(this.x === dest.x && this.z === dest.z) && World.currentTick >= this.nextPatrolTick) {
            this.teleport(dest.x, dest.z, dest.level);
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
        dest = CoordGrid.unpackCoord(patrolPoints[this.nextPatrolPoint]); // recalc dest
        this.queueWaypoint(dest.x, dest.z);
    }

    playerEscapeMode(): void {
        if (!this.target) {
            this.defaultMode();
            return;
        }

        if (!(this.target instanceof Player)) {
            throw new Error('[Npc] Target must be a Player for playerescape mode.');
        }

        if (World.getPlayerByUid(this.target.uid) === null) {
            this.defaultMode();
            return;
        }

        if (CoordGrid.distanceToSW(this, this.target) > 25) {
            this.defaultMode();
            return;
        }

        let direction: number;
        let flags: number;
        if (this.target.x >= this.x && this.target.z >= this.z) {
            direction = Direction.SOUTH_WEST;
            flags = CollisionFlag.WALL_SOUTH | CollisionFlag.WALL_WEST;
        } else if (this.target.x >= this.x && this.target.z < this.z) {
            direction = Direction.NORTH_WEST;
            flags = CollisionFlag.WALL_NORTH | CollisionFlag.WALL_WEST;
        } else if (this.target.x < this.x && this.target.z >= this.z) {
            direction = Direction.SOUTH_EAST;
            flags = CollisionFlag.WALL_SOUTH | CollisionFlag.WALL_EAST;
        } else {
            direction = Direction.NORTH_EAST;
            flags = CollisionFlag.WALL_NORTH | CollisionFlag.WALL_EAST;
        }

        const mx: number = CoordGrid.moveX(this.x, direction);
        const mz: number = CoordGrid.moveZ(this.z, direction);

        if (isFlagged(mx, mz, this.level, flags)) {
            this.defaultMode();
            return;
        }

        const coord: CoordGrid = {x: mx, z: mz, level: this.level};
        if (CoordGrid.distanceToSW(coord, {
            x: this.startX,
            z: this.startZ
        }) < NpcType.get(this.type).maxrange) {
            this.queueWaypoint(coord.x, coord.z);
            this.updateMovement(false);
            return;
        }

        // walk along other axis.
        if (direction === Direction.NORTH_EAST || direction === Direction.NORTH_WEST) {
            this.queueWaypoint(this.x, coord.z);
        } else {
            this.queueWaypoint(coord.x, this.z);
        }
        this.updateMovement(false);
    }

    playerFollowMode(): void {
        const player = this.target;
        if (!player) {
            this.defaultMode();
            return;
        }

        if (!(player instanceof Player)) {
            throw new Error('[Npc] Target must be a Player for playerfollow mode.');
        }
        if (World.getPlayerByUid(player.uid) === null) {
            this.defaultMode();
            return;
        }
        if (player.level !== this.level || !CoordGrid.isWithinDistanceSW(this, player, 15)) {
            this.teleport(player.x, player.z, player.level);
            this.startX = player.x;
            this.startZ = player.z;
        }

        this.pathToTarget();
        this.updateMovement();
    }

    playerFaceMode(): void {
        if (!this.target) {
            this.defaultMode();
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
            this.clearWaypoints();
            this.defaultMode();
            return;
        }

        const type = NpcType.get(this.type);

        if (CoordGrid.distanceTo(this, this.target) > type.maxrange) {
            this.defaultMode();
            return;
        }
        this.clearWaypoints();
        this.updateMovement(false);
    }

    playerFaceCloseMode(): void {
        if (!this.target) {
            this.defaultMode();
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
            this.clearWaypoints();
            this.defaultMode();
            return;
        }

        if (CoordGrid.distanceTo(this, this.target) > 1) {
            this.defaultMode();
            return;
        }
        this.clearWaypoints();
        this.updateMovement(false);
    }

    aiMode(): void {
        if (this.delayed() || !this.target) {
            this.defaultMode();
            return;
        }

        if (this.target.level !== this.level) {
            this.defaultMode();
            return;
        }

        if (this.target instanceof Npc && (typeof World.getNpc(this.target.nid) === 'undefined' || this.target.delayed())) {
            this.defaultMode();
            return;
        }

        // this is effectively checking if the npc did a changetype
        if (this.target instanceof Npc && this.targetSubject.type !== -1 && World.getNpcByUid((this.targetSubject.type << 16) | this.target.nid) === null) {
            this.defaultMode();
            return;
        }

        if (this.target instanceof Obj && World.getObj(this.target.x, this.target.z, this.level, this.target.type, -1) === null) {
            this.defaultMode();
            return;
        }

        if (this.target instanceof Loc && World.getLoc(this.target.x, this.target.z, this.level, this.target.type) === null) {
            this.defaultMode();
            return;
        }

        if (this.target instanceof Player && World.getPlayerByUid(this.target.uid) === null) {
            this.defaultMode();
            return;
        }
        const type: NpcType = NpcType.get(this.type);
        const apTrigger: boolean =
            (this.targetOp >= NpcMode.APNPC1 && this.targetOp <= NpcMode.APNPC5) ||
            (this.targetOp >= NpcMode.APPLAYER1 && this.targetOp <= NpcMode.APPLAYER5) ||
            (this.targetOp >= NpcMode.APLOC1 && this.targetOp <= NpcMode.APLOC5) ||
            (this.targetOp >= NpcMode.APOBJ1 && this.targetOp <= NpcMode.APOBJ5);
        const opTrigger: boolean = !apTrigger;

        const script: ScriptFile | null = this.getTrigger();
        if (script && opTrigger && this.inOperableDistance(this.target) && this.target instanceof PathingEntity) {
            this.interacted = true;
            this.clearWaypoints();
            this.executeScript(ScriptRunner.init(script, this, this.target));
            return;
        }
        if (script && apTrigger && this.inApproachDistance(type.attackrange, this.target)) {
            this.interacted = true;
            this.clearWaypoints();
            this.executeScript(ScriptRunner.init(script, this, this.target));
            return;
        }
        if (this.inOperableDistance(this.target) && this.target instanceof PathingEntity) {
            this.target = null;
            this.interacted = true;
            this.clearWaypoints();
            return;
        }

        const moved: boolean = this.updateMovement();
        if (moved) {
            if (!type.givechase) {
                this.defaultMode();
                return;
            }
        }

        if (this.target && !this.interacted) {
            this.interacted = false;
            if (script && opTrigger && this.inOperableDistance(this.target) && (this.target instanceof PathingEntity || !moved)) {
                this.interacted = true;
                this.clearWaypoints();
                this.executeScript(ScriptRunner.init(script, this, this.target));
            } else if (script && apTrigger && this.inApproachDistance(type.attackrange, this.target)) {
                this.interacted = true;
                this.clearWaypoints();
                this.executeScript(ScriptRunner.init(script, this, this.target));
            } else if (this.inOperableDistance(this.target) && (this.target instanceof PathingEntity || !moved)) {
                this.target = null;
                this.interacted = true;
                this.clearWaypoints();
            }
        }
    }

    private getTrigger(): ScriptFile | null {
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

    // https://x.com/JagexAsh/status/1821236327150710829
    // https://x.com/JagexAsh/status/1799793914595131463
    huntAll(): void {
        if (this.nextHuntTick > World.currentTick) {
            return;
        }
        if (this.huntrange < 1) {
            return;
        }
        const hunt: HuntType = HuntType.get(this.huntMode);
        if (hunt.type === HuntModeType.OFF) {
            return;
        }
        if (hunt.nobodyNear === HuntNobodyNear.PAUSEHUNT && !World.gameMap.getZoneGrid(this.level).isFlagged(CoordGrid.zone(this.x), CoordGrid.zone(this.z), 5)) {
            return;
        }
        // in osrs, and in this 2005: https://youtu.be/8AFed6tyOp8?t=231
        // once an npc finds a huntTarget, it will no longer hunt until it's interactions are cleared
        if (!hunt.findKeepHunting && this.huntTarget !== null) {
            return;
        }

        let hunted: Entity[];
        if (hunt.type === HuntModeType.PLAYER) {
            hunted = this.huntPlayers(hunt);
        } else if (hunt.type === HuntModeType.NPC) {
            hunted = this.huntNpcs(hunt);
        } else if (hunt.type === HuntModeType.OBJ) {
            hunted = this.huntObjs(hunt);
        } else {
            hunted = this.huntLocs(hunt);
        }

        // pick randomly from the hunted entities
        if (hunted.length > 0) {
            const entity: Entity = hunted[Math.floor(Math.random() * hunted.length)];
            this.huntTarget = entity;
            if (NpcMode.QUEUE1 <= hunt.findNewMode && hunt.findNewMode <= NpcMode.QUEUE20) {
                const npcType = NpcType.get(this.type);
                const script = ScriptProvider.getByTrigger(ServerTriggerType.AI_QUEUE1 + (hunt.findNewMode - NpcMode.QUEUE1), npcType.id, npcType.category);
                if (script) {
                    this.enqueueScript(script, 0, 0);
                }
            } else {
                this.setInteraction(Interaction.SCRIPT, entity, hunt.findNewMode);
            }
        }
        this.nextHuntTick = World.currentTick + hunt.rate;
    }

    private huntPlayers(hunt: HuntType): Entity[] {
        const type: NpcType = NpcType.get(this.type);
        const players: Entity[] = [];
        const hunted: HuntIterator = new HuntIterator(World.currentTick, this.level, this.x, this.z, this.huntrange, hunt.checkVis, -1, -1, HuntModeType.PLAYER);

        for (const player of hunted) {
            if (!(player instanceof Player)) {
                throw new Error('[Npc] huntAll must be of type Player here.');
            }
            if (hunt.checkNotBusy && player.busy()) {
                continue;
            }

            if (hunt.checkAfk && player.zonesAfk()) {
                continue;
            }

            if (hunt.checkNotTooStrong === HuntCheckNotTooStrong.OUTSIDE_WILDERNESS && !player.isInWilderness() && player.combatLevel > type.vislevel * 2) {
                continue;
            }
            if (this.target !== player && !World.gameMap.isMulti(CoordGrid.packCoord(player.level, player.x, player.z))) {
                if (hunt.checkNotCombat !== -1 && (player.getVar(hunt.checkNotCombat) as number) + 8 > World.currentTick) {
                    continue;
                }
                if (hunt.checkNotCombatSelf !== -1 && (this.getVar(hunt.checkNotCombatSelf) as number) + 8 > World.currentTick) {
                    continue;
                }
            }
            if (hunt.checkVars && !hunt.checkVars.every(checkVar => {
                return checkVar.varId === -1 || hunt.checkHuntCondition(player.getVar(checkVar.varId) as number, checkVar.condition, checkVar.val);
            })) {
                continue;
            }
            
            if (hunt.checkInv !== -1) {
                let quantity: number = 0;
                if (hunt.checkObj !== -1) {
                    quantity = player.invTotal(hunt.checkInv, hunt.checkObj);
                } else if (hunt.checkObjParam !== -1) {
                    quantity = player.invTotalParam(hunt.checkInv, hunt.checkObjParam);
                }
                if (!hunt.checkHuntCondition(quantity, hunt.checkInvCondition, hunt.checkInvVal)) {
                    continue;
                }
            }
            players.push(player);
        }
        return players;
    }

    private huntNpcs(hunt: HuntType): Entity[] {
        return Array.from(new HuntIterator(World.currentTick, this.level, this.x, this.z, this.huntrange, hunt.checkVis, hunt.checkNpc, hunt.checkCategory, HuntModeType.NPC));
    }

    private huntObjs(hunt: HuntType): Entity[] {
        return Array.from(new HuntIterator(World.currentTick, this.level, this.x, this.z, this.huntrange, hunt.checkVis, hunt.checkObj, hunt.checkCategory, HuntModeType.OBJ));
    }

    private huntLocs(hunt: HuntType): Entity[] {
        return Array.from(new HuntIterator(World.currentTick, this.level, this.x, this.z, this.huntrange, hunt.checkVis, hunt.checkLoc, hunt.checkCategory, HuntModeType.SCENERY));
    }

    // ----

    playAnimation(anim: number, delay: number) {
        if (anim >= SeqType.count) {
            return;
        }

        if (anim == -1 || this.animId == -1 || SeqType.get(anim).priority > SeqType.get(this.animId).priority || SeqType.get(this.animId).priority === 0) {
            this.animId = anim;
            this.animDelay = delay;
            this.masks |= InfoProt.NPC_ANIM.id;
        }
    }

    spotanim(spotanim: number, height: number, delay: number) {
        this.graphicId = spotanim;
        this.graphicHeight = height;
        this.graphicDelay = delay;
        this.masks |= InfoProt.NPC_SPOTANIM.id;
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

        this.masks |= InfoProt.NPC_DAMAGE.id;
    }

    say(text: string) {
        if (!text) {
            return;
        }

        this.chat = text;
        this.masks |= InfoProt.NPC_SAY.id;
    }

    faceSquare(x: number, z: number) {
        this.faceX = x * 2 + 1;
        this.faceZ = z * 2 + 1;
        this.orientationX = this.faceX;
        this.orientationZ = this.faceZ;
        this.masks |= InfoProt.NPC_FACE_COORD.id;
    }

    changeType(type: number) {
        this.type = type;
        this.masks |= InfoProt.NPC_CHANGE_TYPE.id;
        this.uid = (type << 16) | this.nid;

        const npcType: NpcType = NpcType.get(type);
        this.setTimer(npcType.timer);
    }
}
