// A headless RS274 client that presents the exact surface the bot bridge reads.
//
// The bridge (src/bot/StateCollector.ts, ActionExecutor.ts) accesses the browser
// Client through ~54 methods and ~36 private fields. Everything in this file
// exists to satisfy that contract without a canvas: same field names, same
// types, same semantics - so StateCollector.ts runs against this class verbatim
// and produces a byte-identical BotWorldState.
//
// What's deliberately absent: models, sprites, the 3D scene, the minimap, sound,
// mouse picking. `world` is a SceneLite backed by a precomputed loc index, and
// the three screen-projection methods return null (the bridge only uses them to
// draw a click marker - see ActionExecutor.test.ts, which stubs them the same way).

import IfType from '#/config/IfType.js';
import LocType from '#/config/LocType.js';
import NpcType from '#/config/NpcType.js';
import ObjType from '#/config/ObjType.js';
import SeqType from '#/config/SeqType.js';
import SpotType from '#/config/SpotType.js';

import JString from '#/datastruct/JString.js';
import LinkList from '#/datastruct/LinkList.js';

import type ClientEntity from '#/dash3d/ClientEntity.js';
import ClientNpc from '#/dash3d/ClientNpc.js';
import ClientObj from '#/dash3d/ClientObj.js';
import ClientPlayer from '#/dash3d/ClientPlayer.js';
import CollisionMap, { BuildArea } from '#/dash3d/CollisionMap.js';
import { LocAngle } from '#/dash3d/LocAngle.js';
import { LocShape } from '#/dash3d/LocShape.js';

import type { CycleCounter } from '#/client/LoopCycle.js';
import Skill from '#/client/Skill.js';

import { ClientProt } from '#/io/ClientProt.js';
import Packet from '#/io/Packet.js';

import { TypedArray1d, TypedArray3d } from '#/util/Arrays.js';

import { BotStateCollector } from '#/bot/StateCollector.js';
import { ActionExecutor, type ActionResultOrPromise } from '#/bot/ActionExecutor.js';
import type { BotAction, BotWorldState, WalkResult } from '#/bot/types.js';
import type { Client } from '#/client/Client.js';

import { GameConnection } from './net/GameConnection.js';
import { InterfaceTable } from './interfaces.js';
import { LocIndex } from './world/LocIndex.js';
import { SceneLite } from './world/SceneLite.js';
import { buildCollision } from './world/CollisionBuilder.js';
import { handlePacket } from './protocol/incoming.js';
import { findPathToTile, tryMoveTo } from './movement.js';
import * as A from './actions.js';

export const MAX_PLAYER_COUNT = 2048;
export const LOCAL_PLAYER_INDEX = 2047;

/**
 * A packet handler that throws is survivable (see handlePacket), but a handler
 * that throws this many times inside DISPATCH_ERROR_WINDOW cycles is not a bad
 * packet - it is a broken client whose state has already diverged from the
 * server's. Ending the session gets it restarted; carrying on gets a bot that
 * quietly acts on a lie.
 */
const DISPATCH_ERROR_BURST = 20;
/** ~10s of session loop at its 20ms period. */
const DISPATCH_ERROR_WINDOW = 500;

/** Mirrors Client.ts's ClientActionResult so ActionExecutor's checks are unchanged. */
export interface ClientActionResult {
    success: boolean;
    reason?: string;
    /** False when the op dispatched without a client route (ap-range attempt). */
    routed?: boolean;
}

export interface LiteClientOptions {
    connection: GameConnection;
    locIndex: LocIndex;
    username: string;
    password: string;
    maxMessageLength?: number;
}

export class LiteClient {
    // ---- fields the bot bridge reads via `(client as any)` -------------------
    // Names and types match Client.ts exactly. Do not rename without updating
    // StateCollector.ts - tsc will not catch it, the accesses are `as any`.

    ingame = false;
    localPlayer: ClientPlayer | null = null;
    players: (ClientPlayer | null)[] = new TypedArray1d(MAX_PLAYER_COUNT, null);
    playerIds: Int32Array = new Int32Array(MAX_PLAYER_COUNT);
    playerCount = 0;
    npc: (ClientNpc | null)[] = new TypedArray1d(16384, null);
    npcIds: Int32Array = new Int32Array(16384);
    npcCount = 0;
    world: SceneLite;
    /** Per-level build-area collision, rebuilt on REBUILD_NORMAL. Used by movement.ts. */
    collision: (CollisionMap | null)[] = new TypedArray1d(BuildArea.LEVELS, null);
    groundObj: (LinkList<ClientObj> | null)[][][] = new TypedArray3d(BuildArea.LEVELS, BuildArea.SIZE, BuildArea.SIZE, null);
    statXP: Int32Array = new Int32Array(Skill.count);
    statBaseLevel: Int32Array = new Int32Array(Skill.count);
    statEffectiveLevel: Int32Array = new Int32Array(Skill.count);
    var: number[] = [];
    varServ: number[] = [];
    runenergy = 0;
    runweight = 0;
    mainModalId = -1;
    chatModalId = -1;
    sideModalId = -1;
    mainOverlayId = -1;
    sideIcon: number[] = [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1];
    activeIcon = 0;
    minusedlevel = 0;
    mapBuildBaseX = 0;
    mapBuildBaseZ = 0;
    mapBuildCentreZoneX = 0;
    mapBuildCentreZoneZ = 0;
    mapBuildPrevBaseX = 0;
    mapBuildPrevBaseZ = 0;
    chatText: (string | null)[] = new TypedArray1d(100, null);
    chatType: Int32Array = new Int32Array(100);
    chatUsername: (string | null)[] = new TypedArray1d(100, null);
    messageTick: Int32Array = new Int32Array(100);
    messageSequence: number[] = new TypedArray1d(100, 0);
    resumedPauseButton = false;
    selfSlot = -1;
    dialogInputOpen = false;
    socialInputOpen = false;
    /** Set false so nothing filters chat; the SDK does its own filtering. */
    chatDisabled = 0;
    ignoreCount = 0;
    ignoreUserhash: BigInt64Array = new BigInt64Array(100);
    membersAccount = 0;
    inMultizone = 0;
    playerOp: (string | null)[] = [null, null, null, null, null];
    playerOpPriority: boolean[] = [false, false, false, false, false];
    tutComId = -1;
    hintType = 0;
    dialogHistory: Array<{ text: string[]; tick: number; interfaceId: number }> = [];
    lastCapturedDialogId = -1;
    designGender = true;
    designKits: number[] = [0, 0, 0, 0, 0, 0, 0];
    designColours: number[] = [0, 0, 0, 0, 0];
    minimapFlagX = 0;
    minimapFlagZ = 0;
    /**
     * UNSET_MAP_FLAG packets received this session. Mirrors the field of the
     * same name on Client.ts - StateCollector reads it to build `opFeedback`.
     */
    mapFlagUnsetCount = 0;
    sceneState = 0;
    awaitingPlayerInfo = false;
    nextMessageSequence = 0;

    // ---- protocol scratch ----------------------------------------------------
    ptype = -1;
    ptype0 = -1;
    ptype1 = -1;
    ptype2 = -1;
    psize = 0;
    entityUpdateCount = 0;
    entityRemovalCount = 0;
    entityUpdateIds: Int32Array = new Int32Array(MAX_PLAYER_COUNT);
    entityRemovalIds: Int32Array = new Int32Array(MAX_PLAYER_COUNT);
    playerAppearanceBuffer: (Packet | null)[] = new TypedArray1d(MAX_PLAYER_COUNT, null);
    zoneUpdateX = 0;
    zoneUpdateZ = 0;
    /** Packets consumed since login. The session watchdog samples this for silence. */
    packetsReceived = 0;
    /** Packets whose handler threw and was contained. Reported by the swarm/runner. */
    dispatchErrors = 0;
    private dispatchErrorBurst = 0;
    private dispatchErrorCycle = 0;

    /**
     * Adaptive animation speed, mirroring the browser's PLAYER_INFO branch
     * (Client.ts ~8775): anims are authored for the vanilla 600ms tick, so a
     * server ticking faster replays them proportionally faster. Updated once per
     * server tick in notifyGameTick; ageEntityAnim consumes it.
     */
    tickSpeedMultiplier = 1;
    private measuredTickInterval = 420;
    private lastTickTime = 0;

    readonly conn: GameConnection;
    readonly locIndex: LocIndex;
    readonly loginUser: string;
    /**
     * This client's frame counter, bumped once per session loop by tickCycle().
     *
     * The browser's counter is the module-level `LoopCycle` box in
     * client/LoopCycle.ts, which is fine when a realm holds one client. Headless,
     * N clients share that module, so a shared counter would advance ~N times per
     * cycle of any one bot - and everything that measures an age in cycles would
     * be scaled by N: `getClientCycle() - messageTick[i]` (how old a chat line is),
     * `dialogHistory[].tick`, and the `combatCycle = cycle + 400` windows
     * StateCollector uses to decide whether a player or npc is in combat. Cheap to
     * own per client, so we do.
     */
    readonly cycle: CycleCounter = { value: 0 };
    /** This client's copy-on-write view of IfType.list. See interfaces.ts. */
    readonly interfaces: InterfaceTable = new InterfaceTable();
    private readonly loginPass: string;
    private readonly maxMessageLength: number;
    private onGameTickCallback: (() => void) | null = null;
    private loggedOut = false;
    private collector: BotStateCollector | null = null;
    private executor: ActionExecutor | null = null;

    /** Per-level XP thresholds. Duplicated from Client.ts - see PATCHES.md. */
    static levelExperience: number[] = (() => {
        const table: number[] = [];
        let acc = 0;
        for (let i = 0; i < 99; i++) {
            const level = i + 1;
            // Custom rs-sdk curve; must stay in sync with engine Player.ts
            // (which stores XP in x10 "fine" units) and Client.ts.
            const delta = (level + Math.pow(2.0, level / 10.0) * 300.0) | 0;
            acc += delta;
            table[i] = (acc / 4) | 0;
        }
        return table;
    })();

    constructor(opts: LiteClientOptions) {
        this.conn = opts.connection;
        this.locIndex = opts.locIndex;
        this.loginUser = opts.username;
        this.loginPass = opts.password;
        // Unlike the browser client (which gets the server's value injected via
        // bot.ejs), lite has no config channel - keep this default in sync with
        // the engine's WorldConfig node.maxMessageLength default.
        this.maxMessageLength = opts.maxMessageLength ?? 400;
        this.world = new SceneLite(opts.locIndex);

        for (let i = 0; i < 5000; i++) {
            this.var[i] = 0;
            this.varServ[i] = 0;
        }

        this.localPlayer = new ClientPlayer();
        this.players[LOCAL_PLAYER_INDEX] = this.localPlayer;
        this.ingame = true;
    }

    // ------------------------------------------------------------- main loop

    /**
     * Drain everything the socket has. Called once per client cycle; unlike the
     * browser shell there is no redraw to interleave with, so we just loop until
     * the socket is dry.
     */
    async pumpPackets(): Promise<void> {
        let guard = 0;
        while (!this.loggedOut && (await handlePacket(this))) {
            if (++guard > 5000) {
                break;
            }
        }
        this.snapEntities();
    }

    /**
     * Snap every entity's fine position to its authoritative tile.
     *
     * The browser client eases `x`/`z` toward `routeX[0]/routeZ[0]` a few units
     * per frame (Client.moveEntity) so movement looks smooth. Headless there is
     * nothing to look smooth for, and StateCollector reads `player.x >> 7` as
     * the position - so without this, queued movement never shows up and the bot
     * believes it never moved. `routeX[0]` is always the newest tile the server
     * sent (see ClientEntity.moveCode), so snapping is both cheaper and strictly
     * more accurate than interpolating.
     */
    private snapEntities(): void {
        const snap = (e: ClientPlayer | ClientNpc): void => {
            e.x = e.routeX[0] * 128 + e.size * 64;
            e.z = e.routeZ[0] * 128 + e.size * 64;
        };

        if (this.localPlayer) {
            snap(this.localPlayer);
        }
        for (let i = 0; i < this.playerCount; i++) {
            const p = this.players[this.playerIds[i]];
            if (p) {
                snap(p);
            }
        }
        for (let i = 0; i < this.npcCount; i++) {
            const n = this.npc[this.npcIds[i]];
            if (n) {
                snap(n);
            }
        }
    }

    /** Advance the frame counter the entity/hitmark code times against. */
    tickCycle(): void {
        this.cycle.value++;
        this.ageAnims();
    }

    /**
     * Retire animations whose sequences have run out, so `animId`/`spotanimId`
     * read -1 again once a swing/chop/cast finishes - without this, the first
     * animation of a session sticks forever and every SDK "did my action start /
     * am I idle" check that gates on animId is poisoned.
     *
     * This is Client.entityAnim (Client.ts ~6126) minus rendering, run over the
     * same entities snapEntities touches.
     *
     * Units. The browser advances an anim inside updateGame, once per client
     * tick of its 50Hz shell loop - i.e. one step per ~20ms, with
     * `Client.loopCycle` advancing at the same cadence. SeqType per-frame delays
     * (and the ANIM mask's start delay) are denominated in those 20ms client
     * ticks. Our session loop runs every LOOP_MS=20ms and calls tickCycle() once,
     * so `c.cycle.value` advances at the same ~20ms cadence - one ageAnims() call
     * per cycle steps exactly like the browser. Server game ticks (600ms vanilla,
     * 300ms on prod) are 30/15 of these cycles and only enter via
     * tickSpeedMultiplier, which both clients derive from the measured
     * PLAYER_INFO interval (max(1, 420/interval) - 1 at 600ms, 2 after ceil at
     * 300ms) so faster servers replay anims proportionally faster.
     *
     * Deliberately omitted from the port: the PreanimMove.DELAYANIM hold
     * (Client.ts ~6167), which pins primaryAnimDelay at 1 while
     * preanimRouteLength > 0. The browser decrements preanimRouteLength in its
     * route-easing code (moveEntity), which lite does not run - snapEntities
     * replaces it - so the hold would never release and would re-create exactly
     * the sticky-anim bug this method exists to fix. Cost: an anim that starts
     * mid-move may end a few cycles earlier here than in the browser.
     */
    private ageAnims(): void {
        if (this.localPlayer) {
            this.ageEntityAnim(this.localPlayer);
        }
        for (let i = 0; i < this.playerCount; i++) {
            const p = this.players[this.playerIds[i]];
            if (p) {
                this.ageEntityAnim(p);
            }
        }
        for (let i = 0; i < this.npcCount; i++) {
            const n = this.npc[this.npcIds[i]];
            if (n) {
                this.ageEntityAnim(n);
            }
        }
    }

    private ageEntityAnim(e: ClientEntity): void {
        const animSpeed = Math.ceil(this.tickSpeedMultiplier);

        if (e.spotanimId !== -1 && this.cycle.value >= e.spotanimLastCycle) {
            if (e.spotanimFrame < 0) {
                e.spotanimFrame = 0;
            }

            const seq = SpotType.list[e.spotanimId]?.seq;
            if (!seq) {
                // No sequence to age against (spotanim with no seq, or cache
                // skew). The browser leaves these on-screen indefinitely; for a
                // bot a spotanimId that can never expire is the staleness bug,
                // so retire it as soon as its flight delay has elapsed.
                e.spotanimId = -1;
            } else {
                e.spotanimCycle += animSpeed;
                while (e.spotanimFrame < seq.numFrames && e.spotanimCycle > seq.getDelay(e.spotanimFrame)) {
                    e.spotanimCycle -= seq.getDelay(e.spotanimFrame);
                    e.spotanimFrame++;
                }
                if (e.spotanimFrame >= seq.numFrames) {
                    e.spotanimId = -1;
                }
            }
        }

        if (e.primaryAnim !== -1 && e.primaryAnimDelay === 0) {
            const seq: SeqType | undefined = SeqType.list[e.primaryAnim];
            if (!seq) {
                e.primaryAnim = -1; // unknown seq id - cannot be aged, must not stick
            } else {
                e.primaryAnimCycle += animSpeed;
                while (e.primaryAnimFrame < seq.numFrames && e.primaryAnimCycle > seq.getDelay(e.primaryAnimFrame)) {
                    e.primaryAnimCycle -= seq.getDelay(e.primaryAnimFrame);
                    e.primaryAnimFrame++;
                }

                if (e.primaryAnimFrame >= seq.numFrames) {
                    // seq.loops is the replay offset ("replayoff"): -1 when the
                    // seq plays once, so the frame overruns and the anim retires;
                    // positive for looping seqs, which rewind and replay until
                    // primaryAnimLoop reaches maxloops (default 99).
                    e.primaryAnimFrame -= seq.loops;
                    e.primaryAnimLoop++;

                    if (e.primaryAnimLoop >= seq.maxloops) {
                        e.primaryAnim = -1;
                    }
                    if (e.primaryAnimFrame < 0 || e.primaryAnimFrame >= seq.numFrames) {
                        e.primaryAnim = -1;
                    }
                }
            }
        }

        if (e.primaryAnimDelay > 0) {
            e.primaryAnimDelay -= animSpeed;
            if (e.primaryAnimDelay < 0) {
                e.primaryAnimDelay = 0;
            }
        }
    }

    get loopCycle(): number {
        return this.cycle.value;
    }

    setOnGameTickCallback(cb: (() => void) | null): void {
        this.onGameTickCallback = cb;
    }

    notifyGameTick(): void {
        // Measure the real server tick interval off PLAYER_INFO (which arrives
        // exactly once per tick), same EMA and clamp as Client.ts ~8775, so
        // ageEntityAnim replays anims at the speed the browser client would.
        const now = performance.now();
        if (this.lastTickTime > 0) {
            const interval = now - this.lastTickTime;
            this.measuredTickInterval = this.measuredTickInterval * 0.8 + interval * 0.2;
            this.tickSpeedMultiplier = Math.max(1, 420 / this.measuredTickInterval);
        }
        this.lastTickTime = now;

        this.onGameTickCallback?.();
    }

    isInGame(): boolean {
        return this.ingame && !this.conn.isClosed;
    }

    /** True once the server sent LOGOUT, as opposed to the socket simply dying. */
    isLoggedOut(): boolean {
        return this.loggedOut;
    }

    /**
     * Account for a packet handler that threw. Called by handlePacket, which has
     * already resynchronised the stream by consuming the body.
     *
     * Throws (ending the session) once handlers are failing in a burst rather
     * than one-off, because at that point the client's own state is the problem.
     */
    recordDispatchError(opcode: number, err: unknown): void {
        this.dispatchErrors++;
        if (this.cycle.value - this.dispatchErrorCycle > DISPATCH_ERROR_WINDOW) {
            this.dispatchErrorBurst = 0;
        }
        this.dispatchErrorCycle = this.cycle.value;
        this.dispatchErrorBurst++;

        console.error(`[lite] ${this.loginUser}: packet ${opcode} handler threw (${this.dispatchErrors} total, packet dropped):`, err);

        if (this.dispatchErrorBurst >= DISPATCH_ERROR_BURST) {
            throw new Error(`${this.loginUser}: ${this.dispatchErrorBurst} packet handlers threw within ${DISPATCH_ERROR_WINDOW} cycles - client state is unreliable`);
        }
    }

    getClientCycle(): number {
        return this.cycle.value;
    }

    getCredentials(): { username: string; password: string } {
        return { username: this.loginUser, password: this.loginPass };
    }

    getMaxMessageLength(): number {
        return this.maxMessageLength;
    }

    markLoggedOut(): void {
        this.loggedOut = true;
        this.ingame = false;
    }

    // -------------------------------------------------- chat history plumbing

    /** Port of Client.addChat - the ring buffer StateCollector reads. */
    addChat(type: number, text: string, sender: string): void {
        for (let i = 99; i > 0; i--) {
            this.chatType[i] = this.chatType[i - 1];
            this.chatUsername[i] = this.chatUsername[i - 1];
            this.chatText[i] = this.chatText[i - 1];
            this.messageTick[i] = this.messageTick[i - 1];
            this.messageSequence[i] = this.messageSequence[i - 1];
        }

        this.chatType[0] = type;
        this.chatUsername[0] = sender;
        this.chatText[0] = text;
        this.messageTick[0] = this.cycle.value;
        this.messageSequence[0] = ++this.nextMessageSequence;
    }

    // ------------------------------------------------------ scene projection
    // Cosmetic only: the bridge feeds these to setBotClickVisual. Returning null
    // is exactly what ActionExecutor.test.ts stubs.

    projectTileToScreen(_worldX: number, _worldZ: number): { x: number; y: number } | null {
        return null;
    }

    projectNpcToScreen(_npcIndex: number): { x: number; y: number } | null {
        return null;
    }

    projectPlayerToScreen(_playerIndex: number): { x: number; y: number } | null {
        return null;
    }

    setBotClickVisual(_x: number, _y: number, _kind: number): void {
        /* no-op headless */
    }

    setPacketLogCallback(_cb: unknown): void {
        /* packet logging is a browser debug affordance */
    }

    // --------------------------------------------------------------- helpers

    /**
     * Bring the CollisionMaps back in line with the loc overlay, if a zone
     * packet has changed anything since the last rebuild.
     *
     * Doors are the reason this exists. The server opens one by sending
     * LOC_DEL + LOC_ADD_CHANGE; that updates the overlay immediately, so
     * `nearbyLocs` reports the open door right away - but the collision map is
     * built separately, and without this the router would keep pathing around a
     * wall that is no longer there (or through one that just appeared).
     *
     * Rebuilding the whole build area costs ~15ms, too much to do per packet in
     * a busy zone, so it is deferred to the next routing call: N loc changes
     * between two routes cost one rebuild, and a bot that never routes pays
     * nothing. Reusing the full builder rather than patching flags incrementally
     * means the map cannot drift out of sync over a long session.
     */
    ensureCollision(): void {
        if (!this.world.collisionDirty) {
            return;
        }
        buildCollision(this.locIndex, this.mapBuildBaseX, this.mapBuildBaseZ, this.collision, this.world.overlayEntries);
        this.world.collisionDirty = false;
    }

    /** World tile -> build-area tile. Returns null when off the loaded area. */
    toSceneTile(worldX: number, worldZ: number): { x: number; z: number } | null {
        const x = worldX - this.mapBuildBaseX;
        const z = worldZ - this.mapBuildBaseZ;
        if (x < 0 || z < 0 || x >= BuildArea.SIZE || z >= BuildArea.SIZE) {
            return null;
        }
        return { x, z };
    }

    getPlayerPosition(): { worldX: number; worldZ: number; tileX: number; tileZ: number } | null {
        if (!this.ingame || !this.localPlayer) {
            return null;
        }
        const tileX = this.localPlayer.x >> 7;
        const tileZ = this.localPlayer.z >> 7;
        return {
            worldX: tileX + this.mapBuildBaseX,
            worldZ: tileZ + this.mapBuildBaseZ,
            tileX,
            tileZ
        };
    }

    /**
     * Port of Client.locSceneInfo: recover a loc's (shape, angle) so routeToLoc
     * can pick the right reach rule. Wall vs rectangle matters - getting it wrong
     * parks the bot one tile off and the server answers "I can't reach that!".
     */
    locSceneInfo(sceneX: number, sceneZ: number, locId: number): { shape: number; angle: number } | null {
        const level = this.minusedlevel;
        const typecodes = [
            this.world.wallType(level, sceneX, sceneZ),
            this.world.decorType(level, sceneZ, sceneX), // (level, z, x) - matches World
            this.world.sceneType(level, sceneX, sceneZ),
            this.world.gdType(level, sceneX, sceneZ)
        ];

        for (const typecode of typecodes) {
            if (typecode === 0 || ((typecode >> 14) & 0x7fff) !== locId) {
                continue;
            }
            const info = this.world.typeCode2(level, sceneX, sceneZ, typecode);
            if (info === -1) {
                continue;
            }
            return { shape: info & 0x1f, angle: (info >> 6) & 0x3 };
        }
        return null;
    }

    /**
     * Walk to a tile adjacent to a loc, using the same reach rule the browser
     * client picks in routeToLoc.
     */
    routeToLoc(sceneX: number, sceneZ: number, locId: number): boolean {
        if (!this.localPlayer) {
            return false;
        }

        const info = this.locSceneInfo(sceneX, sceneZ, locId);
        const shape = info?.shape ?? LocShape.CENTREPIECE_STRAIGHT;
        const angle = info?.angle ?? LocAngle.WEST;

        if (shape === LocShape.CENTREPIECE_STRAIGHT || shape === LocShape.CENTREPIECE_DIAGONAL || shape === LocShape.GROUND_DECOR) {
            const loc = LocType.list(locId);
            const width = angle === LocAngle.WEST || angle === LocAngle.EAST ? loc.width : loc.length;
            const height = angle === LocAngle.WEST || angle === LocAngle.EAST ? loc.length : loc.width;

            let forceapproach = loc.forceapproach;
            if (angle !== 0) {
                forceapproach = ((forceapproach << angle) & 0xf) + (forceapproach >> (4 - angle));
            }

            return tryMoveTo(this, sceneX, sceneZ, width, height, 0, 0, forceapproach);
        }

        return tryMoveTo(this, sceneX, sceneZ, 0, 0, angle, shape + 1, 0);
    }

    /** Send a MOVE_GAMECLICK with a client-computed path. See movement.ts. */
    walkTo(worldX: number, worldZ: number, running = false): WalkResult {
        if (!this.localPlayer) {
            return { moved: false, outOfRange: false };
        }

        // Match Client.walkTo: a long-distance BotActions route can hand the
        // client a global waypoint beyond its current 104x104 build area. Walk
        // to the corresponding scene edge; crossing it causes REBUILD_NORMAL,
        // after which BotActions observes progress and dispatches the next leg.
        // Keeping the one-tile border excluded also matches the browser's
        // collision bounds (tiles 0 and 103 are the blocked border ring).
        // `outOfRange` tells the caller this was only a leg, not a full route -
        // the silent-no-op era where a far destination looked like a success
        // with no signal is what bug report msjgy9cl was about.
        const minBound = 1;
        const maxBound = BuildArea.SIZE - 2;
        const rawX = worldX - this.mapBuildBaseX;
        const rawZ = worldZ - this.mapBuildBaseZ;
        const outOfRange = rawX < minBound || rawX > maxBound || rawZ < minBound || rawZ > maxBound;
        const destX = Math.max(minBound, Math.min(maxBound, rawX));
        const destZ = Math.max(minBound, Math.min(maxBound, rawZ));
        return { moved: findPathToTile(this, destX, destZ, running), outOfRange };
    }

    // ------------------------------------------------------ outgoing plumbing

    /** Queue an opcode with ISAAC encoding, matching Client.writePacketOpcode. */
    writeOpcode(opcode: ClientProt): void {
        this.conn.out.p1Enc(opcode);
    }

    get out(): Packet {
        return this.conn.out;
    }

    flush(): void {
        this.conn.flush();
    }

    // ----------------------------------------------------------- type lookups
    // Small conveniences used by the action layer; kept here so the action code
    // reads like Client.ts's.

    objType(id: number): ObjType {
        return ObjType.list(id);
    }

    npcType(id: number): NpcType {
        return NpcType.list(id);
    }

    locTypeOf(id: number): LocType {
        return LocType.list(id);
    }

    seqType(id: number): SeqType {
        return SeqType.list[id];
    }

    ifType(id: number): IfType {
        return this.interfaces.list[id];
    }

    /**
     * Point the shared `IfType.list` at this client's table.
     *
     * Every public method below is wrapped to call this on entry (see the bottom
     * of this file), so bridge code that reaches into `IfType.list` - all of
     * StateCollector's inventory/bank/shop reads - sees this bot's components and
     * not whichever bot ran last.
     */
    activate(): void {
        this.interfaces.activate();
    }

    /** The component `id`, cloned into this client's table if it wasn't already. */
    ifMutable(id: number): IfType | undefined {
        return this.interfaces.mutable(id);
    }

    userhash(name: string): bigint {
        return JString.toUserhash(name);
    }

    // ==================================================================
    // The bot-bridge method surface. Thin delegates to actions.ts so the
    // packet-building code stays testable without a client instance, while
    // StateCollector/ActionExecutor see exactly the names Client.ts exposes.
    // ==================================================================

    interactLoc(worldX: number, worldZ: number, locId: number, optionIndex: number): ClientActionResult {
        return A.interactLoc(this, worldX, worldZ, locId, optionIndex);
    }
    talkToNpc(npcIndex: number): ClientActionResult {
        return A.talkToNpc(this, npcIndex);
    }
    interactNpc(npcIndex: number, optionIndex: number): ClientActionResult {
        return A.interactNpc(this, npcIndex, optionIndex);
    }

    /** Exact raw-table lookup for latency-critical, policy-gated hooks. */
    findNpcIndexByExactName(name: string): number | undefined {
        for (let i = 0; i < this.npcCount; i++) {
            const index = this.npcIds[i];
            const npc = this.npc[index];
            if (npc?.type?.name === name) return index;
        }
        return undefined;
    }
    interactPlayer(playerIndex: number, optionIndex: number): ClientActionResult {
        return A.interactPlayer(this, playerIndex, optionIndex);
    }
    pickupGroundItem(worldX: number, worldZ: number, itemId: number): ClientActionResult {
        return A.pickupGroundItem(this, worldX, worldZ, itemId);
    }
    interactGroundItem(worldX: number, worldZ: number, itemId: number, optionIndex: number): ClientActionResult {
        return A.interactGroundItem(this, worldX, worldZ, itemId, optionIndex);
    }
    useInventoryItem(slot: number, optionIndex: number, interfaceId?: number): boolean {
        return A.useInventoryItem(this, slot, optionIndex, interfaceId);
    }
    dropInventoryItem(slot: number): boolean {
        return A.dropInventoryItem(this, slot);
    }
    clickEquipmentSlot(slot: number, optionIndex?: number): boolean {
        return A.clickEquipmentSlot(this, slot, optionIndex);
    }
    useItemOnItem(sourceSlot: number, targetSlot: number, interfaceId?: number): boolean {
        return A.useItemOnItem(this, sourceSlot, targetSlot, interfaceId);
    }
    useItemOnNpc(itemSlot: number, npcIndex: number, interfaceId?: number): ClientActionResult {
        return A.useItemOnNpc(this, itemSlot, npcIndex, interfaceId);
    }
    useItemOnLoc(itemSlot: number, worldX: number, worldZ: number, locId: number, interfaceId?: number): ClientActionResult {
        return A.useItemOnLoc(this, itemSlot, worldX, worldZ, locId, interfaceId);
    }
    spellOnNpc(npcIndex: number, spellComponent: number): ClientActionResult {
        return A.spellOnNpc(this, npcIndex, spellComponent);
    }
    spellOnPlayer(playerIndex: number, spellComponent: number): ClientActionResult {
        return A.spellOnPlayer(this, playerIndex, spellComponent);
    }
    spellOnItem(slot: number, spellComponent: number, interfaceId?: number): boolean {
        return A.spellOnItem(this, slot, spellComponent, interfaceId);
    }
    spellOnGroundItem(worldX: number, worldZ: number, itemId: number, spellComponent: number): ClientActionResult {
        // OPOBJT: same shape as the ground-item ops but with a spell component.
        const dest = this.toSceneTile(worldX, worldZ);
        if (!dest) {
            return { success: false, reason: 'out_of_scene' };
        }
        this.writeOpcode(ClientProt.OPOBJT);
        this.out.p2(worldX);
        this.out.p2(worldZ);
        this.out.p2(itemId);
        this.out.p2(spellComponent);
        return { success: true };
    }
    clickComponent(componentId: number): boolean {
        return A.clickComponent(this, componentId);
    }
    clickInterfaceIop(componentId: number, optionIndex?: number, slot?: number): boolean {
        return A.clickInterfaceIop(this, componentId, optionIndex, slot);
    }
    setTab(tabIndex: number): boolean {
        return A.setTab(this, tabIndex);
    }
    closeBotModal(): boolean {
        return A.closeBotModal(this);
    }
    submitCountDialog(value: number): boolean {
        return A.submitCountDialog(this, value);
    }
    clickDialogOption(optionIndex?: number): boolean {
        return A.clickDialogOption(this, optionIndex);
    }
    getDialogOptions(): Array<{ index: number; text: string; componentId: number; buttonType: number }> {
        return A.getDialogOptions(this);
    }
    getDialogText(): string[] {
        return A.getDialogText(this);
    }
    getInterfaceOptions(): Array<{ index: number; text: string; componentId: number }> {
        return A.getInterfaceOptions(this);
    }
    debugDialogComponents(): Array<{ id: number; type: number; buttonType: number; option: string; text: string }> {
        return A.debugDialogComponents(this);
    }
    getInterfaceDebugInfo(interfaceId: number): string[] {
        return A.getInterfaceDebugInfo(this, interfaceId);
    }
    captureDialogToHistory(): void {
        A.captureDialogToHistory(this);
    }
    getDialogHistory(): Array<{ text: string[]; tick: number; interfaceId: number }> {
        return this.dialogHistory;
    }
    findNpcByName(name: string): number {
        return A.findNpcByName(this, name);
    }
    isShopOpen(): boolean {
        return A.isShopOpen(this);
    }
    shopBuy(slot: number, amount?: number): boolean {
        return A.shopBuy(this, slot, amount);
    }
    shopSell(slot: number, amount?: number): boolean {
        return A.shopSell(this, slot, amount);
    }
    closeShop(): boolean {
        return A.closeShop(this);
    }
    isBankOpen(): boolean {
        return A.isBankOpen(this);
    }
    bankDeposit(slot: number, amount?: number): boolean {
        return A.bankDeposit(this, slot, amount);
    }
    bankWithdraw(slot: number, amount?: number): boolean {
        return A.bankWithdraw(this, slot, amount);
    }
    getBankItems(): Array<{ slot: number; id: number; name: string; count: number }> {
        return A.getBankItems(this);
    }
    say(message: string): A.SayOutcome {
        return A.say(this, message);
    }
    sendPrivateMessage(targetName: string, message: string): A.SayOutcome {
        return A.sendPrivateMessage(this, targetName, message);
    }
    setCombatStyle(style: number): boolean {
        return A.setCombatStyle(this, style);
    }
    getCombatStyle(): number {
        return A.getCombatStyle(this);
    }
    acceptCharacterDesign(): boolean {
        return A.acceptCharacterDesign(this);
    }
    randomizeCharacterDesign(gender?: boolean): boolean {
        return A.randomizeCharacterDesign(this, gender);
    }

    // ---- the bot bridge, owned by the client ------------------------------
    // StateCollector and ActionExecutor read `IfType.list` directly, so they only
    // produce the right bot's state while that bot's table is active. Owning them
    // here - instead of letting each caller construct its own pair - means every
    // path into them is a LiteClient method, and every LiteClient method activates
    // first. Callers cannot get this wrong by forgetting a step.

    private bridge(): { collector: BotStateCollector; executor: ActionExecutor } {
        if (!this.collector || !this.executor) {
            const asClient = this as unknown as Client;
            this.collector = new BotStateCollector(asClient);
            this.executor = new ActionExecutor(asClient);
            this.executor.setScanProvider(this.collector);
        }
        return { collector: this.collector, executor: this.executor };
    }

    /**
     * Publish `reachable` on nearby entities, or don't.
     *
     * On by default: it costs one flood fill over the build area per state
     * collect, which is nothing next to the ~15ms a collision rebuild costs. A
     * swarm large enough to care can turn it off and every `reachable` reads
     * null (unknown) rather than false. See bot/reach.ts.
     */
    setReachabilityEnabled(enabled: boolean): void {
        this.bridge().collector.setReachabilityEnabled(enabled);
    }

    /** The BotWorldState the gateway publishes: collector output plus the UI extras. */
    collectBotState(serverTick: number): BotWorldState {
        const baseState = this.bridge().collector.collectState(serverTick, true);

        const dialogOptions: Array<{ index: number; text: string; componentId?: number; buttonType?: number }> = [];
        const allDialogComponents: Array<{ id: number; type: number; buttonType: number; option: string; text: string }> = [];
        if (this.chatModalId !== -1) {
            for (const opt of this.getDialogOptions()) {
                dialogOptions.push({ index: opt.index, text: opt.text, componentId: opt.componentId, buttonType: opt.buttonType });
            }
            for (const comp of this.debugDialogComponents()) {
                allDialogComponents.push(comp);
            }
        }

        const interfaceOptions: Array<{ index: number; text: string; componentId: number }> = [];
        if (this.isViewportInterfaceOpen()) {
            for (const opt of this.getInterfaceOptions()) {
                interfaceOptions.push({ index: opt.index, text: opt.text, componentId: opt.componentId });
            }
        }

        return {
            ...baseState,
            dialog: {
                isOpen: this.isDialogOpen(),
                options: dialogOptions,
                isWaiting: this.isWaitingForDialog(),
                allComponents: allDialogComponents
            },
            interface: {
                isOpen: this.isViewportInterfaceOpen(),
                interfaceId: this.getViewportInterface(),
                options: interfaceOptions,
                debugInfo: this.isViewportInterfaceOpen() ? this.getInterfaceDebugInfo(this.getViewportInterface()) : []
            },
            modalOpen: this.isModalOpen(),
            modalInterface: this.getModalInterface()
        };
    }

    /**
     * Run a queued bot action. The one async path in ActionExecutor
     * (waitForCountDialogAndSubmit) only reaches the game through client methods,
     * so it re-activates after each await for free.
     */
    executeBotAction(action: BotAction): ActionResultOrPromise {
        return this.bridge().executor.execute(action);
    }

    // ---- simple state predicates the bridge reads ------------------------

    isModalOpen(): boolean {
        return this.mainModalId !== -1;
    }
    isDialogOpen(): boolean {
        return this.chatModalId !== -1;
    }
    getModalInterface(): number {
        return this.mainModalId;
    }
    getChatInterface(): number {
        return this.chatModalId;
    }
    isChatBackInputOpen(): boolean {
        return this.dialogInputOpen;
    }
    isWaitingForDialog(): boolean {
        return this.resumedPauseButton;
    }
    isViewportInterfaceOpen(): boolean {
        return this.mainModalId !== -1;
    }
    getViewportInterface(): number {
        return this.mainModalId;
    }
}

/**
 * Make every method activate its own interface table on entry.
 *
 * Doing it here rather than by hand in ~60 methods is the point: the failure mode
 * this guards against is silent (one bot reading another's inventory), and an
 * opt-in `activate()` call is exactly the kind of thing a new method forgets. A
 * wrapper on the prototype covers methods that don't exist yet.
 *
 * Cost is one property store per call. Field reads - `client.players`,
 * `client.localPlayer` and the rest of what StateCollector touches directly - are
 * per-instance already and need no activation.
 */
for (const name of Object.getOwnPropertyNames(LiteClient.prototype)) {
    if (name === 'constructor' || name === 'activate') {
        continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(LiteClient.prototype, name);
    if (!descriptor || typeof descriptor.value !== 'function') {
        continue; // getters (loopCycle, out) touch no interface state
    }

    const original = descriptor.value as (this: LiteClient, ...args: unknown[]) => unknown;
    Object.defineProperty(LiteClient.prototype, name, {
        ...descriptor,
        value: function (this: LiteClient, ...args: unknown[]): unknown {
            this.interfaces.activate();
            return original.apply(this, args);
        }
    });
}
