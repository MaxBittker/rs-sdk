import Packet from '#jagex2/io/Packet.js';

import NpcType from '#lostcity/cache/NpcType.js';
import VarNpcType from '#lostcity/cache/VarNpcType.js';

import World from '#lostcity/engine/World.js';

import Script from '#lostcity/engine/script/Script.js';
import ScriptPointer from '#lostcity/engine/script/ScriptPointer.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import ScriptRunner from '#lostcity/engine/script/ScriptRunner.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';

import BlockWalk from '#lostcity/entity/BlockWalk.js';
import { EntityQueueRequest, NpcQueueType, ScriptArgument } from '#lostcity/entity/EntityQueueRequest.js';
import Loc from '#lostcity/entity/Loc.js';
import MoveRestrict from '#lostcity/entity/MoveRestrict.js';
import NpcMode from '#lostcity/entity/NpcMode.js';
import Obj from '#lostcity/entity/Obj.js';
import PathingEntity from '#lostcity/entity/PathingEntity.js';
import Player from '#lostcity/entity/Player.js';
import { Direction, Position } from '#lostcity/entity/Position.js';
import HuntType from '#lostcity/cache/HuntType.js';
import HuntModeType from '#lostcity/entity/hunt/HuntModeType.js';
import HuntVis from '#lostcity/entity/hunt/HuntVis.js';
import HuntCheckNotTooStrong from '#lostcity/entity/hunt/HuntCheckNotTooStrong.js';

import { CollisionFlag } from '@2004scape/rsmod-pathfinder';

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
    uid: number;
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
    timerInterval: number = 0;
    timerClock: number = 0;
    mode: NpcMode = NpcMode.NONE;
    huntMode: number = -1;
    nextHuntTick: number = -1;

    interacted: boolean = false;
    target: Player | Npc | Loc | Obj | null = null;
    targetOp: number = -1;

    heroPoints: {
        uid: number;
        points: number;
    }[] = new Array(16); // be sure to reset when stats are recovered/reset

    found: (Player | Npc | Loc | Obj)[] = [];
    foundCount = 0;

    constructor(level: number, x: number, z: number, width: number, length: number, nid: number, type: number, moveRestrict: MoveRestrict, blockWalk: BlockWalk) {
        super(level, x, z, width, length, moveRestrict, blockWalk);
        this.nid = nid;
        this.type = type;
        this.uid = (type << 16) | nid;
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

        this.animId = -1;
        this.animDelay = -1;

        this.chat = null;

        this.damageTaken = -1;
        this.damageType = -1;

        this.graphicId = -1;
        this.graphicHeight = -1;
        this.graphicDelay = -1;
    }

    updateMovement(running: number = -1): void {
        const type = NpcType.get(this.type);
        if (type.moverestrict === MoveRestrict.NOMOVE) {
            return;
        }

        if (this.moveCheck !== null) {
            const script = ScriptProvider.get(this.moveCheck);
            if (script) {
                const state = ScriptRunner.init(script, this);
                ScriptRunner.execute(state);

                const result = state.popInt();
                if (!result) {
                    return;
                }
            }

            this.moveCheck = null;
        }

        if (running === -1 && !this.forceMove) {
            running = 0;
        }

        super.processMovement(running);
    }

    blockWalkFlag(): number | null {
        switch (this.moveRestrict) {
            case MoveRestrict.NORMAL:
                return CollisionFlag.NPC;
            case MoveRestrict.BLOCKED:
                return CollisionFlag.OPEN;
            case MoveRestrict.BLOCKED_NORMAL:
                return CollisionFlag.NPC;
            case MoveRestrict.INDOORS:
                return CollisionFlag.NPC;
            case MoveRestrict.OUTDOORS:
                return CollisionFlag.NPC;
            case MoveRestrict.NOMOVE:
                return null;
            case MoveRestrict.PASSTHRU:
                return CollisionFlag.OPEN;
        }
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
        let processedQueueCount = 0;

        for (let i = 0; i < this.queue.length; i++) {
            const queue = this.queue[i];

            // purposely only decrements the delay when the npc is not delayed
            if (!this.delayed()) {
                queue.delay--;
            }

            if (!this.delayed() && queue.delay <= 0) {
                const state = ScriptRunner.init(queue.script, this, null, null, queue.args);
                this.executeScript(state);

                processedQueueCount++;
                this.queue.splice(i--, 1);
            }
        }

        return processedQueueCount;
    }

    enqueueScript(script: Script, delay = 0, args: ScriptArgument[] = []) {
        const request = new EntityQueueRequest(NpcQueueType.NORMAL, script, args, delay);
        this.queue.push(request);
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
        this.clearInteraction();
    }

    defaultMode(): void {
        const type = NpcType.get(this.type);
        this.mode = type.defaultmode;
        this.clearInteraction();
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
        this.queueWaypoint(this.startX, this.startZ);
    }

    playerFollowMode(): void {
        if (!this.target) {
            return;
        }

        const target = this.target as Player;

        if (World.getPlayerByUid(target.uid) == null) {
            this.playerEscapeMode();
            return;
        }

        if (this.level != target.level) {
            this.defaultMode();
            return;
        }

        const collisionStrategy = this.getCollisionStrategy();
        if (!collisionStrategy) {
            // nomove moverestrict returns as null = no walking allowed.
            this.defaultMode();
            return;
        }

        const extraFlag = this.blockWalkFlag();
        if (extraFlag === null) {
            // nomove moverestrict returns as null = no walking allowed.
            this.defaultMode();
            return;
        }

        this.queueWaypoints(World.naivePathFinder.findPath(this.level, this.x, this.z, target.x, target.z, this.width, this.length, target.width, target.length, extraFlag, collisionStrategy).waypoints);
    }

    playerFaceMode(): void {
        if (!this.target) {
            return;
        }

        const target = this.target as Player;

        if (World.getPlayerByUid(target.uid) == null) {
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
        if (!this.target) {
            return;
        }

        const target = this.target as Player;

        if (World.getPlayerByUid(target.uid) == null) {
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
        if (this.delayed() || !this.target) {
            return;
        }

        const target = this.target as Player;

        if (World.getPlayerByUid(target.uid) == null) {
            this.playerEscapeMode();
            return;
        }

        const distanceToTarget = Position.distanceTo(this, target);
        const distanceToEscape = Position.distanceTo(this, {
            x: this.startX,
            z: this.startZ,
            width: this.width,
            length: this.length
        });
        const targetDistanceFromStart = Position.distanceTo(target, {
            x: this.startX,
            z: this.startZ,
            width: target.width,
            length: target.length
        });
        const type = NpcType.get(this.type);

        if (distanceToTarget > type.maxrange) {
            this.playerEscapeMode();
            return;
        }

        this.facePlayer(target.pid);

        // todo: rework this logic
        const op =
            (this.mode >= NpcMode.OPNPC1 && this.mode <= NpcMode.OPNPC5) ||
            (this.mode >= NpcMode.OPPLAYER1 && this.mode <= NpcMode.OPPLAYER5) ||
            (this.mode >= NpcMode.OPLOC1 && this.mode <= NpcMode.OPLOC5) ||
            (this.mode >= NpcMode.OPOBJ1 && this.mode <= NpcMode.OPOBJ5);

        if (op && !this.inOperableDistance(this.target)) {
            if (targetDistanceFromStart > type.attackrange && distanceToEscape > type.attackrange) {
                return;
            }
            this.playerFollowMode();
            return;
        }

        const ap =
            (this.mode >= NpcMode.APNPC1 && this.mode <= NpcMode.APNPC5) ||
            (this.mode >= NpcMode.APPLAYER1 && this.mode <= NpcMode.APPLAYER5) ||
            (this.mode >= NpcMode.APLOC1 && this.mode <= NpcMode.APLOC5) ||
            (this.mode >= NpcMode.APOBJ1 && this.mode <= NpcMode.APOBJ5);

        if (ap && !this.inApproachDistance(type.attackrange, this.target)) {
            if (targetDistanceFromStart > type.attackrange && distanceToEscape > type.attackrange) {
                return;
            }
            this.playerFollowMode();
            return;
        }

        this.clearWalkSteps();

        const trigger = this.getTriggerForMode(this.mode);
        if (trigger) {
            const script = ScriptProvider.getByTrigger(trigger, this.type, -1);

            if (script) {
                this.executeScript(ScriptRunner.init(script, this, this.target, null, []));
            }
        }
    }

    getTriggerForMode(mode: NpcMode): ServerTriggerType | null {
        switch (mode) {
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
            // [ai_queueX,npc]
            case NpcMode.QUEUE1:
                return ServerTriggerType.AI_QUEUE1;
            case NpcMode.QUEUE2:
                return ServerTriggerType.AI_QUEUE2;
            case NpcMode.QUEUE3:
                return ServerTriggerType.AI_QUEUE3;
            case NpcMode.QUEUE4:
                return ServerTriggerType.AI_QUEUE4;
            case NpcMode.QUEUE5:
                return ServerTriggerType.AI_QUEUE5;
            case NpcMode.QUEUE6:
                return ServerTriggerType.AI_QUEUE6;
            case NpcMode.QUEUE7:
                return ServerTriggerType.AI_QUEUE7;
            case NpcMode.QUEUE8:
                return ServerTriggerType.AI_QUEUE8;
            case NpcMode.QUEUE9:
                return ServerTriggerType.AI_QUEUE9;
            case NpcMode.QUEUE10:
                return ServerTriggerType.AI_QUEUE10;
            case NpcMode.QUEUE11:
                return ServerTriggerType.AI_QUEUE11;
            case NpcMode.QUEUE12:
                return ServerTriggerType.AI_QUEUE12;
            case NpcMode.QUEUE13:
                return ServerTriggerType.AI_QUEUE13;
            case NpcMode.QUEUE14:
                return ServerTriggerType.AI_QUEUE14;
            case NpcMode.QUEUE15:
                return ServerTriggerType.AI_QUEUE15;
            case NpcMode.QUEUE16:
                return ServerTriggerType.AI_QUEUE16;
            case NpcMode.QUEUE17:
                return ServerTriggerType.AI_QUEUE17;
            case NpcMode.QUEUE18:
                return ServerTriggerType.AI_QUEUE18;
            case NpcMode.QUEUE19:
                return ServerTriggerType.AI_QUEUE19;
            case NpcMode.QUEUE20:
                return ServerTriggerType.AI_QUEUE20;
            default:
                return null;
        }
    }

    setInteraction(target: Player | Npc | Loc | Obj, op: NpcMode) {
        this.target = target;
        this.targetOp = op;
        this.mode = op;
    }

    clearInteraction() {
        this.target = null;
        this.targetOp = -1;

        this.faceEntity = -1;
        this.mask |= Npc.FACE_ENTITY;
    }

    huntAll() {
        const type = NpcType.get(this.type);
        const hunt = HuntType.get(this.huntMode);
        if (!hunt.findKeepHunting && this.target !== null) {
            return;
        }

        if (this.nextHuntTick > World.currentTick) {
            return;
        }

        const centerX = Position.zone(this.x);
        const centerZ = Position.zone(this.z);

        this.found = [];
        this.foundCount = 0;

        if (hunt.type === HuntModeType.PLAYER) {
            const nearby: Player[] = [];
            for (let x = centerX - 2; x <= centerX + 2; x++) {
                for (let z = centerZ - 2; z <= centerZ + 2; z++) {
                    const { players } = World.getZone(x << 3, z << 3, this.level);

                    for (const uid of players) {
                        const player = World.getPlayerByUid(uid);
                        if (!player) {
                            continue;
                        }

                        if (Position.distanceTo(this, player) <= type.huntrange) {
                            nearby.push(player);
                        }
                    }
                }
            }

            for (let i = 0; i < nearby.length; i++) {
                const player = nearby[i];

                if (hunt.checkVis === HuntVis.LINEOFSIGHT && !World.lineValidator.hasLineOfSight(this.level, this.x, this.z, player.x, player.z, this.width, player.width, player.length)) {
                    continue;
                } else if (hunt.checkVis === HuntVis.LINEOFWALK && !World.lineValidator.hasLineOfWalk(this.level, this.x, this.z, player.x, player.z, 1, 1, 1)) {
                    continue;
                }

                // TODO: probably zone check to see if they're in the wilderness as well?
                if (hunt.checkNotTooStrong === HuntCheckNotTooStrong.OUTSIDE_WILDERNESS && player.combatLevel > type.vislevel * 2) {
                    continue;
                }

                if (hunt.checkNotCombat !== -1 && player.getVarp(hunt.checkNotCombat) >= World.currentTick) {
                    continue;
                } else if (hunt.checkNotCombatSelf !== -1 && this.getVar(hunt.checkNotCombatSelf) >= World.currentTick) {
                    continue;
                }

                if (hunt.checkNotBusy && player.busy()) {
                    continue;
                }

                this.found[this.foundCount++] = player;
            }

            // pick randomly from the found players
            if (this.foundCount > 0) {
                const player = this.found[Math.floor(Math.random() * this.foundCount)];
                this.setInteraction(player, hunt.findNewMode);
            }
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
            out.p2(this.faceEntity);
        }

        if (mask & Npc.SAY) {
            out.pjstr(this.chat);
        }

        if (mask & Npc.DAMAGE) {
            out.p1(this.damageTaken);
            out.p1(this.damageType);
            out.p1(this.levels[Npc.HITPOINTS]);
            out.p1(this.baseLevels[Npc.HITPOINTS]);
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
