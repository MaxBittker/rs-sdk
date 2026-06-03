import { NpcInfoProt } from '#/network/rsbuf/index.js';
import * as rsbuf from '#/network/rsbuf/index.js';
import { CollisionFlag, CollisionType } from '#/engine/routefinder/index.js';

import HuntType from '#/cache/config/HuntType.js';
import NpcType from '#/cache/config/NpcType.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import SeqType from '#/cache/config/SeqType.js';
import VarNpcType from '#/cache/config/VarNpcType.js';
import { Direction, CoordGrid } from '#/engine/CoordGrid.js';
import { BlockWalk } from '#/engine/entity/BlockWalk.js';
import Entity from '#/engine/entity/Entity.js';
import { EntityLifeCycle } from '#/engine/entity/EntityLifeCycle.js';
import HeroPoints from '#/engine/entity/HeroPoints.js';
import { HuntCheckNotTooStrong } from '#/engine/entity/hunt/HuntCheckNotTooStrong.js';
import { HuntModeType } from '#/engine/entity/hunt/HuntModeType.js';
import { HuntNobodyNear } from '#/engine/entity/hunt/HuntNobodyNear.js';
import { Interaction } from '#/engine/entity/Interaction.js';
import Loc from '#/engine/entity/Loc.js';
import { MoveRestrict } from '#/engine/entity/MoveRestrict.js';
import { MoveSpeed } from '#/engine/entity/MoveSpeed.js';
import { MoveStrategy } from '#/engine/entity/MoveStrategy.js';
import { NpcEventRequest, NpcEventType } from '#/engine/entity/NpcEventRequest.js';
import { NpcMode } from '#/engine/entity/NpcMode.js';
import { NpcQueueRequest } from '#/engine/entity/NpcQueueRequest.js';
import { NpcStat } from '#/engine/entity/NpcStat.js';
import PathingEntity from '#/engine/entity/PathingEntity.js';
import Player from '#/engine/entity/Player.js';
import { canTravel } from '#/engine/GameMap.js';
import ScriptFile from '#/engine/script/ScriptFile.js';
import { HuntIterator } from '#/engine/script/ScriptIterators.js';
import ScriptPointer from '#/engine/script/ScriptPointer.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';
import ScriptState from '#/engine/script/ScriptState.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import World from '#/engine/World.js';
import LinkList from '#/datastruct/LinkList.js';
import { printError } from '#/util/Logger.js';

export default class Npc extends PathingEntity {
    // constructor properties
    nid: number;
    uid: number;
    baseType: number;
    type: number;
    startX: number;
    startZ: number;
    startLevel: number;
    levels: Uint16Array = new Uint16Array(6);
    baseLevels: Uint16Array = new Uint16Array(6);

    // runtime variables
    readonly vars: Int32Array;
    readonly varsString: (string | undefined)[];

    // script variables
    activeScript: ScriptState | null = null;
    queue: LinkList<NpcQueueRequest> = new LinkList();
    timerInterval: number = 0;
    timerClock: number = 0;
    regenInterval: number = 0;
    regenClock: number = 0;
    huntClock: number = 0;
    huntMode: number = -1;
    huntTarget: Entity | null = null;
    huntrange: number = 0;

    nextPatrolPoint: number = 0;
    patrolDelayTicksRemaining: number = -1;
    resetOnRevert: boolean = true;

    stuckCounter: number = 0;

    heroPoints: HeroPoints = new HeroPoints(16); // be sure to reset when stats are recovered/reset

    constructor(level: number, x: number, z: number, width: number, length: number, lifecycle: EntityLifeCycle, nid: number, type: number, blockWalk: BlockWalk) {
        super(level, x, z, width, length, lifecycle, blockWalk, MoveStrategy.NAIVE, NpcInfoProt.FACE_COORD, NpcInfoProt.FACE_ENTITY);
        this.nid = nid;
        this.baseType = type;
        this.type = type;
        this.uid = (type << 16) | nid;
        this.startX = this.x;
        this.startZ = this.z;
        this.startLevel = this.level;

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
        this.stuckCounter = 0;
    }

    // ---
    // Public methods
    // ---

    turn(): void {
        // Continue npc_delay'd script
        if (this.isActive) {
            if (this.delayed && World.currentTick >= this.delayedUntil) this.delayed = false;

            // Resume suspended script
            if (!this.delayed && this.activeScript && this.activeScript.execution === ScriptState.NPC_SUSPENDED) {
                this.executeScript(this.activeScript);
            }
        }

        // Npc Events (Respawn, Revert, Despawn)
        if (!this.delayed && --this.lifecycleTick === 0) {
            try {
                if (this.lifecycle === EntityLifeCycle.RESPAWN) {
                    // Respawn NPC (npc_del)
                    if (!this.isActive) {
                        World.addNpc(this, -1, false);
                    }
                    // Revert NPC (npc_changetype)
                    else {
                        this.revertType();
                    }
                }
                // Despawn NPC (npc_add)
                else if (this.lifecycle === EntityLifeCycle.DESPAWN) {
                    World.removeNpc(this, -1);
                    // Queue despawn trigger
                    const type = NpcType.get(this.type);
                    const script = ScriptProvider.getByTrigger(ServerTriggerType.AI_DESPAWN, type.id, type.category);
                    if (script) {
                        World.npcEventQueue.addTail(new NpcEventRequest(NpcEventType.DESPAWN, script, this));
                    }
                }
            } catch (err) {
                // there was an error adding or removing them, try again next tick...
                // ex: server is full on npc IDs (did we have a leak somewhere?) and we don't want to re-use the last ID (syncing related)
                printError(`[World] NPC type:${this.type} lifecycle:${this.lifecycle} ID:${this.nid}`);
                console.error(err);
                this.setLifeCycle(1);
            }
        }

        // Checks if Npc is alive and not delayed
        if (!this.isValid()) {
            return;
        }

        // Process partial hunt logic
        if (this.huntMode !== -1) {
            const hunt = HuntType.get(this.huntMode);

            if (hunt.nobodyNear !== HuntNobodyNear.PAUSEHUNT || rsbuf.getNpcObservers(this.nid) > 0 || hunt.type === HuntModeType.PLAYER) {
                // - hunt npc/obj/loc
                if (hunt && hunt.type !== HuntModeType.PLAYER) {
                    this.huntAll(hunt);
                }

                // Increment huntclock
                this.huntClock++;
            }
        }

        // Set target from hunt
        this.consumeHuntTarget();
        // Regen
        this.processRegen();
        // Timer
        this.processTimers();
        // Queue
        this.processQueue();
        // Movement-Interactions
        this.processMovementInteraction();
        // Update target facing
        this.setFaceEntity();
        // Dev note: Is this necessary?
        this.validateDistanceWalked();
    }

    cleanup(): void {
        this.nid = -1;
        this.uid = -1;
        this.activeScript = null;
        this.huntTarget = null;
        this.queue.clear();
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

    setTimer(interval: number) {
        if (interval !== -1) {
            this.timerInterval = interval;
        }
    }

    executeScript(script: ScriptState) {
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

    enqueueScript(queueId: number, delay = 0, arg: number = 0) {
        const request = new NpcQueueRequest(queueId, [], delay);
        request.lastInt = arg;
        this.queue.addTail(request);
    }

    // https://x.com/JagexAsh/status/1821236327150710829
    // https://x.com/JagexAsh/status/1799793914595131463
    huntAll(hunt: HuntType): void {
        this.huntTarget = null;

        // If a huntrate is defined, this acts as a throttle
        if (this.huntClock < hunt.rate - 1) {
            return;
        }

        // If no hunt, just return
        if (hunt.type === HuntModeType.OFF || this.huntrange < 1) {
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

        // Pick randomly from the hunted entities
        if (hunted.length > 0) {
            this.huntTarget = hunted[Math.floor(Math.random() * hunted.length)];
        }
    }

    // Very awkward function - needs to be reworked
    resetEntity(respawn: boolean) {
        if (respawn) {
            this.type = this.baseType;
            this.uid = (this.type << 16) | this.nid;
            this.unfocus();
            this.playAnimation(-1, 0); // reset animation or last anim has a chance to appear on respawn
            const npcType: NpcType = NpcType.get(this.type);
            for (let index = 0; index < npcType.stats.length; index++) {
                const level = npcType.stats[index];
                this.levels[index] = level;
                this.baseLevels[index] = level;
            }
            this.heroPoints.clear();
            this.queue.clear();
            this.clearWaypoints();

            for (let i = 0; i < this.vars.length; i++) {
                const varn = VarNpcType.get(i);
                if (varn.type === ScriptVarType.STRING) {
                    // todo: "null"? another value?
                    continue;
                } else {
                    this.vars[i] = varn.type === ScriptVarType.INT ? 0 : -1;
                }
            }

            this.varsString.fill(undefined);
            this.resetDefaults();

            this.huntrange = npcType.huntrange;
            this.huntMode = npcType.huntmode;
            this.huntClock = 0;
            this.huntTarget = null;
            this.tele = true;
        } else {
            super.resetPathingEntity();
        }
    }

    pathToTarget(): void {
        if (!this.target) {
            return;
        }

        if (!(this.target instanceof PathingEntity)) {
            super.pathToTarget();
            return;
        }

        if (CoordGrid.intersects(this.x, this.z, this.width, this.length, this.target.x, this.target.z, this.target.width, this.target.length)) {
            this.randomWalk();
            return;
        }

        super.pathToTarget();
    }

    updateMovement(): boolean {
        const type = NpcType.get(this.type);
        if (type.moverestrict === MoveRestrict.NOMOVE) {
            return false;
        }

        if (this.moveSpeed !== MoveSpeed.INSTANT) {
            this.moveSpeed = this.defaultMoveSpeed();
        }

        if (this.waypointIndex !== -1) {
            if (this.walktrigger !== -1) {
                const type = NpcType.get(this.type);
                const script = ScriptProvider.getByTrigger(ServerTriggerType.AI_QUEUE1 + this.walktrigger, type.id, type.category);
                this.walktrigger = -1;

                if (script) {
                    const state = ScriptRunner.init(script, this, null, [this.walktriggerArg]);
                    ScriptRunner.execute(state);
                }
            }

            super.processMovement();
        }

        const moved = this.lastTickX !== this.x || this.lastTickZ !== this.z;
        if (moved) {
            this.lastMovement = World.currentTick + 1;
            this.stuckCounter = 0;
        }
        return moved;
    }

    isValid(_hash64?: bigint): boolean {
        if (this.delayed) {
            return false;
        }
        return super.isValid();
    }

    clearPatrol() {
        this.nextPatrolPoint = 0;
        this.stuckCounter = 0;
        this.patrolDelayTicksRemaining = -1;
    }

    blockWalkFlag(): CollisionFlag {
        const type: NpcType = NpcType.get(this.type);
        if (type.moverestrict === MoveRestrict.NORMAL) {
            return CollisionFlag.NPC;
        } else if (type.moverestrict === MoveRestrict.BLOCKED) {
            return CollisionFlag.OPEN;
        } else if (type.moverestrict === MoveRestrict.BLOCKED_NORMAL) {
            return CollisionFlag.NPC;
        } else if (type.moverestrict === MoveRestrict.INDOORS) {
            return CollisionFlag.NPC;
        } else if (type.moverestrict === MoveRestrict.OUTDOORS) {
            return CollisionFlag.NPC;
        } else if (type.moverestrict === MoveRestrict.NOMOVE) {
            return CollisionFlag.NULL;
        } else if (type.moverestrict === MoveRestrict.PASSTHRU) {
            return CollisionFlag.OPEN;
        }
        return CollisionFlag.NULL;
    }

    defaultMoveSpeed(): MoveSpeed {
        return MoveSpeed.WALK;
    }

    clearInteraction(): void {
        super.clearInteraction();
        this.targetOp = NpcMode.NONE;
    }

    resetDefaults(): void {
        this.clearInteraction();
        const type: NpcType = NpcType.get(this.type);
        this.targetOp = type.defaultmode;

        const npcType: NpcType = NpcType.get(this.type);
        this.huntMode = npcType.huntmode;
        this.huntrange = npcType.huntrange;
        this.huntClock = 0;
        this.huntTarget = null;
        // Reset timer interval
        this.timerInterval = type.timer;
    }

    changeType(type: number, duration: number, reset: boolean = true) {
        if (!this.isActive || duration < 1) {
            return;
        }
        this.type = type;
        this.masks |= NpcInfoProt.CHANGE_TYPE;
        this.uid = (type << 16) | this.nid;
        this.resetOnRevert = reset;

        const npcType = NpcType.get(type);

        if (reset) {
            for (let index = 0; index < npcType.stats.length; index++) {
                const level = npcType.stats[index];
                this.levels[index] = Math.max(level - (this.baseLevels[index] - this.levels[index]), 0);
                this.baseLevels[index] = level;
            }
        }
        if (type === this.baseType && this.lifecycle === EntityLifeCycle.RESPAWN) {
            this.setLifeCycle(-1);
        } else {
            this.setLifeCycle(duration);
        }
    }

    // --- Client visuals

    playAnimation(anim: number, delay: number) {
        if (anim >= SeqType.count) {
            return;
        }

        if (anim == -1 || this.animId == -1 || SeqType.get(anim).priority >= SeqType.get(this.animId).priority) {
            this.animId = anim;
            this.animDelay = delay;
            this.masks |= NpcInfoProt.ANIM;
        }
    }

    spotanim(spotanim: number, height: number, delay: number) {
        this.spotanimId = spotanim;
        this.spotanimHeight = height;
        this.spotanimTime = delay;
        this.masks |= NpcInfoProt.SPOT_ANIM;
    }

    applyDamage(damage: number, type: number) {
        const current = this.levels[NpcStat.HITPOINTS];
        if (current - damage <= 0) {
            this.levels[NpcStat.HITPOINTS] = 0;
            damage = current;
        } else {
            this.levels[NpcStat.HITPOINTS] = current - damage;
        }

        if (this.hitmarkSlot % 2 === 1) {
            this.hitmark2Damage = damage;
            this.hitmark2Type = type;
            this.masks |= NpcInfoProt.DAMAGE2;
        } else {
            this.hitmarkDamage = damage;
            this.hitmarkType = type;
            this.masks |= NpcInfoProt.DAMAGE;
        }
        this.hitmarkSlot++;
    }

    say(text: string) {
        if (!text) {
            return;
        }

        this.sayMessage = text;
        this.masks |= NpcInfoProt.SAY;
    }

    faceSquare(x: number, z: number) {
        this.focus(CoordGrid.fine(x, 1), CoordGrid.fine(z, 1), true);
    }

    // ---
    // Private methods
    // ---

    // --- Npc turn
    private processRegen() {
        if (++this.regenClock >= this.regenInterval) {
            // Every time we regen, let's reload regen interval from NPC type
            // This seems to match NPC behavior for when they change type, the regenrate doesn't update until a regen happens
            // See: Vorkath in OSRS
            const type = NpcType.get(this.type);
            this.regenInterval = type.regenrate;
            this.regenClock = 0;

            // Regen the stats
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

    private processTimers() {
        if (this.timerInterval > 0 && ++this.timerClock >= this.timerInterval) {
            const type = NpcType.get(this.type);
            const script = ScriptProvider.getByTrigger(ServerTriggerType.AI_TIMER, type.id, type.category);
            if (script) {
                this.executeScript(ScriptRunner.init(script, this));
                this.timerClock = 0;
            }
        }
    }

    private processQueue() {
        if (!this.isActive) {
            return;
        }

        for (const request of this.queue.all()) {
            // purposely only decrements the delay when the npc is not delayed
            if (!this.delayed) {
                request.delay--;
            }

            if (!this.delayed && request.delay <= 0) {
                request.unlink();
                const type: NpcType = NpcType.get(this.type);
                const script = ScriptProvider.getByTrigger(request.queueId, type.id, type.category);
                if (script) {
                    const state = ScriptRunner.init(script, this, null, request.args);
                    state.lastInt = request.lastInt;
                    this.executeScript(state);
                }
            }
        }
    }

    private processMovementInteraction() {
        if (this.delayed || !this.isActive) {
            return;
        }

        // Failsafe
        if (this.targetOp === NpcMode.NULL) {
            const type: NpcType = NpcType.get(this.type);
            this.targetOp = type.defaultmode;
        }

        // Targetless modes
        if (this.targetOp === NpcMode.NONE) {
            this.noMode();
            return;
        } else if (this.targetOp === NpcMode.WANDER) {
            this.wanderMode();
            return;
        } else if (this.targetOp === NpcMode.PATROL) {
            this.patrolMode();
            return;
        }

        // Validate target before running targeted modes
        if (!this.target || !this.validateTarget()) {
            this.resetDefaults();
            return;
        }

        // Modes with targets
        if (this.targetOp === NpcMode.PLAYERESCAPE) {
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

    // --- Movement/Interaction helpers
    private validateTarget(): boolean {
        // Validate that the target is on the same floor
        if (this.target?.level !== this.level) {
            return false;
        }

        // Check maxrange
        if (!this.targetWithinMaxRange()) {
            return false;
        }

        // This is effectively checking if the Npc or Loc did a changetype
        if ((this.target instanceof Npc || this.target instanceof Loc) && this.targetSubject.type !== this.target.type) {
            return false;
        }

        // Npcs can interact with other Npcs who are delayed, so this is a special check
        if (this.target instanceof Npc) {
            return this.target.isActive;
        }
        return this.target.isValid();
    }

    public targetWithinMaxRange(): boolean {
        if (!this.target) {
            return true;
        }
        if (this.targetOp === NpcMode.PLAYERFOLLOW) {
            return true;
        }
        const type = NpcType.get(this.type);

        // OpTrigger maxrange
        if (this.checkOpTrigger()) {
            const distanceToX = Math.abs(this.target.x - this.startX);
            const distanceToZ = Math.abs(this.target.z - this.startZ);
            if (Math.max(distanceToX, distanceToZ) > type.maxrange + 1) {
                return false;
            }
            // remove corner
            if (distanceToX === type.maxrange + 1 && distanceToZ === type.maxrange + 1) {
                return false;
            }
        }
        // ApTrigger maxrange
        else if (this.checkApTrigger()) {
            if (CoordGrid.distanceToSW(this.target, { x: this.startX, z: this.startZ }) > type.maxrange + type.attackrange) {
                return false;
            }
        }
        // Retreat maxrange
        else if (this.targetOp === NpcMode.PLAYERESCAPE) {
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
        }
        // Everything else
        else if (CoordGrid.distanceToSW(this.target, { x: this.startX, z: this.startZ }) > type.maxrange + 1) {
            return false;
        }
        return true;
    }

    private wander(range: number) {
        const dx = Math.round(Math.random() * (range * 2) - range);
        const dz = Math.round(Math.random() * (range * 2) - range);
        const destX = this.startX + dx;
        const destZ = this.startZ + dz;

        if (destX !== this.x || destZ !== this.z) {
            this.queueWaypoint(destX, destZ);
        }
    }

    private noMode(): void {
        this.updateMovement();
    }

    private wanderMode(): void {
        const type = NpcType.get(this.type);

        // 1/8 chance to move every tick (even if they already have a destination)
        if (type.moverestrict !== MoveRestrict.NOMOVE && Math.random() < 0.125) {
            this.wander(type.wanderrange);
        }

        this.updateMovement();

        const onSpawn = this.x === this.startX && this.z === this.startZ && this.level === this.startLevel;

        // Npc should teleport 501 ticks after its last movement
        if (this.stuckCounter++ > 500) {
            if (!onSpawn) {
                this.teleport(this.startX, this.startZ, this.startLevel);
            }
            this.stuckCounter = 0;
        }
    }

    private patrolMode(): void {
        const type = NpcType.get(this.type);
        const patrolPoints = type.patrolCoord;

        if (patrolPoints.length === 0) {
            this.updateMovement();
            return;
        }

        let dest = CoordGrid.unpackCoord(patrolPoints[this.nextPatrolPoint]);

        if (!this.hasWaypoints() && !this.target) {
            // requeue waypoints in cases where an npc was interacting and the interaction has been cleared
            this.queueWaypoint(dest.x, dest.z);
        }

        this.stuckCounter++;

        // Npc should teleport 32 ticks after its last movement, or if it needs to change floors
        if (this.stuckCounter >= 32 || this.level !== dest.level) {
            this.teleport(dest.x, dest.z, dest.level);
            this.stuckCounter = 0;
        }

        if (this.x === dest.x && this.z === dest.z) {
            // If patrol delay is unitialized, set it to next patroldelay
            if (this.patrolDelayTicksRemaining < 0) {
                const patrolDelay = type.patrolDelay[this.nextPatrolPoint] ?? 0;
                this.patrolDelayTicksRemaining = patrolDelay;
            }

            if (this.patrolDelayTicksRemaining-- <= 0) {
                this.nextPatrolPoint = (this.nextPatrolPoint + 1) % patrolPoints.length;
                this.patrolDelayTicksRemaining = -1;
                dest = CoordGrid.unpackCoord(patrolPoints[this.nextPatrolPoint]);
                this.queueWaypoint(dest.x, dest.z);
            }
        }

        this.updateMovement();
    }

    private playerEscapeMode(): void {
        if (!(this.target instanceof Player)) {
            throw new Error('[Npc] Target must be a Player for playerescape mode.');
        }

        if (CoordGrid.distanceToSW(this, this.target) > 25) {
            this.resetDefaults();
            return;
        }

        let direction: number;
        if (this.target.x >= this.x && this.target.z >= this.z) {
            direction = Direction.SOUTH_WEST;
        } else if (this.target.x >= this.x && this.target.z < this.z) {
            direction = Direction.NORTH_WEST;
        } else if (this.target.x < this.x && this.target.z >= this.z) {
            direction = Direction.SOUTH_EAST;
        } else {
            direction = Direction.NORTH_EAST;
        }

        const dx: number = CoordGrid.deltaX(direction);
        const dz: number = CoordGrid.deltaZ(direction);
        const mx: number = CoordGrid.moveX(this.x, direction);
        const mz: number = CoordGrid.moveZ(this.z, direction);
        const coord: CoordGrid = { x: mx, z: mz, level: this.level };
        const maxRange: number = NpcType.get(this.type).maxrange;

        const collisionStrategy: CollisionType = this.getCollisionStrategy() ?? CollisionType.NORMAL;
        const extraFlag: CollisionFlag = this.blockWalkFlag();

        const diagonalTravelValid: boolean = canTravel(this.level, this.x, this.z, dx, dz, this.width, extraFlag, collisionStrategy);
        const diagonalStepValid: boolean = diagonalTravelValid && CoordGrid.distanceToSW(coord, { x: this.startX, z: this.startZ }) <= maxRange;

        if (diagonalStepValid) {
            this.queueWaypoint(coord.x, coord.z);
        } else {
            let primaryCoord: CoordGrid;
            let secondaryCoord: CoordGrid;
            let primaryTravelValid: boolean;
            let secondaryTravelValid: boolean;

            if (direction === Direction.SOUTH_WEST) {
                // Prefer West over South
                primaryCoord = { x: mx, z: this.z, level: this.level };
                secondaryCoord = { x: this.x, z: mz, level: this.level };
                primaryTravelValid = canTravel(this.level, this.x, this.z, dx, 0, this.width, extraFlag, collisionStrategy);
                secondaryTravelValid = canTravel(this.level, this.x, this.z, 0, dz, this.width, extraFlag, collisionStrategy);
            } else if (direction === Direction.NORTH_EAST) {
                // Prefer East over North
                primaryCoord = { x: mx, z: this.z, level: this.level };
                secondaryCoord = { x: this.x, z: mz, level: this.level };
                primaryTravelValid = canTravel(this.level, this.x, this.z, dx, 0, this.width, extraFlag, collisionStrategy);
                secondaryTravelValid = canTravel(this.level, this.x, this.z, 0, dz, this.width, extraFlag, collisionStrategy);
            } else if (direction === Direction.NORTH_WEST) {
                // Prefer West over North
                primaryCoord = { x: mx, z: this.z, level: this.level };
                secondaryCoord = { x: this.x, z: mz, level: this.level };
                primaryTravelValid = canTravel(this.level, this.x, this.z, dx, 0, this.width, extraFlag, collisionStrategy);
                secondaryTravelValid = canTravel(this.level, this.x, this.z, 0, dz, this.width, extraFlag, collisionStrategy);
            } else {
                // Prefer East over South
                primaryCoord = { x: mx, z: this.z, level: this.level };
                secondaryCoord = { x: this.x, z: mz, level: this.level };
                primaryTravelValid = canTravel(this.level, this.x, this.z, dx, 0, this.width, extraFlag, collisionStrategy);
                secondaryTravelValid = canTravel(this.level, this.x, this.z, 0, dz, this.width, extraFlag, collisionStrategy);
            }

            const primaryValid = primaryTravelValid && CoordGrid.distanceToSW(primaryCoord, { x: this.startX, z: this.startZ }) <= maxRange;
            const secondaryValid = secondaryTravelValid && CoordGrid.distanceToSW(secondaryCoord, { x: this.startX, z: this.startZ }) <= maxRange;

            if (primaryValid) {
                this.queueWaypoint(primaryCoord.x, primaryCoord.z);
            } else if (secondaryValid) {
                this.queueWaypoint(secondaryCoord.x, secondaryCoord.z);
            }
        }

        if (!this.updateMovement()) {
            this.stuckCounter++;
        }

        const distX: number = CoordGrid.distanceToSW({ x: this.x, z: this.startZ }, { x: this.startX, z: this.startZ });
        const distZ: number = CoordGrid.distanceToSW({ x: this.startX, z: this.z }, { x: this.startX, z: this.startZ });
        const atMaxRangeBoth: boolean = distX >= maxRange && distZ >= maxRange;

        // Resets if it has been stuck for 5 ticks and is not at max range in both directions
        if (this.stuckCounter >= 5 && !atMaxRangeBoth) {
            this.resetDefaults();
            this.stuckCounter = 0;
        }
    }

    private playerFollowMode(): void {
        const player = this.target;

        if (!(player instanceof Player)) {
            throw new Error('[Npc] Target must be a Player for playerfollow mode.');
        }

        // Set dest to target
        this.pathToTarget();

        // Path
        this.updateMovement();
    }

    private playerFaceMode(): void {
        if (!(this.target instanceof Player)) {
            throw new Error('[Npc] Target must be a Player for playerface mode.');
        }
    }

    private playerFaceCloseMode(): void {
        if (!(this.target instanceof Player)) {
            throw new Error('[Npc] Target must be a Player for playerfaceclose mode.');
        }

        if (CoordGrid.distanceTo(this, this.target) > 1) {
            this.resetDefaults();
            return;
        }
    }

    private aiMode(): void {
        const type: NpcType = NpcType.get(this.type);

        // Reset the stuck timer if Npc runs its aimode
        this.stuckCounter = 0;

        // Try to interact before moving, include op Obj and Loc
        if (this.tryInteract(true)) {
            return;
        }

        // Set dest to target
        this.pathToTarget();

        // Path
        const moved: boolean = this.updateMovement();

        // Clear target if givechase=no
        if (moved && !type.givechase) {
            this.resetDefaults();
            return;
        }

        // Try to interact again after moving
        if (this.target) {
            this.tryInteract(false);
        }
    }

    private tryInteract(allowOpScenery: boolean): boolean {
        if (!this.target) {
            return false;
        }
        const type: NpcType = NpcType.get(this.type);
        const script: ScriptFile | null = this.getTrigger(type);

        // Run opTrigger
        if (this.checkOpTrigger() && this.inOperableDistance(this.target) && (this.target instanceof PathingEntity || allowOpScenery)) {
            if (script) {
                this.executeScript(ScriptRunner.init(script, this, this.target));
            }
            return true;
        }
        // Run apTrigger
        else if (this.checkApTrigger() && this.inApproachDistance(type.attackrange, this.target)) {
            if (script) {
                this.executeScript(ScriptRunner.init(script, this, this.target));
            }
            return true;
        }
        return false;
    }

    // --- Hunt helpers

    private consumeHuntTarget() {
        const hunt: HuntType = HuntType.get(this.huntMode);

        // We need a huntTarget and a huntMode
        if (!this.huntTarget || typeof hunt === 'undefined' || hunt.type === HuntModeType.OFF) {
            return;
        }

        // Findnewmode runs a Queue trigger rather than setting the interaction
        if (NpcMode.QUEUE1 <= hunt.findNewMode && hunt.findNewMode <= NpcMode.QUEUE20) {
            const npcType = NpcType.get(this.type);
            const script = ScriptProvider.getByTrigger(ServerTriggerType.AI_QUEUE1 + (hunt.findNewMode - NpcMode.QUEUE1), npcType.id, npcType.category);

            if (script) {
                const state = ScriptRunner.init(script, this, null, null);
                ScriptRunner.execute(state);
            }
        } else {
            // Set the interaction
            this.setInteraction(Interaction.SCRIPT, this.huntTarget, hunt.findNewMode);
        }

        // Clear target
        this.huntTarget = null;
        this.huntClock = 0;

        // In osrs, and in this 2005: https://youtu.be/8AFed6tyOp8?t=231
        // Once an npc finds a huntTarget, it will no longer hunt until its interactions are cleared
        if (!hunt.findKeepHunting) {
            this.huntMode = -1;
            return;
        }
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
            if (
                hunt.checkVars &&
                !hunt.checkVars.every(checkVar => {
                    return checkVar.varId === -1 || hunt.checkHuntCondition(player.getVar(checkVar.varId) as number, checkVar.condition, checkVar.val);
                })
            ) {
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

    // --- Other

    private getTrigger(type: NpcType): ScriptFile | null {
        const trigger: ServerTriggerType | null = this.getTriggerForMode(this.targetOp);
        if (trigger) {
            return ScriptProvider.getByTrigger(trigger, this.type, type.category) ?? null;
        }
        return null;
    }

    private getTriggerForMode(mode: NpcMode | ServerTriggerType): ServerTriggerType | null {
        const map: Partial<Record<NpcMode, ServerTriggerType>> = {
            [NpcMode.OPPLAYER1]: ServerTriggerType.AI_OPPLAYER1,
            [NpcMode.OPPLAYER2]: ServerTriggerType.AI_OPPLAYER2,
            [NpcMode.OPPLAYER3]: ServerTriggerType.AI_OPPLAYER3,
            [NpcMode.OPPLAYER4]: ServerTriggerType.AI_OPPLAYER4,
            [NpcMode.OPPLAYER5]: ServerTriggerType.AI_OPPLAYER5,
            [NpcMode.APPLAYER1]: ServerTriggerType.AI_APPLAYER1,
            [NpcMode.APPLAYER2]: ServerTriggerType.AI_APPLAYER2,
            [NpcMode.APPLAYER3]: ServerTriggerType.AI_APPLAYER3,
            [NpcMode.APPLAYER4]: ServerTriggerType.AI_APPLAYER4,
            [NpcMode.APPLAYER5]: ServerTriggerType.AI_APPLAYER5,
            [NpcMode.OPLOC1]: ServerTriggerType.AI_OPLOC1,
            [NpcMode.OPLOC2]: ServerTriggerType.AI_OPLOC2,
            [NpcMode.OPLOC3]: ServerTriggerType.AI_OPLOC3,
            [NpcMode.OPLOC4]: ServerTriggerType.AI_OPLOC4,
            [NpcMode.OPLOC5]: ServerTriggerType.AI_OPLOC5,
            [NpcMode.APLOC1]: ServerTriggerType.AI_APLOC1,
            [NpcMode.APLOC2]: ServerTriggerType.AI_APLOC2,
            [NpcMode.APLOC3]: ServerTriggerType.AI_APLOC3,
            [NpcMode.APLOC4]: ServerTriggerType.AI_APLOC4,
            [NpcMode.APLOC5]: ServerTriggerType.AI_APLOC5,
            [NpcMode.OPOBJ1]: ServerTriggerType.AI_OPOBJ1,
            [NpcMode.OPOBJ2]: ServerTriggerType.AI_OPOBJ2,
            [NpcMode.OPOBJ3]: ServerTriggerType.AI_OPOBJ3,
            [NpcMode.OPOBJ4]: ServerTriggerType.AI_OPOBJ4,
            [NpcMode.OPOBJ5]: ServerTriggerType.AI_OPOBJ5,
            [NpcMode.APOBJ1]: ServerTriggerType.AI_APOBJ1,
            [NpcMode.APOBJ2]: ServerTriggerType.AI_APOBJ2,
            [NpcMode.APOBJ3]: ServerTriggerType.AI_APOBJ3,
            [NpcMode.APOBJ4]: ServerTriggerType.AI_APOBJ4,
            [NpcMode.APOBJ5]: ServerTriggerType.AI_APOBJ5,
            [NpcMode.OPNPC1]: ServerTriggerType.AI_OPNPC1,
            [NpcMode.OPNPC2]: ServerTriggerType.AI_OPNPC2,
            [NpcMode.OPNPC3]: ServerTriggerType.AI_OPNPC3,
            [NpcMode.OPNPC4]: ServerTriggerType.AI_OPNPC4,
            [NpcMode.OPNPC5]: ServerTriggerType.AI_OPNPC5,
            [NpcMode.APNPC1]: ServerTriggerType.AI_APNPC1,
            [NpcMode.APNPC2]: ServerTriggerType.AI_APNPC2,
            [NpcMode.APNPC3]: ServerTriggerType.AI_APNPC3,
            [NpcMode.APNPC4]: ServerTriggerType.AI_APNPC4,
            [NpcMode.APNPC5]: ServerTriggerType.AI_APNPC5,
            [NpcMode.QUEUE1]: ServerTriggerType.AI_QUEUE1,
            [NpcMode.QUEUE2]: ServerTriggerType.AI_QUEUE2,
            [NpcMode.QUEUE3]: ServerTriggerType.AI_QUEUE3,
            [NpcMode.QUEUE4]: ServerTriggerType.AI_QUEUE4,
            [NpcMode.QUEUE5]: ServerTriggerType.AI_QUEUE5,
            [NpcMode.QUEUE6]: ServerTriggerType.AI_QUEUE6,
            [NpcMode.QUEUE7]: ServerTriggerType.AI_QUEUE7,
            [NpcMode.QUEUE8]: ServerTriggerType.AI_QUEUE8,
            [NpcMode.QUEUE9]: ServerTriggerType.AI_QUEUE9,
            [NpcMode.QUEUE10]: ServerTriggerType.AI_QUEUE10,
            [NpcMode.QUEUE11]: ServerTriggerType.AI_QUEUE11,
            [NpcMode.QUEUE12]: ServerTriggerType.AI_QUEUE12,
            [NpcMode.QUEUE13]: ServerTriggerType.AI_QUEUE13,
            [NpcMode.QUEUE14]: ServerTriggerType.AI_QUEUE14,
            [NpcMode.QUEUE15]: ServerTriggerType.AI_QUEUE15,
            [NpcMode.QUEUE16]: ServerTriggerType.AI_QUEUE16,
            [NpcMode.QUEUE17]: ServerTriggerType.AI_QUEUE17,
            [NpcMode.QUEUE18]: ServerTriggerType.AI_QUEUE18,
            [NpcMode.QUEUE19]: ServerTriggerType.AI_QUEUE19,
            [NpcMode.QUEUE20]: ServerTriggerType.AI_QUEUE20
        };

        return map[mode as NpcMode] ?? null;
    }

    private checkApTrigger(): boolean {
        return (
            (this.targetOp >= NpcMode.APNPC1 && this.targetOp <= NpcMode.APNPC5) ||
            (this.targetOp >= NpcMode.APPLAYER1 && this.targetOp <= NpcMode.APPLAYER5) ||
            (this.targetOp >= NpcMode.APLOC1 && this.targetOp <= NpcMode.APLOC5) ||
            (this.targetOp >= NpcMode.APOBJ1 && this.targetOp <= NpcMode.APOBJ5)
        );
    }

    private checkOpTrigger(): boolean {
        return (
            (this.targetOp >= NpcMode.OPNPC1 && this.targetOp <= NpcMode.OPNPC5) ||
            (this.targetOp >= NpcMode.OPPLAYER1 && this.targetOp <= NpcMode.OPPLAYER5) ||
            (this.targetOp >= NpcMode.OPLOC1 && this.targetOp <= NpcMode.OPLOC5) ||
            (this.targetOp >= NpcMode.OPOBJ1 && this.targetOp <= NpcMode.OPOBJ5)
        );
    }

    private revertType(): void {
        if (this.resetOnRevert) {
            World.removeNpc(this, -1);
            World.addNpc(this, -1, false);
        } else {
            this.type = this.baseType;
            this.masks |= NpcInfoProt.CHANGE_TYPE;
            this.uid = (this.type << 16) | this.nid;
        }
    }
}
