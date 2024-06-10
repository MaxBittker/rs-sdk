import 'dotenv/config';

import Packet from '#jagex2/io/Packet.js';
import {fromBase37, toDisplayName} from '#jagex2/jstring/JString.js';

import FontType from '#lostcity/cache/config/FontType.js';
import Component from '#lostcity/cache/config/Component.js';
import InvType from '#lostcity/cache/config/InvType.js';
import LocType from '#lostcity/cache/config/LocType.js';
import NpcType from '#lostcity/cache/config/NpcType.js';
import ObjType from '#lostcity/cache/config/ObjType.js';
import ScriptVarType from '#lostcity/cache/config/ScriptVarType.js';
import SeqType from '#lostcity/cache/config/SeqType.js';
import VarPlayerType from '#lostcity/cache/config/VarPlayerType.js';

import BlockWalk from '#lostcity/entity/BlockWalk.js';
import Entity from '#lostcity/entity/Entity.js';
import { EntityTimer, PlayerTimerType } from '#lostcity/entity/EntityTimer.js';
import { EntityQueueRequest, PlayerQueueType, QueueType, ScriptArgument } from '#lostcity/entity/EntityQueueRequest.js';
import Loc from '#lostcity/entity/Loc.js';
import Npc from '#lostcity/entity/Npc.js';
import MoveRestrict from '#lostcity/entity/MoveRestrict.js';
import Obj from '#lostcity/entity/Obj.js';
import PathingEntity from '#lostcity/entity/PathingEntity.js';
import { Position } from '#lostcity/entity/Position.js';
import CameraInfo from '#lostcity/entity/CameraInfo.js';
import MoveSpeed from '#lostcity/entity/MoveSpeed.js';
import EntityLifeCycle from '#lostcity/entity/EntityLifeCycle.js';
import PlayerStat from '#lostcity/entity/PlayerStat.js';

import ServerProt, { ServerProtEncoders } from '#lostcity/server/ServerProt.js';

import { Inventory } from '#lostcity/engine/Inventory.js';
import World from '#lostcity/engine/World.js';

import Script from '#lostcity/engine/script/Script.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import ScriptRunner from '#lostcity/engine/script/ScriptRunner.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';
import ScriptPointer from '#lostcity/engine/script/ScriptPointer.js';

import Environment from '#lostcity/util/Environment.js';
import { ZoneEvent } from '#lostcity/engine/zone/Zone.js';

import LinkList from '#jagex2/datastruct/LinkList.js';
import Stack from '#jagex2/datastruct/Stack.js';

import {CollisionFlag} from '@2004scape/rsmod-pathfinder';
import { PRELOADED, PRELOADED_CRC } from '#lostcity/server/PreloadedPacks.js';

const levelExperience = new Int32Array(99);

let acc = 0;
for (let i = 0; i < 99; i++) {
    const level = i + 1;
    const delta = Math.floor(level + Math.pow(2.0, level / 7.0) * 300.0);
    acc += delta;
    levelExperience[i] = Math.floor(acc / 4) * 10;
}

export function getLevelByExp(exp: number) {
    for (let i = 98; i >= 0; i--) {
        if (exp >= levelExperience[i]) {
            return Math.min(i + 2, 99);
        }
    }

    return 1;
}

export function getExpByLevel(level: number) {
    return levelExperience[level - 2];
}

export default class Player extends PathingEntity {
    static readonly APPEARANCE = 0x1;
    static readonly ANIM = 0x2;
    static readonly FACE_ENTITY = 0x4;
    static readonly SAY = 0x8;
    static readonly DAMAGE = 0x10;
    static readonly FACE_COORD = 0x20;
    static readonly CHAT = 0x40;
    static readonly BIG_UPDATE = 0x80;
    static readonly SPOTANIM = 0x100;
    static readonly EXACT_MOVE = 0x200;

    static SKILLS = [
        'attack',
        'defence',
        'strength',
        'hitpoints',
        'ranged',
        'prayer',
        'magic',
        'cooking',
        'woodcutting',
        'fletching',
        'fishing',
        'firemaking',
        'crafting',
        'smithing',
        'mining',
        'herblore',
        'agility',
        'thieving',
        'stat18',
        'stat19',
        'runecraft'
    ];

    static DESIGN_BODY_COLORS: number[][] = [
        [6798, 107, 10283, 16, 4797, 7744, 5799, 4634, 33697, 22433, 2983, 54193],
        [8741, 12, 64030, 43162, 7735, 8404, 1701, 38430, 24094, 10153, 56621, 4783, 1341, 16578, 35003, 25239],
        [25238, 8742, 12, 64030, 43162, 7735, 8404, 1701, 38430, 24094, 10153, 56621, 4783, 1341, 16578, 35003],
        [4626, 11146, 6439, 12, 4758, 10270],
        [4550, 4537, 5681, 5673, 5790, 6806, 8076, 4574]
    ];

    save() {
        const sav = Packet.alloc(1);
        sav.p2(0x2004); // magic
        sav.p2(2); // version

        sav.p2(this.x);
        sav.p2(this.z);
        sav.p1(this.level);
        for (let i = 0; i < 7; i++) {
            sav.p1(this.body[i]);
        }
        for (let i = 0; i < 5; i++) {
            sav.p1(this.colors[i]);
        }
        sav.p1(this.gender);
        sav.p2(this.runenergy);
        sav.p4(this.playtime);

        for (let i = 0; i < 21; i++) {
            sav.p4(this.stats[i]);
            sav.p1(this.levels[i]);
        }

        sav.p2(this.vars.length);
        for (let i = 0; i < this.vars.length; i++) {
            const type = VarPlayerType.get(i);

            if (type.scope === VarPlayerType.SCOPE_PERM) {
                sav.p4(this.vars[i]);
            } else {
                sav.p4(0);
            }
        }

        let invCount = 0;
        const invStartPos = sav.pos;
        sav.p1(0); // placeholder for saved inventory count
        for (const [typeId, inventory] of this.invs) {
            const invType = InvType.get(typeId);
            if (invType.scope !== InvType.SCOPE_PERM) {
                continue;
            }

            sav.p2(typeId);
            for (let slot = 0; slot < inventory.capacity; slot++) {
                const obj = inventory.get(slot);
                if (!obj) {
                    sav.p2(0);
                    continue;
                }

                sav.p2(obj.id + 1);
                if (obj.count >= 255) {
                    sav.p1(255);
                    sav.p4(obj.count);
                } else {
                    sav.p1(obj.count);
                }
            }
            invCount++;
        }
        // set the total saved inv count as the placeholder
        sav.data[invStartPos] = invCount;

        sav.p4(Packet.getcrc(sav.data, 0, sav.pos));
        const safeName = fromBase37(this.username37);
        sav.save(`data/players/${safeName}.sav`);
        // the sav is released by login server.
        return sav;
    }

    // constructor properties
    username: string;
    username37: bigint;
    displayName: string;
    body: number[];
    colors: number[];
    gender: number;
    runenergy: number = 10000;
    lastRunEnergy: number = -1;
    runweight: number;
    playtime: number;
    stats: Int32Array = new Int32Array(21);
    levels: Uint8Array = new Uint8Array(21);
    vars: Int32Array;
    varsString: string[];
    invs: Map<number, Inventory> = new Map<number, Inventory>();

    // runtime variables
    pid: number = -1;
    uid: number = -1;
    lowMemory: boolean = false;
    webClient: boolean = false;
    combatLevel: number = 3;
    headicons: number = 0;
    appearance: Uint8Array | null = null; // cached appearance
    baseLevels = new Uint8Array(21);
    lastStats: Int32Array = new Int32Array(21); // we track this so we know to flush stats only once a tick on changes
    lastLevels: Uint8Array = new Uint8Array(21); // we track this so we know to flush stats only once a tick on changes
    // build area
    loadedX: number = -1;
    loadedZ: number = -1;
    loadedZones: Record<number, number> = {};
    npcs: Set<number> = new Set(); // observed npcs
    players: Set<number> = new Set(); // observed players
    lastMovement: number = 0; // for p_arrivedelay
    basReadyAnim: number = -1;
    basTurnOnSpot: number = -1;
    basWalkForward: number = -1;
    basWalkBackward: number = -1;
    basWalkLeft: number = -1;
    basWalkRight: number = -1;
    basRunning: number = -1;
    logoutRequested: boolean = false;
    invListeners: {
        type: number; // InvType
        com: number; // Component
        source: number; // uid or -1 for world
        firstSeen: boolean;
    }[] = [];
    allowDesign: boolean = false;
    afkEventReady: boolean = false;

    highPriorityOut: Stack<Packet> = new Stack();
    lowPriorityOut: Stack<Packet> = new Stack();
    lastResponse = -1;

    messageColor: number | null = null;
    messageEffect: number | null = null;
    messageType: number | null = null;
    message: Uint8Array | null = null;

    // ---

    // script variables
    delay = 0;
    queue: LinkList<EntityQueueRequest> = new LinkList();
    weakQueue: LinkList<EntityQueueRequest> = new LinkList();
    engineQueue: LinkList<EntityQueueRequest> = new LinkList();
    cameraPackets: LinkList<CameraInfo> = new LinkList();
    timers: Map<number, EntityTimer> = new Map();
    modalState = 0;
    modalTop = -1;
    lastModalTop = -1;
    modalBottom = -1;
    lastModalBottom = -1;
    modalSidebar = -1;
    lastModalSidebar = -1;
    refreshModalClose = false;
    refreshModal = false;
    modalSticky = -1;
    overlaySide: number[] = new Array(14).fill(-1);
    receivedFirstClose = false; // workaround to not close welcome screen on login

    protect: boolean = false; // whether protected access is available
    activeScript: ScriptState | null = null;
    resumeButtons: number[] = [];

    lastItem: number = -1; // opheld, opheldu, opheldt, inv_button
    lastSlot: number = -1; // opheld, opheldu, opheldt, inv_button, inv_buttond
    lastUseItem: number = -1; // opheldu, opobju, oplocu, opnpcu, opplayeru
    lastUseSlot: number = -1; // opheldu, opobju, oplocu, opnpcu, opplayeru
    lastTargetSlot: number = -1; // inv_buttond
    lastInt: number = -1; // resume_p_countdialog
    lastCom: number = -1; // if_button

    staffModLevel: number = 0;

    heroPoints: {
        uid: number;
        points: number;
    }[] = new Array(16); // be sure to reset when stats are recovered/reset

    constructor(username: string, username37: bigint) {
        super(0, 3094, 3106, 1, 1, EntityLifeCycle.FOREVER, MoveRestrict.NORMAL, BlockWalk.NPC, Player.FACE_COORD, Player.FACE_ENTITY, true); // tutorial island.
        this.username = username;
        this.username37 = username37;
        this.displayName = toDisplayName(username);
        this.vars = new Int32Array(VarPlayerType.count);
        this.varsString = new Array(VarPlayerType.count);
        this.body = [
            0, // hair
            10, // beard
            18, // body
            26, // arms
            33, // gloves
            36, // legs
            42 // boots
        ];
        this.colors = [0, 0, 0, 0, 0];
        this.gender = 0;
        this.runenergy = 10000;
        this.runweight = 0;
        this.playtime = 0;
        this.lastStats.fill(-1);
        this.lastLevels.fill(-1);
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

    resetEntity(respawn: boolean) {
        if (respawn) {
            // if needed for respawning
        }
        super.resetPathingEntity();
        this.repathed = false;
        this.protect = false;
        this.messageColor = null;
        this.messageEffect = null;
        this.messageType = null;
        this.message = null;
    }

    // ----

    onLogin() {
        this.playerLog('Logging in');

        // normalize client between logins
        this.writeLowPriority(ServerProt.IF_CLOSE);
        this.writeHighPriority(ServerProt.UPDATE_UID192, this.pid); // todo: low or high priority
        this.unsetMapFlag();
        this.writeHighPriority(ServerProt.RESET_ANIMS); // todo: low or high priority
        this.resetHeroPoints();

        this.writeHighPriority(ServerProt.RESET_CLIENT_VARCACHE);
        for (let varp = 0; varp < this.vars.length; varp++) {
            const type = VarPlayerType.get(varp);
            const value = this.vars[varp];

            if (type.transmit) {
                if (value < 256) {
                    this.writeHighPriority(ServerProt.VARP_SMALL, varp, value);
                } else {
                    this.writeHighPriority(ServerProt.VARP_LARGE, varp, value);
                }
            }
        }

        const loginTrigger = ScriptProvider.getByTriggerSpecific(ServerTriggerType.LOGIN, -1, -1);
        if (loginTrigger) {
            this.executeScript(ScriptRunner.init(loginTrigger, this), true);
        }

        // play music, multiway, etc
        const moveTrigger = ScriptProvider.getByTriggerSpecific(ServerTriggerType.MOVE, -1, -1);
        if (moveTrigger) {
            const script = ScriptRunner.init(moveTrigger, this);
            this.runScript(script, true);
        }
    }

    calculateRunWeight() {
        this.runweight = 0;

        const invs = this.invs.values();
        for (let i = 0; i < this.invs.size; i++) {
            const inv = invs.next().value;
            if (!inv) {
                continue;
            }

            const invType = InvType.get(inv.type);
            if (!invType || !invType.runweight) {
                continue;
            }

            for (let slot = 0; slot < inv.capacity; slot++) {
                const item = inv.get(slot);
                if (!item) {
                    continue;
                }

                const type = ObjType.get(item.id);
                if (!type || type.stackable) {
                    continue;
                }

                this.runweight += type.weight * item.count;
            }
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    playerLog(message: string, ...args: string[]): void {
        // to be overridden
    }

    processEngineQueue() {
        for (let request = this.engineQueue.head(); request !== null; request = this.engineQueue.next()) {
            const delay = request.delay--;
            if (this.canAccess() && delay <= 0) {
                const script = ScriptRunner.init(request.script, this, null, request.args);
                this.executeScript(script, true);

                request.unlink();
            }
        }
    }

    // ----

    updateMovement(repathAllowed: boolean = true): boolean {
        if (this.containsModalInterface()) {
            return false;
        }

        if (repathAllowed && this.target instanceof PathingEntity && !this.interacted && this.walktrigger === -1) {
            this.pathToPathingTarget();
        }

        if (this.hasWaypoints() && this.walktrigger !== -1 && (!this.protect && !this.delayed())) {
            const trigger = ScriptProvider.get(this.walktrigger);
            this.walktrigger = -1;

            if (trigger) {
                const script = ScriptRunner.init(trigger, this);
                this.runScript(script, true);
            }
        }

        if (this.runenergy < 100) {
            this.setVar(VarPlayerType.PLAYER_RUN, 0);
            this.setVar(VarPlayerType.TEMP_RUN, 0);
        }

        if (this.moveSpeed !== MoveSpeed.INSTANT) {
            this.moveSpeed = this.defaultMoveSpeed();
            if (this.getVar(VarPlayerType.TEMP_RUN)) {
                this.moveSpeed = MoveSpeed.RUN;
            }
        }

        if (!super.processMovement()) {
            // todo: this is running every idle tick
            this.setVar(VarPlayerType.TEMP_RUN, 0);
        }

        const moved = this.lastX !== this.x || this.lastZ !== this.z;
        if (moved) {
            const trigger = ScriptProvider.getByTriggerSpecific(ServerTriggerType.MOVE, -1, -1);

            if (trigger) {
                const script = ScriptRunner.init(trigger, this);
                this.runScript(script, true);
            }

            // run energy drain
            if (!this.delayed() && this.moveSpeed === MoveSpeed.RUN && (Math.abs(this.lastX - this.x) > 1 || Math.abs(this.lastZ - this.z) > 1)) {
                const weightKg = Math.floor(this.runweight / 1000);
                const clampWeight = Math.min(Math.max(weightKg, 0), 64);
                const loss = 67 + (67 * clampWeight) / 64;

                this.runenergy = Math.max(this.runenergy - loss, 0);
                if (this.runenergy === 0) {
                    this.setVar(VarPlayerType.PLAYER_RUN, 0);
                    this.setVar(VarPlayerType.TEMP_RUN, 0);
                }
            }
        }

        if (!this.delayed() && (!moved || this.moveSpeed !== MoveSpeed.RUN) && this.runenergy < 10000) {
            const recovered = this.baseLevels[PlayerStat.AGILITY] / 9 + 8;

            this.runenergy = Math.min(this.runenergy + recovered, 10000);
        }

        return moved;
    }

    blockWalkFlag(): CollisionFlag {
        return CollisionFlag.PLAYER;
    }

    defaultMoveSpeed(): MoveSpeed {
        return this.getVar(VarPlayerType.PLAYER_RUN) ? MoveSpeed.RUN : MoveSpeed.WALK;
    }

    // ----

    closeSticky() {
        if (this.modalSticky !== -1) {
            const closeTrigger = ScriptProvider.getByTrigger(ServerTriggerType.IF_CLOSE, this.modalSticky);
            if (closeTrigger) {
                this.enqueueScript(closeTrigger, PlayerQueueType.ENGINE);
            }

            this.modalSticky = -1;
            this.writeLowPriority(ServerProt.TUTORIAL_OPENCHAT, -1);
        }
    }

    closeModal() {
        if (!this.receivedFirstClose) {
            this.receivedFirstClose = true;
            return;
        }

        this.weakQueue.clear();
        // this.activeScript = null;

        if (!this.delayed()) {
            this.protect = false;
        }

        if (this.modalState === 0) {
            return;
        }

        if (this.modalTop !== -1) {
            const closeTrigger = ScriptProvider.getByTrigger(ServerTriggerType.IF_CLOSE, this.modalTop);
            if (closeTrigger) {
                this.enqueueScript(closeTrigger, PlayerQueueType.ENGINE);
            }

            this.modalTop = -1;
        }

        if (this.modalBottom !== -1) {
            const closeTrigger = ScriptProvider.getByTrigger(ServerTriggerType.IF_CLOSE, this.modalBottom);
            if (closeTrigger) {
                this.enqueueScript(closeTrigger, PlayerQueueType.ENGINE);
            }

            this.modalBottom = -1;
        }

        if (this.modalSidebar !== -1) {
            const closeTrigger = ScriptProvider.getByTrigger(ServerTriggerType.IF_CLOSE, this.modalSidebar);
            if (closeTrigger) {
                this.enqueueScript(closeTrigger, PlayerQueueType.ENGINE);
            }

            this.modalSidebar = -1;
        }

        this.modalState = 0;
        this.refreshModalClose = true;
    }

    delayed() {
        return this.delay > 0;
    }

    containsModalInterface() {
        return (this.modalState & 1) === 1 || (this.modalState & 2) === 2 || (this.modalState & 16) === 16;
    }

    busy() {
        return this.delayed() || this.containsModalInterface();
    }

    canAccess() {
        return !this.protect && !this.busy();
    }

    /**
     *
     * @param script
     * @param {QueueType} type
     * @param delay
     * @param args
     */
    enqueueScript(script: Script, type: QueueType = PlayerQueueType.NORMAL, delay = 0, args: ScriptArgument[] = []) {
        const request = new EntityQueueRequest(type, script, args, delay);
        if (type === PlayerQueueType.ENGINE) {
            request.delay = 0;
            this.engineQueue.addTail(request);
        } else if (type === PlayerQueueType.WEAK) {
            this.weakQueue.addTail(request);
        } else {
            this.queue.addTail(request);
        }
    }

    processQueues() {
        // the presence of a strong script closes modals before anything runs regardless of the order
        let hasStrong: boolean = false;
        for (let request = this.queue.head(); request !== null; request = this.queue.next()) {
            if (request.type === PlayerQueueType.STRONG) {
                hasStrong = true;
                break;
            }
        }
        if (hasStrong) {
            this.closeModal();
        }

        this.processQueue();
        this.processWeakQueue();
    }

    processQueue() {
        // there is a quirk with their LinkList impl that results in a queue speedup bug:
        // in .head() the next link is cached. on the next iteration, next() will use this cached value, even if it's null
        // regardless of whether the end of the list has been reached (i.e. the previous iteration added to the end of the list)
        // - thank you De0 for the explanation
        // essentially, if a script is before the end of the list, it can be processed this tick and result in inconsistent queue timing (authentic)
        for (let request = this.queue.head(); request !== null; request = this.queue.next()) {
            if (request.type === PlayerQueueType.STRONG) {
                this.closeModal();
            }

            const delay = request.delay--;
            if (this.canAccess() && delay <= 0) {
                const script = ScriptRunner.init(request.script, this, null, request.args);
                this.executeScript(script, true);
                request.unlink();
            }
        }
    }

    processWeakQueue() {
        for (let request = this.weakQueue.head(); request !== null; request = this.weakQueue.next()) {
            const delay = request.delay--;
            if (this.canAccess() && delay <= 0) {
                const script = ScriptRunner.init(request.script, this, null, request.args);
                this.executeScript(script, true);
                request.unlink();
            }
        }
    }

    setTimer(type: PlayerTimerType, script: Script, args: ScriptArgument[] = [], interval: number) {
        const timerId = script.id;
        const timer = {
            type,
            script,
            args,
            interval,
            clock: interval
        };

        this.timers.set(timerId, timer);
    }

    clearTimer(timerId: number) {
        this.timers.delete(timerId);
    }

    processTimers(type: PlayerTimerType) {
        for (const timer of this.timers.values()) {
            if (type !== timer.type) {
                continue;
            }

            // only execute if it's time and able
            // soft timers can execute while busy, normal cannot
            if (--timer.clock <= 0 && (timer.type === PlayerTimerType.SOFT || this.canAccess())) {
                // set clock back to interval
                timer.clock = timer.interval;

                const script = ScriptRunner.init(timer.script, this, null, timer.args);
                this.runScript(script, timer.type === PlayerTimerType.NORMAL);
            }
        }
    }

    // clear current interaction and walk queue
    stopAction() {
        this.clearPendingAction();
        this.unsetMapFlag();
    }

    // clear current interaction but leave walk queue intact
    clearPendingAction() {
        this.clearInteraction();
        this.closeModal();
    }

    hasInteraction() {
        return this.target !== null;
    }

    getOpTrigger() {
        if (!this.target) {
            return null;
        }

        let typeId = -1;
        let categoryId = -1;

        // prio trigger details by target<type<com
        if (this.target instanceof Npc || this.target instanceof Loc || this.target instanceof Obj) {
            const type = this.target instanceof Npc ? NpcType.get(this.target.type) : this.target instanceof Loc ? LocType.get(this.target.type) : ObjType.get(this.target.type);
            typeId = type.id;
            categoryId = type.category;
        }
        if (this.targetSubject.type !== -1) {
            typeId = this.targetSubject.type;
        }
        if (this.targetSubject.com !== -1) {
            typeId = this.targetSubject.com;
        }

        return ScriptProvider.getByTrigger(this.targetOp + 7, typeId, categoryId) ?? null;
    }

    getApTrigger() {
        if (!this.target) {
            return null;
        }

        let typeId = -1;
        let categoryId = -1;

        // prio trigger details by target<type<com
        if (this.target instanceof Npc || this.target instanceof Loc || this.target instanceof Obj) {
            const type = this.target instanceof Npc ? NpcType.get(this.target.type) : this.target instanceof Loc ? LocType.get(this.target.type) : ObjType.get(this.target.type);
            typeId = type.id;
            categoryId = type.category;
        }
        if (this.targetSubject.type !== -1) {
            typeId = this.targetSubject.type;
        }
        if (this.targetSubject.com !== -1) {
            typeId = this.targetSubject.com;
        }

        return ScriptProvider.getByTrigger(this.targetOp, typeId, categoryId) ?? null;
    }

    processInteraction() {
        if (this.target === null || !this.canAccess()) {
            this.updateMovement();
            return;
        }

        if (this.target.level !== this.level) {
            this.clearInteraction();
            this.unsetMapFlag(); // assuming its right
            return;
        }

        if (this.target instanceof Npc && (World.getNpc(this.target.nid) === null || this.target.delayed())) {
            this.clearInteraction();
            this.unsetMapFlag();
            return;
        }

        // this is effectively checking if the npc did a changetype
        if (this.target instanceof Npc && this.targetSubject.type !== -1 && World.getNpcByUid((this.targetSubject.type << 16) | this.target.nid) === null) {
            this.clearInteraction();
            this.unsetMapFlag();
            return;
        }

        if (this.target instanceof Obj && World.getObj(this.target.x, this.target.z, this.level, this.target.type) === null) {
            this.clearInteraction();
            this.unsetMapFlag();
            return;
        }

        if (this.target instanceof Loc && World.getLoc(this.target.x, this.target.z, this.level, this.target.type) === null) {
            this.clearInteraction();
            this.unsetMapFlag();
            return;
        }

        const opTrigger = this.getOpTrigger();
        const apTrigger = this.getApTrigger();

        // console.log('operable', opTrigger != null, 'trigger exists', this.inOperableDistance(this.target), 'in range');
        // console.log('approachable', apTrigger != null, 'trigger exists', this.inApproachDistance(this.apRange, this.target), 'in range');

        if (opTrigger && this.target instanceof PathingEntity && this.inOperableDistance(this.target)) {
            const target = this.target;
            this.target = null;

            this.executeScript(ScriptRunner.init(opTrigger, this, target), true);

            if (this.target === null) {
                this.unsetMapFlag();
            }

            this.interacted = true;
            this.clearWaypoints();
        } else if (apTrigger && this.inApproachDistance(this.apRange, this.target)) {
            const target = this.target;
            this.target = null;

            this.executeScript(ScriptRunner.init(apTrigger, this, target), true);

            // if aprange was called then we did not interact.
            if (this.apRangeCalled) {
                this.target = target;
            } else {
                this.clearWaypoints();
                this.interacted = true;
            }

            if (this.target === null) {
                this.unsetMapFlag();
            }
        } else if (this.target instanceof PathingEntity && this.inOperableDistance(this.target)) {
            if (Environment.LOCAL_DEV && !opTrigger && !apTrigger) {
                let debugname = '_';
                if (this.target instanceof Npc) {
                    if (this.targetSubject.com !== -1 && this.targetOp === ServerTriggerType.APNPCT || this.targetOp === ServerTriggerType.OPNPCT) {
                        debugname = Component.get(this.targetSubject.com)?.comName ?? this.targetSubject.toString();
                    } else {
                        debugname = NpcType.get(this.target.type)?.debugname ?? this.target.type.toString();
                    }
                } else if (this.target instanceof Loc) {
                    debugname = LocType.get(this.target.type)?.debugname ?? this.target.type.toString();
                } else if (this.target instanceof Obj) {
                    debugname = ObjType.get(this.target.type)?.debugname ?? this.target.type.toString();
                } else if (this.targetSubject.com !== -1 && this.targetOp === ServerTriggerType.APNPCT || this.targetOp === ServerTriggerType.APPLAYERT || this.targetOp === ServerTriggerType.APLOCT || this.targetOp === ServerTriggerType.APOBJT) {
                    debugname = Component.get(this.targetSubject.com)?.comName ?? this.targetSubject.toString();
                } else if (this.targetSubject.type !== -1) {
                    debugname = ObjType.get(this.targetSubject.type)?.debugname ?? this.targetSubject.toString();
                }

                this.messageGame(`No trigger for [${ServerTriggerType[this.targetOp + 7].toLowerCase()},${debugname}]`);
            }

            this.target = null;
            this.messageGame('Nothing interesting happens.');
            this.interacted = true;
            this.clearWaypoints();
        }

        const moved: boolean = this.updateMovement();
        if (moved) {
            // we need to keep the mask if the player had to move.
            this.alreadyFacedEntity = false;
            this.alreadyFacedCoord = false;
            this.lastMovement = World.currentTick + 1;
        }

        if (this.target && (!this.interacted || this.apRangeCalled)) {
            this.interacted = false;

            if (opTrigger && (this.target instanceof PathingEntity || !moved) && this.inOperableDistance(this.target)) {

                const target = this.target;
                this.target = null;

                this.executeScript(ScriptRunner.init(opTrigger, this, target), true);

                if (this.target === null) {
                    this.unsetMapFlag();
                }

                this.interacted = true;
                this.clearWaypoints();
            } else if (apTrigger && this.inApproachDistance(this.apRange, this.target)) {
                this.apRangeCalled = false;

                const target = this.target;
                this.target = null;

                this.executeScript(ScriptRunner.init(apTrigger, this, target), true);

                // if aprange was called then we did not interact.
                if (this.apRangeCalled) {
                    this.target = target;
                } else {
                    this.clearWaypoints();
                    this.interacted = true;
                }

                if (this.target === null) {
                    this.unsetMapFlag();
                }
            } else if ((this.target instanceof PathingEntity || !moved) && this.inOperableDistance(this.target)) {
                if (Environment.LOCAL_DEV && !opTrigger && !apTrigger) {
                    let debugname = '_';
                    if (this.target instanceof Npc) {
                        debugname = NpcType.get(this.target.type)?.debugname ?? this.target.type.toString();
                    } else if (this.target instanceof Loc) {
                        debugname = LocType.get(this.target.type)?.debugname ?? this.target.type.toString();
                    } else if (this.target instanceof Obj) {
                        debugname = ObjType.get(this.target.type)?.debugname ?? this.target.type.toString();
                    } else if (this.targetSubject.com !== -1 && this.targetOp === ServerTriggerType.APNPCT || this.targetOp === ServerTriggerType.APPLAYERT || this.targetOp === ServerTriggerType.APLOCT || this.targetOp === ServerTriggerType.APOBJT) {
                        debugname = Component.get(this.targetSubject.com)?.comName ?? this.targetSubject.toString();
                    } else if (this.targetSubject.type !== -1) {
                        debugname = ObjType.get(this.targetSubject.type)?.debugname ?? this.targetSubject.toString();
                    }

                    this.messageGame(`No trigger for [${ServerTriggerType[this.targetOp + 7].toLowerCase()},${debugname}]`);
                }

                this.target = null;
                this.messageGame('Nothing interesting happens.');
                this.interacted = true;
                this.clearWaypoints();
            }
        }

        if (!this.interacted && !this.hasWaypoints() && !moved) {
            this.messageGame("I can't reach that!");
            this.clearInteraction();
        }

        if (this.interacted && !this.apRangeCalled && this.target === null) {
            this.clearInteraction();
        }
    }

    // ----

    updateMap() {
        const dx = Math.abs(this.x - this.loadedX);
        const dz = Math.abs(this.z - this.loadedZ);

        // if the build area should be regenerated, do so now
        const { tele } = this.getMovementDir(); // wasteful but saves time on loading lines
        if (dx >= 36 || dz >= 36 || (tele && (Position.zone(this.x) !== Position.zone(this.loadedX) || Position.zone(this.z) !== Position.zone(this.loadedZ)))) {
            this.rebuildNormal(Position.zone(this.x), Position.zone(this.z));

            this.loadedX = this.x;
            this.loadedZ = this.z;
            this.loadedZones = {};
        }
        for (let info = this.cameraPackets.head(); info !== null; info = this.cameraPackets.next()) {
            const localX = info.camX - Position.zoneOrigin(this.loadedX);
            const localZ = info.camZ - Position.zoneOrigin(this.loadedZ);
            this.writeLowPriority(info.type, localX, localZ, info.height, info.rotationSpeed, info.rotationMultiplier);
            info.unlink();
        }

        if (this.moveSpeed === MoveSpeed.INSTANT && this.jump) {
            this.loadedZones = {};
        }
    }

    updateZones() {
        // check nearby zones for updates
        const centerX = Position.zone(this.x);
        const centerZ = Position.zone(this.z);

        const leftX = Position.zone(this.loadedX) - 6;
        const rightX = Position.zone(this.loadedX) + 6;
        const topZ = Position.zone(this.loadedZ) + 6;
        const bottomZ = Position.zone(this.loadedZ) - 6;

        // update 3 zones around the player
        for (let x = centerX - 3; x <= centerX + 3; x++) {
            for (let z = centerZ - 3; z <= centerZ + 3; z++) {
                // check if the zone is within the build area
                if (x < leftX || x > rightX || z > topZ || z < bottomZ) {
                    continue;
                }

                const zone = World.getZone(x << 3, z << 3, this.level);

                // todo: receiver/shared buffer logic
                if (typeof this.loadedZones[zone.index] === 'undefined') {
                    // full update necessary to clear client zone memory
                    this.writeHighPriority(ServerProt.UPDATE_ZONE_FULL_FOLLOWS, x, z, this.loadedX, this.loadedZ);
                    this.loadedZones[zone.index] = -1; // note: flash appears when changing floors
                }

                const updates = World.getUpdates(zone.index).filter((event: ZoneEvent): boolean => {
                    return event.tick > this.loadedZones[zone.index];
                });

                if (updates.length) {
                    this.writeHighPriority(ServerProt.UPDATE_ZONE_PARTIAL_FOLLOWS, x, z, this.loadedX, this.loadedZ);

                    for (let i = 0; i < updates.length; i++) {
                        // have to copy because encryption will be applied to buffer
                        const data = updates[i].buffer;
                        const out = new Packet(new Uint8Array(data.data.length));
                        const pos = data.pos;
                        data.pos = 0;
                        data.gdata(out.data, 0, out.data.length);
                        data.pos = pos;
                        out.pos = pos;

                        // the packet is released elsewhere.
                        this.highPriorityOut.push(out);
                    }
                }

                this.loadedZones[zone.index] = World.currentTick;
            }
        }
    }

    // ----

    isWithinDistance(other: Entity) {
        const dx = Math.abs(this.x - other.x);
        const dz = Math.abs(this.z - other.z);

        return dz < 16 && dx < 16 && this.level == other.level;
    }

    getNearbyPlayers(): number[] {
        const centerX = Position.zone(this.x);
        const centerZ = Position.zone(this.z);

        const leftX = Position.zone(this.loadedX) - 6;
        const rightX = Position.zone(this.loadedX) + 6;
        const topZ = Position.zone(this.loadedZ) + 6;
        const bottomZ = Position.zone(this.loadedZ) - 6;

        // +/- 52 results in visibility at the border
        const absLeftX = this.loadedX - 48;
        const absRightX = this.loadedX + 48;
        const absTopZ = this.loadedZ + 48;
        const absBottomZ = this.loadedZ - 48;

        // update 2 zones around the player
        const nearby = [];
        for (let x = centerX - 2; x <= centerX + 2; x++) {
            for (let z = centerZ - 2; z <= centerZ + 2; z++) {
                // check if the zone is within the build area
                if (x < leftX || x > rightX || z > topZ || z < bottomZ) {
                    continue;
                }

                const { players } = World.getZone(x << 3, z << 3, this.level);

                for (const uid of players) {
                    const player = World.getPlayerByUid(uid);
                    if (player === null || uid === this.uid || player.x < absLeftX || player.x >= absRightX || player.z >= absTopZ || player.z < absBottomZ) {
                        continue;
                    }

                    if (this.isWithinDistance(player)) {
                        nearby.push(uid);
                    }
                }
            }
        }

        return nearby;
    }

    updatePlayers() {
        const nearby = this.getNearbyPlayers();

        const bitBlock = Packet.alloc(1);
        const byteBlock = Packet.alloc(1);

        // temp variables to convert movement operations
        const { walkDir, runDir, tele } = this.getMovementDir();

        // update local player
        bitBlock.bits();
        bitBlock.pBit(1, tele || walkDir !== -1 || runDir !== -1 || this.mask > 0 ? 1 : 0);
        if (tele) {
            bitBlock.pBit(2, 3);
            bitBlock.pBit(2, this.level);
            bitBlock.pBit(7, Position.local(this.x));
            bitBlock.pBit(7, Position.local(this.z));
            bitBlock.pBit(1, this.jump ? 1 : 0);
            bitBlock.pBit(1, this.mask > 0 ? 1 : 0);
        } else if (runDir !== -1) {
            bitBlock.pBit(2, 2);
            bitBlock.pBit(3, walkDir);
            bitBlock.pBit(3, runDir);
            bitBlock.pBit(1, this.mask > 0 ? 1 : 0);
        } else if (walkDir !== -1) {
            bitBlock.pBit(2, 1);
            bitBlock.pBit(3, walkDir);
            bitBlock.pBit(1, this.mask > 0 ? 1 : 0);
        } else if (this.mask > 0) {
            bitBlock.pBit(2, 0);
        }

        if (this.mask > 0) {
            this.writeUpdate(this, byteBlock, true);
        }

        // update other players (255 max - 8 bits)
        bitBlock.pBit(8, this.players.size);

        for (const uid of this.players) {
            const player = World.getPlayerByUid(uid);

            const loggedOut = !player;
            const notNearby = nearby.findIndex(p => p === uid) === -1;

            if (loggedOut || notNearby) {
                bitBlock.pBit(1, 1);
                bitBlock.pBit(2, 3);
                this.players.delete(uid);
                continue;
            }

            const { walkDir, runDir, tele } = player.getMovementDir();
            if (tele) {
                // player full teleported, so needs to be removed and re-added
                bitBlock.pBit(1, 1);
                bitBlock.pBit(2, 3);
                this.players.delete(uid);
                continue;
            }

            let hasMaskUpdate = player.mask > 0;

            const bitBlockBytes = ((bitBlock.bitPos + 7) / 8) >>> 0;
            if (bitBlockBytes + byteBlock.pos + player.calculateUpdateSize(false, false) > 5000) {
                hasMaskUpdate = false;
            }

            bitBlock.pBit(1, walkDir !== -1 || runDir !== -1 || hasMaskUpdate ? 1 : 0);
            if (runDir !== -1) {
                bitBlock.pBit(2, 2);
                bitBlock.pBit(3, walkDir);
                bitBlock.pBit(3, runDir);
                bitBlock.pBit(1, hasMaskUpdate ? 1 : 0);
            } else if (walkDir !== -1) {
                bitBlock.pBit(2, 1);
                bitBlock.pBit(3, walkDir);
                bitBlock.pBit(1, hasMaskUpdate ? 1 : 0);
            } else if (hasMaskUpdate) {
                bitBlock.pBit(2, 0);
            }

            if (hasMaskUpdate) {
                player.writeUpdate(this, byteBlock);
            }
        }

        // add new players
        // todo: add based on distance radius that shrinks if too many players are visible?
        for (let i = 0; i < nearby.length && this.players.size < 255; i++) {
            const uid = nearby[i];
            if (this.players.has(uid)) {
                continue;
            }

            const player = World.getPlayerByUid(uid);
            if (player === null) {
                continue;
            }

            // todo: tele optimization (not re-sending appearance block for recently observed players (they stay in memory))
            const hasInitialUpdate = true;

            const bitBlockSize = bitBlock.bitPos + 11 + 5 + 5 + 1 + 1;
            const bitBlockBytes = ((bitBlockSize + 7) / 8) >>> 0;
            if (bitBlockBytes + byteBlock.pos + player.calculateUpdateSize(false, true) > 5000) {
                // more players get added next tick
                break;
            }

            bitBlock.pBit(11, player.pid);
            bitBlock.pBit(5, player.x - this.x);
            bitBlock.pBit(5, player.z - this.z);
            bitBlock.pBit(1, player.jump ? 1 : 0);
            bitBlock.pBit(1, hasInitialUpdate ? 1 : 0);

            if (hasInitialUpdate) {
                player.writeUpdate(this, byteBlock, false, true);
            }

            this.players.add(player.uid);
        }

        if (byteBlock.pos > 0) {
            bitBlock.pBit(11, 2047);
        }

        bitBlock.bytes();

        // const debug = new Packet();
        // debug.pdata(bitBlock);
        // debug.pdata(byteBlock);
        // debug.save('dump/' + World.currentTick + '.' + this.username + '.player.bin');
        this.writeHighPriority(ServerProt.PLAYER_INFO, bitBlock, byteBlock);
    }

    getAppearanceInSlot(slot: number) {
        let part = -1;
        if (slot === 8) {
            part = this.body[0];
        } else if (slot === 11) {
            part = this.body[1];
        } else if (slot === 4) {
            part = this.body[2];
        } else if (slot === 6) {
            part = this.body[3];
        } else if (slot === 9) {
            part = this.body[4];
        } else if (slot === 7) {
            part = this.body[5];
        } else if (slot === 10) {
            part = this.body[6];
        }

        if (part === -1) {
            return 0;
        } else {
            return 0x100 + part;
        }
    }

    getCombatLevel() {
        const base = 0.25 * (this.baseLevels[PlayerStat.DEFENCE] + this.baseLevels[PlayerStat.HITPOINTS] + Math.floor(this.baseLevels[PlayerStat.PRAYER] / 2));
        const melee = 0.325 * (this.baseLevels[PlayerStat.ATTACK] + this.baseLevels[PlayerStat.STRENGTH]);
        const range = 0.325 * (Math.floor(this.baseLevels[PlayerStat.RANGED] / 2) + this.baseLevels[PlayerStat.RANGED]);
        const magic = 0.325 * (Math.floor(this.baseLevels[PlayerStat.MAGIC] / 2) + this.baseLevels[PlayerStat.MAGIC]);
        return Math.floor(base + Math.max(melee, range, magic));
    }

    generateAppearance(inv: number) {
        const stream = Packet.alloc(0);

        stream.p1(this.gender);
        stream.p1(this.headicons);

        const skippedSlots = [];

        let worn = this.getInventory(inv);
        if (!worn) {
            worn = new Inventory(0);
        }

        for (let i = 0; i < worn.capacity; i++) {
            const equip = worn.get(i);
            if (!equip) {
                continue;
            }

            const config = ObjType.get(equip.id);

            if (config.wearpos2 !== -1) {
                if (skippedSlots.indexOf(config.wearpos2) === -1) {
                    skippedSlots.push(config.wearpos2);
                }
            }

            if (config.wearpos3 !== -1) {
                if (skippedSlots.indexOf(config.wearpos3) === -1) {
                    skippedSlots.push(config.wearpos3);
                }
            }
        }

        for (let slot = 0; slot < 12; slot++) {
            if (skippedSlots.indexOf(slot) !== -1) {
                stream.p1(0);
                continue;
            }

            const equip = worn.get(slot);
            if (!equip) {
                const appearanceValue = this.getAppearanceInSlot(slot);
                if (appearanceValue < 1) {
                    stream.p1(0);
                } else {
                    stream.p2(appearanceValue);
                }
            } else {
                stream.p2(0x200 + equip.id);
            }
        }

        for (let i = 0; i < this.colors.length; i++) {
            stream.p1(this.colors[i]);
        }

        stream.p2(this.basReadyAnim);
        stream.p2(this.basTurnOnSpot);
        stream.p2(this.basWalkForward);
        stream.p2(this.basWalkBackward);
        stream.p2(this.basWalkLeft);
        stream.p2(this.basWalkRight);
        stream.p2(this.basRunning);

        stream.p8(this.username37);
        stream.p1(this.combatLevel);

        this.mask |= Player.APPEARANCE;

        this.appearance = new Uint8Array(stream.pos);
        stream.pos = 0;
        stream.gdata(this.appearance, 0, this.appearance.length);
        stream.release();
    }

    calculateUpdateSize(self = false, newlyObserved = false) {
        let length = 0;
        let mask = this.mask;
        if (newlyObserved) {
            mask |= Player.APPEARANCE;
        }
        if (newlyObserved && (this.orientation != -1 || this.faceX != -1 || this.faceZ != -1)) {
            mask |= Player.FACE_COORD;
        }
        if (newlyObserved && this.faceEntity != -1) {
            mask |= Player.FACE_ENTITY;
        }

        if (mask > 0xff) {
            mask |= Player.BIG_UPDATE;
        }

        if (self && mask & Player.CHAT) {
            // don't echo back local chat
            mask &= ~Player.CHAT;
        }

        length += 1;
        if (mask & Player.BIG_UPDATE) {
            length += 1;
        }

        if (mask & Player.APPEARANCE) {
            length += 1;
            length += this.appearance?.length ?? 0;
        }

        if (mask & Player.ANIM) {
            length += 3;
        }

        if (mask & Player.FACE_ENTITY) {
            length += 2;
        }

        if (mask & Player.SAY) {
            length += this.chat?.length ?? 0;
        }

        if (mask & Player.DAMAGE) {
            length += 4;
        }

        if (mask & Player.FACE_COORD) {
            length += 4;
        }

        if (mask & Player.CHAT) {
            length += 4;
            length += this.message?.length ?? 0;
        }

        if (mask & Player.SPOTANIM) {
            length += 6;
        }

        if (mask & Player.EXACT_MOVE) {
            length += 9;
        }

        return length;
    }

    writeUpdate(observer: Player, out: Packet, self = false, newlyObserved = false) {
        let mask = this.mask;
        if (newlyObserved) {
            mask |= Player.APPEARANCE;
        }
        if (newlyObserved && (this.orientation != -1 || this.faceX != -1 || this.faceZ != -1)) {
            mask |= Player.FACE_COORD;
        }
        if (newlyObserved && this.faceEntity != -1) {
            mask |= Player.FACE_ENTITY;
        }

        if (mask > 0xff) {
            mask |= Player.BIG_UPDATE;
        }

        if (self && mask & Player.CHAT) {
            // don't echo back local chat
            mask &= ~Player.CHAT;
        }

        out.p1(mask & 0xff);
        if (mask & Player.BIG_UPDATE) {
            out.p1(mask >> 8);
        }

        if (mask & Player.APPEARANCE) {
            out.p1(this.appearance!.length);
            out.pdata(this.appearance!, 0, this.appearance!.length);
        }

        if (mask & Player.ANIM) {
            out.p2(this.animId);
            out.p1(this.animDelay);
        }

        if (mask & Player.FACE_ENTITY) {
            if (this.faceEntity !== -1) {
                this.alreadyFacedEntity = true;
            }

            out.p2(this.faceEntity);
        }

        if (mask & Player.SAY) {
            out.pjstr(this.chat);
        }

        if (mask & Player.DAMAGE) {
            out.p1(this.damageTaken);
            out.p1(this.damageType);
            out.p1(this.levels[PlayerStat.HITPOINTS]);
            out.p1(this.baseLevels[PlayerStat.HITPOINTS]);
        }

        if (mask & Player.FACE_COORD) {
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

        if (mask & Player.CHAT) {
            out.p1(this.messageColor!);
            out.p1(this.messageEffect!);
            out.p1(this.messageType!);

            out.p1(this.message!.length);
            out.pdata(this.message!, 0, this.message!.length);
        }

        if (mask & Player.SPOTANIM) {
            out.p2(this.graphicId);
            out.p2(this.graphicHeight);
            out.p2(this.graphicDelay);
        }

        if (mask & Player.EXACT_MOVE) {
            out.p1(this.exactStartX - Position.zoneOrigin(observer.loadedX));
            out.p1(this.exactStartZ - Position.zoneOrigin(observer.loadedZ));
            out.p1(this.exactEndX - Position.zoneOrigin(observer.loadedX));
            out.p1(this.exactEndZ - Position.zoneOrigin(observer.loadedZ));
            out.p2(this.exactMoveStart);
            out.p2(this.exactMoveEnd);
            out.p1(this.exactMoveDirection);
        }
    }

    // ----

    getNearbyNpcs(): number[] {
        const centerX = Position.zone(this.x);
        const centerZ = Position.zone(this.z);

        const leftX = Position.zone(this.loadedX) - 6;
        const rightX = Position.zone(this.loadedX) + 6;
        const topZ = Position.zone(this.loadedZ) + 6;
        const bottomZ = Position.zone(this.loadedZ) - 6;

        // +/- 52 results in visibility at the border
        const absLeftX = this.loadedX - 48;
        const absRightX = this.loadedX + 48;
        const absTopZ = this.loadedZ + 48;
        const absBottomZ = this.loadedZ - 48;

        // update 2 zones around the player
        const nearby = [];
        for (let x = centerX - 2; x <= centerX + 2; x++) {
            for (let z = centerZ - 2; z <= centerZ + 2; z++) {
                // check if the zone is within the build area
                if (x < leftX || x > rightX || z > topZ || z < bottomZ) {
                    continue;
                }

                const { npcs } = World.getZone(x << 3, z << 3, this.level);

                for (const nid of npcs) {
                    const npc = World.getNpc(nid);
                    if (npc === null || !npc.checkLifeCycle(World.currentTick) || npc.x < absLeftX || npc.x >= absRightX || npc.z >= absTopZ || npc.z < absBottomZ) {
                        continue;
                    }

                    if (this.isWithinDistance(npc)) {
                        nearby.push(nid);
                    }
                }
            }
        }

        return nearby;
    }

    updateNpcs() {
        const nearby = this.getNearbyNpcs();

        const bitBlock = Packet.alloc(1);
        const byteBlock = Packet.alloc(1);

        // update existing npcs (255 max - 8 bits)
        bitBlock.bits();
        bitBlock.pBit(8, this.npcs.size);

        for (const nid of this.npcs) {
            const npc = World.getNpc(nid);

            const despawned = !npc;
            const notNearby = nearby.findIndex(n => n === nid) === -1;

            if (despawned || notNearby) {
                bitBlock.pBit(1, 1);
                bitBlock.pBit(2, 3);
                this.npcs.delete(nid);
                continue;
            }

            const { walkDir, runDir, tele } = npc.getMovementDir();
            if (tele) {
                // npc full teleported, so needs to be removed and re-added
                bitBlock.pBit(1, 1);
                bitBlock.pBit(2, 3);
                this.npcs.delete(nid);
                continue;
            }

            let hasMaskUpdate = npc.mask > 0;

            const bitBlockBytes = ((bitBlock.bitPos + 7) / 8) >>> 0;
            if (bitBlockBytes + byteBlock.pos + npc.calculateUpdateSize(false) > 5000) {
                hasMaskUpdate = false;
            }

            bitBlock.pBit(1, runDir !== -1 || walkDir !== -1 || hasMaskUpdate ? 1 : 0);
            if (runDir !== -1) {
                bitBlock.pBit(2, 2);
                bitBlock.pBit(3, walkDir);
                bitBlock.pBit(3, runDir);
                bitBlock.pBit(1, hasMaskUpdate ? 1 : 0);
            } else if (walkDir !== -1) {
                bitBlock.pBit(2, 1);
                bitBlock.pBit(3, walkDir);
                bitBlock.pBit(1, hasMaskUpdate ? 1 : 0);
            } else if (hasMaskUpdate) {
                bitBlock.pBit(2, 0);
            }

            if (hasMaskUpdate) {
                npc.writeUpdate(byteBlock, false);
            }
        }

        // add new npcs
        for (let i = 0; i < nearby.length && this.npcs.size < 255; i++) {
            const nid = nearby[i];
            if (this.npcs.has(nid)) {
                continue;
            }

            const npc = World.getNpc(nid);
            if (npc === null) {
                continue;
            }

            const hasInitialUpdate = npc.mask > 0 || npc.orientation !== -1 || npc.faceX !== -1 || npc.faceZ !== -1 || npc.faceEntity !== -1;

            const bitBlockSize = bitBlock.bitPos + 13 + 11 + 5 + 5 + 1;
            const bitBlockBytes = ((bitBlockSize + 7) / 8) >>> 0;
            if (bitBlockBytes + byteBlock.pos + npc.calculateUpdateSize(true) > 5000) {
                // more npcs get added next tick
                break;
            }

            bitBlock.pBit(13, npc.nid);
            bitBlock.pBit(11, npc.type);
            bitBlock.pBit(5, npc.x - this.x);
            bitBlock.pBit(5, npc.z - this.z);
            bitBlock.pBit(1, hasInitialUpdate ? 1 : 0);

            this.npcs.add(npc.nid);

            if (hasInitialUpdate) {
                npc.writeUpdate(byteBlock, true);
            }
        }

        if (byteBlock.pos > 0) {
            bitBlock.pBit(13, 8191);
        }

        bitBlock.bytes();

        // const debug = new Packet();
        // debug.pdata(bitBlock);
        // debug.pdata(byteBlock);
        // debug.save('dump/' + World.currentTick + '.' + this.username + '.npc.bin');
        this.writeHighPriority(ServerProt.NPC_INFO, bitBlock, byteBlock);
    }

    updateStats() {
        for (let i = 0; i < this.stats.length; i++) {
            if (this.stats[i] !== this.lastStats[i] || this.levels[i] !== this.lastLevels[i]) {
                this.writeLowPriority(ServerProt.UPDATE_STAT, i, this.stats[i], this.levels[i]);
                this.lastStats[i] = this.stats[i];
                this.lastLevels[i] = this.levels[i];
            }
        }

        if (Math.floor(this.runenergy) / 100 !== Math.floor(this.lastRunEnergy) / 100) {
            this.writeLowPriority(ServerProt.UPDATE_RUNENERGY, this.runenergy);
            this.lastRunEnergy = this.runenergy;
        }
    }

    // ----

    getInventoryFromListener(listener: any) {
        if (listener.source === -1) {
            return World.getInventory(listener.type);
        } else {
            const player = World.getPlayerByUid(listener.source);
            if (!player) {
                return null;
            }

            return player.getInventory(listener.type);
        }
    }

    // todo: partial updates
    updateInvs() {
        let runWeightChanged = false;

        for (let i = 0; i < this.invListeners.length; i++) {
            const listener = this.invListeners[i];
            if (!listener) {
                continue;
            }

            if (listener.source === -1) {
                // world inventory
                const inv = World.getInventory(listener.type);
                if (!inv) {
                    continue;
                }

                if (inv.update || listener.firstSeen) {
                    this.writeHighPriority(ServerProt.UPDATE_INV_FULL, listener.com, inv);
                    listener.firstSeen = false;
                }
            } else {
                // player inventory
                const player = World.getPlayerByUid(listener.source);
                if (!player) {
                    continue;
                }

                const inv = player.getInventory(listener.type);
                if (!inv) {
                    continue;
                }

                if (inv.update || listener.firstSeen) {
                    this.writeHighPriority(ServerProt.UPDATE_INV_FULL, listener.com, inv);
                    listener.firstSeen = false;

                    const invType = InvType.get(listener.type);
                    if (invType.runweight) {
                        runWeightChanged = true;
                    }
                }
            }
        }

        if (runWeightChanged) {
            const current = this.runweight;
            this.calculateRunWeight();
            runWeightChanged = current !== this.runweight;
        }

        if (runWeightChanged) {
            this.writeLowPriority(ServerProt.UPDATE_RUNWEIGHT, Math.ceil(this.runweight / 1000));
        }
    }

    getInventory(inv: number): Inventory | null {
        if (inv === -1) {
            return null;
        }

        const invType = InvType.get(inv);
        let container = null;

        if (!invType) {
            return null;
        }

        if (invType.scope === InvType.SCOPE_SHARED) {
            container = World.getInventory(inv);
        } else {
            container = this.invs.get(inv);

            if (!container) {
                container = Inventory.fromType(inv);
                this.invs.set(inv, container);
            }
        }

        return container;
    }

    invListenOnCom(inv: number, com: number, source: number) {
        if (inv === -1) {
            return;
        }

        const index = this.invListeners.findIndex(l => l.type === inv && l.com === com);
        if (index !== -1) {
            // already listening
            return;
        }

        const invType = InvType.get(inv);
        if (invType.scope === InvType.SCOPE_SHARED) {
            source = -1;
        }

        this.invListeners.push({ type: inv, com, source, firstSeen: true });
    }

    invStopListenOnCom(com: number) {
        const index = this.invListeners.findIndex(l => l.com === com);
        if (index === -1) {
            return;
        }

        this.invListeners.splice(index, 1);
        this.writeHighPriority(ServerProt.UPDATE_INV_STOP_TRANSMIT, com);
    }

    invGetSlot(inv: number, slot: number) {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invGetSlot: Invalid inventory type: ' + inv);
        }

        if (!container.validSlot(slot)) {
            throw new Error('invGetSlot: Invalid slot: ' + slot);
        }

        return container.get(slot);
    }

    invClear(inv: number) {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invClear: Invalid inventory type: ' + inv);
        }

        container.removeAll();
    }

    invAdd(inv: number, obj: number, count: number, assureFullInsertion: boolean = true): number {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invAdd: Invalid inventory type: ' + inv);
        }

        const transaction = container.add(obj, count, -1, assureFullInsertion);
        return transaction.completed;
    }

    invSet(inv: number, obj: number, count: number, slot: number) {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invSet: Invalid inventory type: ' + inv);
        }

        if (!container.validSlot(slot)) {
            throw new Error('invSet: Invalid slot: ' + slot);
        }

        container.set(slot, { id: obj, count });
    }

    invDel(inv: number, obj: number, count: number, beginSlot: number = -1): number {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invDel: Invalid inventory type: ' + inv);
        }

        // has to start at -1
        if (beginSlot < -1 || beginSlot >= this.invSize(inv)) {
            throw new Error('invDel: Invalid beginSlot: ' + beginSlot);
        }

        const transaction = container.remove(obj, count, beginSlot);
        return transaction.completed;
    }

    invDelSlot(inv: number, slot: number) {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invDelSlot: Invalid inventory type: ' + inv);
        }

        if (!container.validSlot(slot)) {
            throw new Error('invDelSlot: Invalid slot: ' + slot);
        }

        container.delete(slot);
    }

    invSize(inv: number): number {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invSize: Invalid inventory type: ' + inv);
        }

        return container.capacity;
    }

    invTotal(inv: number, obj: number): number {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invTotal: Invalid inventory type: ' + inv);
        }

        return container.getItemCount(obj);
    }

    invFreeSpace(inv: number): number {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invFreeSpace: Invalid inventory type: ' + inv);
        }

        return container.freeSlotCount;
    }

    invItemSpace(inv: number, obj: number, count: number, size: number): number {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invItemSpace: Invalid inventory type: ' + inv);
        }

        const objType = ObjType.get(obj);

        // oc_uncert
        let uncert = obj;
        if (objType.certtemplate >= 0 && objType.certlink >= 0) {
            uncert = objType.certlink;
        }
        if (objType.stackable || uncert != obj || container.stackType == Inventory.ALWAYS_STACK) {
            const stockObj = InvType.get(inv).stockobj?.includes(obj) === true;
            if (this.invTotal(inv, obj) == 0 && this.invFreeSpace(inv) == 0 && !stockObj) {
                return count;
            }
            return Math.max(0, count - (Inventory.STACK_LIMIT - this.invTotal(inv, obj)));
        }
        return Math.max(0, count - (this.invFreeSpace(inv) - (this.invSize(inv) - size)));
    }

    invMoveToSlot(fromInv: number, toInv: number, fromSlot: number, toSlot: number) {
        const from = this.getInventory(fromInv);
        if (!from) {
            throw new Error('invMoveToSlot: Invalid inventory type: ' + fromInv);
        }

        if (!from.validSlot(fromSlot)) {
            throw new Error('invMoveToSlot: Invalid from slot: ' + fromSlot);
        }

        const to = this.getInventory(toInv);
        if (!to) {
            throw new Error('invMoveToSlot: Invalid inventory type: ' + toInv);
        }

        if (!to.validSlot(toSlot)) {
            throw new Error('invMoveToSlot: Invalid to slot: ' + toSlot);
        }

        const fromObj = this.invGetSlot(fromInv, fromSlot);
        if (!fromObj) {
            throw new Error(`invMoveToSlot: Invalid from obj was null. This means the obj does not exist at this slot: ${fromSlot}`);
        }

        const toObj = this.invGetSlot(toInv, toSlot);
        this.invSet(toInv, fromObj.id, fromObj.count, toSlot);

        if (toObj) {
            this.invSet(fromInv, toObj.id, toObj.count, fromSlot);
        } else {
            this.invDelSlot(fromInv, fromSlot);
        }
    }

    invMoveFromSlot(fromInv: number, toInv: number, fromSlot: number) {
        const from = this.getInventory(fromInv);
        if (!from) {
            throw new Error('invMoveFromSlot: Invalid inventory type: ' + fromInv);
        }

        const to = this.getInventory(toInv);
        if (!to) {
            throw new Error('invMoveFromSlot: Invalid inventory type: ' + toInv);
        }

        if (!from.validSlot(fromSlot)) {
            throw new Error('invMoveFromSlot: Invalid from slot: ' + fromSlot);
        }

        const fromObj = this.invGetSlot(fromInv, fromSlot);
        if (!fromObj) {
            throw new Error(`invMoveFromSlot: Invalid from obj was null. This means the obj does not exist at this slot: ${fromSlot}`);
        }

        return {
            overflow: fromObj.count - this.invAdd(toInv, fromObj.id, fromObj.count),
            fromObj: fromObj.id
        };
    }

    invTotalCat(inv: number, category: number): number {
        const container = this.getInventory(inv);
        if (!container) {
            throw new Error('invTotalCat: Invalid inventory type: ' + inv);
        }

        return container.itemsFiltered.filter(obj => ObjType.get(obj.id).category == category).reduce((count, obj) => count + obj.count, 0);
    }

    // ----

    getVar(id: number) {
        const varp = VarPlayerType.get(id);
        return varp.type === ScriptVarType.STRING ? this.varsString[varp.id] : this.vars[varp.id];
    }

    setVar(id: number, value: number | string) {
        const varp = VarPlayerType.get(id);

        if (varp.type === ScriptVarType.STRING && typeof value === 'string') {
            this.varsString[varp.id] = value as string;
        } else if (typeof value === 'number') {
            this.vars[varp.id] = value;

            if (varp.transmit) {
                if (value >= 0x80) {
                    this.writeHighPriority(ServerProt.VARP_LARGE, id, value);
                } else {
                    this.writeHighPriority(ServerProt.VARP_SMALL, id, value);
                }
            }
        }
    }

    addXp(stat: number, xp: number) {
        // require xp is >= 0. there is no reason for a requested addXp to be negative.
        if (xp < 0) {
            throw new Error(`Invalid xp parameter for addXp call: Stat was: ${stat}, Exp was: ${xp}`);
        }

        // if the xp arg is 0, then we do not have to change anything or send an unnecessary stat packet.
        if (xp == 0) {
            return;
        }

        const multi = Number(Environment.XP_MULTIPLIER) || 1;
        this.stats[stat] += xp * multi;

        // cap to 200m, this is represented as "2 billion" because we use 32-bit signed integers and divide by 10 to give us a decimal point
        if (this.stats[stat] > 2_000_000_000) {
            this.stats[stat] = 2_000_000_000;
        }

        const before = this.baseLevels[stat];
        if (this.levels[stat] === this.baseLevels[stat]) {
            // only update if no buff/debuff is active
            this.levels[stat] = getLevelByExp(this.stats[stat]);
        }
        this.baseLevels[stat] = getLevelByExp(this.stats[stat]);

        if (this.baseLevels[stat] > before) {
            const script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.LEVELUP, stat, -1);

            if (script) {
                this.enqueueScript(script, PlayerQueueType.ENGINE);
            }
        }

        if (this.combatLevel != this.getCombatLevel()) {
            this.combatLevel = this.getCombatLevel();
            this.generateAppearance(InvType.WORN);
        }
    }

    setLevel(stat: number, level: number) {
        level = Math.min(99, Math.max(1, level));

        this.baseLevels[stat] = level;
        this.levels[stat] = level;
        this.stats[stat] = getExpByLevel(level);

        if (this.getCombatLevel() != this.combatLevel) {
            this.combatLevel = this.getCombatLevel();
            this.generateAppearance(InvType.WORN);
        }
    }

    playAnimation(seq: number, delay: number) {
        if (seq >= SeqType.count) {
            return;
        }

        this.animId = seq;
        this.animDelay = delay;
        this.mask |= Player.ANIM;
    }

    spotanim(spotanim: number, height: number, delay: number) {
        this.graphicId = spotanim;
        this.graphicHeight = height;
        this.graphicDelay = delay;
        this.mask |= Player.SPOTANIM;
    }

    applyDamage(damage: number, type: number) {
        this.damageTaken = damage;
        this.damageType = type;

        const current = this.levels[PlayerStat.HITPOINTS];
        if (current - damage <= 0) {
            this.levels[PlayerStat.HITPOINTS] = 0;
            this.damageTaken = current;
        } else {
            this.levels[PlayerStat.HITPOINTS] = current - damage;
        }

        this.mask |= Player.DAMAGE;
    }

    say(message: string) {
        this.chat = message;
        this.mask |= Player.SAY;
    }

    faceSquare(x: number, z: number) {
        this.faceX = x * 2 + 1;
        this.faceZ = z * 2 + 1;
        this.orientation = Position.face(this.x, this.z, x, z);
        this.mask |= Player.FACE_COORD;
    }

    playSong(name: string) {
        name = name.toLowerCase().replaceAll(' ', '_');
        if (!name) {
            return;
        }

        const song = PRELOADED.get(name + '.mid');
        const crc = PRELOADED_CRC.get(name + '.mid');
        if (song && crc) {
            const length = song.length;

            this.writeLowPriority(ServerProt.MIDI_SONG, name, crc, length);
        }
    }

    playJingle(delay: number, name: string): void {
        name = name.toLowerCase().replaceAll('_', ' ');
        if (!name) {
            return;
        }
        const jingle = PRELOADED.get(name + '.mid');
        if (jingle) {
            this.writeLowPriority(ServerProt.MIDI_JINGLE, delay, jingle);
        }
    }

    openMainModal(com: number) {
        if (this.modalState & 4) {
            this.writeLowPriority(ServerProt.IF_CLOSE); // need to close sidemodal
            this.modalState &= ~4;
            this.modalSidebar = -1;
        }

        this.modalState |= 1;
        this.modalTop = com;
        this.refreshModal = true;
    }

    openChat(com: number) {
        this.modalState |= 2;
        this.modalBottom = com;
        this.refreshModal = true;
    }

    openSideOverlay(com: number) {
        this.modalState |= 4;
        this.modalSidebar = com;
        this.refreshModal = true;
    }

    openChatSticky(com: number) {
        this.writeLowPriority(ServerProt.TUTORIAL_OPENCHAT, com);
        this.modalState |= 8;
        this.modalSticky = com;
    }

    openMainModalSideOverlay(top: number, side: number) {
        this.modalState |= 1;
        this.modalTop = top;
        this.modalState |= 4;
        this.modalSidebar = side;
        this.refreshModal = true;
    }

    exactMove(startX: number, startZ: number, endX: number, endZ: number, startCycle: number, endCycle: number, direction: number) {
        this.exactStartX = startX;
        this.exactStartZ = startZ;
        this.exactEndX = endX;
        this.exactEndZ = endZ;
        this.exactMoveStart = startCycle;
        this.exactMoveEnd = endCycle;
        this.exactMoveDirection = direction;
        this.mask |= Player.EXACT_MOVE;

        // todo: interpolate over time? instant teleport? verify with true tile on osrs
        this.x = endX;
        this.z = endZ;
    }

    setTab(com: number, tab: number) {
        this.overlaySide[tab] = com;
        this.writeLowPriority(ServerProt.IF_OPENSIDEOVERLAY, com, tab);
    }

    isComponentVisible(com: Component) {
        return this.modalTop === com.rootLayer || this.modalBottom === com.rootLayer || this.modalSidebar === com.rootLayer || this.overlaySide.findIndex(l => l === com.rootLayer) !== -1 || this.modalSticky === com.rootLayer;
    }

    // ----

    runScript(script: ScriptState, protect: boolean = false, force: boolean = false) {
        // console.log('Executing', script.script.info.scriptName);

        if (!force && protect && (this.protect || this.delayed())) {
            // can't get protected access, bye-bye
            // console.log('No protected access:', script.script.info.scriptName, protect, this.protect);
            return -1;
        }

        if (protect) {
            script.pointerAdd(ScriptPointer.ProtectedActivePlayer);
            this.protect = true;
        }

        const state = ScriptRunner.execute(script);

        if (protect) {
            this.protect = false;
        }

        if (script.pointerGet(ScriptPointer.ProtectedActivePlayer) && script._activePlayer) {
            script.pointerRemove(ScriptPointer.ProtectedActivePlayer);
            script._activePlayer.protect = false;
        }

        if (script.pointerGet(ScriptPointer.ProtectedActivePlayer2) && script._activePlayer2) {
            script.pointerRemove(ScriptPointer.ProtectedActivePlayer2);
            script._activePlayer2.protect = false;
        }

        return state;
    }

    executeScript(script: ScriptState, protect: boolean = false, force: boolean = false) {
        // console.log('Executing', script.script.info.scriptName);

        const state = this.runScript(script, protect, force);
        if (state === -1) {
            // console.log('Script did not run', script.script.info.scriptName, protect, this.protect);
            return;
        }

        if (state !== ScriptState.FINISHED && state !== ScriptState.ABORTED) {
            if (state === ScriptState.WORLD_SUSPENDED) {
                World.enqueueScript(script, script.popInt());
            } else if (state === ScriptState.NPC_SUSPENDED) {
                script.activeNpc.activeScript = script;
            } else {
                script.activePlayer.activeScript = script;
                script.activePlayer.protect = protect; // preserve protected access when delayed
            }
        } else if (script === this.activeScript) {
            this.activeScript = null;

            if ((this.modalState & 1) == 0) {
                this.closeModal();
            }
        }
    }

    wrappedMessageGame(mes: string) {
        const font = FontType.get(1);
        const lines = font.split(mes, 456);
        for (const line of lines) {
            this.messageGame(line);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private writeInner(packetType: ServerProt, ...args: any[]): Packet | null {
        if (!ServerProtEncoders[packetType.id]) {
            return null;
        }

        let buf: Packet;
        if (packetType.length === -1) {
            buf = Packet.alloc(0);
        } else if (packetType.length === -2) {
            buf = Packet.alloc(2); // maybe this can be a type 1.
        } else {
            buf = new Packet(new Uint8Array(1 + packetType.length));
        }

        buf.p1(packetType.id);

        if (packetType.length === -1) {
            buf.p1(0);
        } else if (packetType.length === -2) {
            buf.p2(0);
        }
        const start = buf.pos;

        ServerProtEncoders[packetType.id](buf, ...args);

        if (packetType.length === -1) {
            buf.psize1(buf.pos - start);
        } else if (packetType.length === -2) {
            buf.psize2(buf.pos - start);
        }

        return buf;
    }

    writeHighPriority(packetType: ServerProt, ...args: any[]) {
        const buf = this.writeInner(packetType, ...args);
        if (buf === null) {
            return;
        }

        this.highPriorityOut.push(buf);
    }

    writeLowPriority(packetType: ServerProt, ...args: any[]) {
        const buf = this.writeInner(packetType, ...args);
        if (buf === null) {
            return;
        }

        this.lowPriorityOut.push(buf);
    }

    unsetMapFlag() {
        this.clearWaypoints();
        // in OSRS, SET_MAP_FLAG is high priority
        this.writeHighPriority(ServerProt.UNSET_MAP_FLAG);
    }

    hintNpc(nid: number) {
        // todo: is HINT_ARROW low or high priority?
        this.writeLowPriority(ServerProt.HINT_ARROW, 1, nid, 0, 0, 0, 0);
    }

    hintTile(offset: number, x: number, z: number, height: number) {
        this.writeLowPriority(ServerProt.HINT_ARROW, offset, 0, 0, x, z, height);
    }

    hintPlayer(pid: number) {
        this.writeLowPriority(ServerProt.HINT_ARROW, 10, 0, pid, 0, 0, 0);
    }

    stopHint() {
        this.writeLowPriority(ServerProt.HINT_ARROW, -1, 0, 0, 0, 0, 0);
    }

    lastLoginInfo(lastLoginIp: number, daysSinceLogin: number, daysSinceRecoveryChange: number, unreadMessageCount: number) {
        // this is like an interface packet so assume low priority
        this.writeLowPriority(ServerProt.LAST_LOGIN_INFO, lastLoginIp, daysSinceLogin, daysSinceRecoveryChange, unreadMessageCount);
        this.modalState |= 16;
    }

    logout(): void {
        // to be overridden
    }

    terminate(): void {
        // to be overridden
    }

    messageGame(msg: string) {
        this.writeHighPriority(ServerProt.MESSAGE_GAME, msg);
    }

    rebuildNormal(zoneX: number, zoneZ: number) {
        const out = Packet.alloc(2);
        out.p1(ServerProt.REBUILD_NORMAL.id);
        out.p2(0);
        const start = out.pos;

        out.p2(zoneX);
        out.p2(zoneZ);

        // build area is 13x13 zones (8*13 = 104 tiles), so we need to load 6 zones in each direction
        const areas: { mapsquareX: number; mapsquareZ: number }[] = [];
        for (let x = zoneX - 6; x <= zoneX + 6; x++) {
            for (let z = zoneZ - 6; z <= zoneZ + 6; z++) {
                const mapsquareX = Position.mapsquare(x << 3);
                const mapsquareZ = Position.mapsquare(z << 3);

                if (areas.findIndex(a => a.mapsquareX === mapsquareX && a.mapsquareZ === mapsquareZ) === -1) {
                    areas.push({ mapsquareX, mapsquareZ });
                }
            }
        }

        for (let i = 0; i < areas.length; i++) {
            const { mapsquareX, mapsquareZ } = areas[i];
            out.p1(mapsquareX);
            out.p1(mapsquareZ);
            out.p4(PRELOADED_CRC.get(`m${mapsquareX}_${mapsquareZ}`) ?? 0);
            out.p4(PRELOADED_CRC.get(`l${mapsquareX}_${mapsquareZ}`) ?? 0);
        }

        out.psize2(out.pos - start);

        // the packet is released elsewhere.
        this.highPriorityOut.push(out);
    }
}
