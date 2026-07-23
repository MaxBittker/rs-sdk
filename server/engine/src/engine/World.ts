// stdlib
import fs from 'fs';
import { Worker } from 'worker_threads';

// deps
import * as rsbuf from '#/network/rsbuf/index.js';
import { PlayerInfoProt } from '#/network/rsbuf/index.js';
import kleur from 'kleur';
import forge from 'node-forge';
import { TTLCache } from '@isaacs/ttlcache';

// lostcity
import CategoryType from '#/cache/config/CategoryType.js';
import Component from '#/cache/config/Component.js';
import DbRowType from '#/cache/config/DbRowType.js';
import DbTableType from '#/cache/config/DbTableType.js';
import EnumType from '#/cache/config/EnumType.js';
import FontType from '#/cache/config/FontType.js';
import HuntType from '#/cache/config/HuntType.js';
import IdkType from '#/cache/config/IdkType.js';
import InvType from '#/cache/config/InvType.js';
import LocType from '#/cache/config/LocType.js';
import MesanimType from '#/cache/config/MesanimType.js';
import NpcType from '#/cache/config/NpcType.js';
import ObjType from '#/cache/config/ObjType.js';
import ParamType from '#/cache/config/ParamType.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import SeqType from '#/cache/config/SeqType.js';
import SpotanimType from '#/cache/config/SpotanimType.js';
import StructType from '#/cache/config/StructType.js';
import VarNpcType from '#/cache/config/VarNpcType.js';
import VarPlayerType from '#/cache/config/VarPlayerType.js';
import VarSharedType from '#/cache/config/VarSharedType.js';
import { CrcBuffer32, makeCrcs } from '#/cache/CrcTable.js';
import WordEnc from '#/cache/wordenc/WordEnc.js';
import { BlockWalk } from '#/engine/entity/BlockWalk.js';
import { EntityLifeCycle } from '#/engine/entity/EntityLifeCycle.js';
import { NpcList } from '#/engine/entity/EntityList.js';
import { PlayerTimerType } from '#/engine/entity/EntityTimer.js';
import { HuntModeType } from '#/engine/entity/hunt/HuntModeType.js';
import Loc from '#/engine/entity/Loc.js';
import LocObjEvent from '#/engine/entity/LocObjEvent.js';
import { isClientConnected, NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import Npc from '#/engine/entity/Npc.js';
import { NpcEventRequest, NpcEventType } from '#/engine/entity/NpcEventRequest.js';
import { NpcStat } from '#/engine/entity/NpcStat.js';
import Obj from '#/engine/entity/Obj.js';
import Player from '#/engine/entity/Player.js';
import { PlayerLoading } from '#/engine/entity/PlayerLoading.js';
import { EntityQueueState, PlayerQueueType } from '#/engine/entity/PlayerQueueRequest.js';
import { PlayerStat, PlayerStatEnabled, PlayerStatNameMap } from '#/engine/entity/PlayerStat.js';
import { PlayerTelemetryEvent } from '#/engine/entity/tracking/PlayerTelemetry.js';
import { SessionLog } from '#/engine/entity/tracking/SessionLog.js';
import { WealthTransactionEvent, WealthEvent } from '#/engine/entity/tracking/WealthEvent.js';
import GameMap, { changeLocCollision, changeNpcCollision, changePlayerCollision } from '#/engine/GameMap.js';
import { Inventory } from '#/engine/Inventory.js';
import ScriptPointer from '#/engine/script/ScriptPointer.js';
import ScriptProvider from '#/engine/script/ScriptProvider.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';
import ScriptState from '#/engine/script/ScriptState.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import { WorldStat } from '#/engine/WorldStat.js';
import Zone from '#/engine/zone/Zone.js';
import Isaac from '#/io/Isaac.js';
import Packet from '#/io/Packet.js';
import { ReportAbuseReason } from '#/network/game/client/model/ReportAbuse.js';
import MessagePrivate from '#/network/game/server/model/MessagePrivate.js';
import UpdateFriendList from '#/network/game/server/model/UpdateFriendList.js';
import UpdateIgnoreList from '#/network/game/server/model/UpdateIgnoreList.js';
import UpdateRebootTimer from '#/network/game/server/model/UpdateRebootTimer.js';
import ClientSocket from '#/server/ClientSocket.js';
import { FriendsServerOpcodes } from '#/server/friend/FriendServer.js';
import { FriendThreadMessage } from '#/server/friend/FriendThread.js';
import { LoggerEventType } from '#/server/logger/LoggerEventType.js';
import { filteredEventTypes, groupedEventTypes } from '#/server/logger/WealthEventType.js';
import { type GenericLoginThreadResponse, isPlayerLoginResponse, isPlayerLogoutResponse } from '#/server/login/index.d.js';
import {
    trackCycleBandwidthInBytes,
    trackCycleBandwidthOutBytes,
    trackCycleClientInTime,
    trackCycleClientOutTime,
    trackCycleLoginTime,
    trackCycleLogoutTime,
    trackCycleNpcTime,
    trackCyclePlayerTime,
    trackCycleTime,
    trackCycleWorldTime,
    trackCycleZoneTime,
    trackNpcCount,
    trackPlayerCount,
    trackSessionEventsPublished
} from '#/server/Metrics.js';
import Environment from '#/util/Environment.js';
import { fromBase37, toBase37, toSafeName } from '#/util/JString.js';
import LinkList from '#/datastruct/LinkList.js';
import { printDebug, printError, printInfo } from '#/util/Logger.js';
import OnDemand from './OnDemand.js';
import { ObjDelayedRequest } from './entity/ObjDelayedRequest.js';
import DbTableIndex from '#/cache/config/DbTableIndex.js';
import VarBitType from '#/cache/config/VarBitType.js';
import FriendlistLoaded from '#/network/game/server/model/FriendlistLoaded.js';
import HashTable from '#/datastruct/HashTable.js';
import Midi from '#/cache/midi/Midi.js';

const priv = forge.pki.privateKeyFromPem(fs.readFileSync('data/config/private.pem', 'ascii'));

type LogoutRequest = {
    save: Uint8Array;
    lastAttempt: number;
};

class World {
    private loginThread = new Worker(new URL('../server/login/LoginThread.ts', import.meta.url));
    private friendThread = new Worker(new URL('../server/friend/FriendThread.ts', import.meta.url));
    private loggerThread = new Worker(new URL('../server/logger/LoggerThread.ts', import.meta.url));
    private devThread: Worker | null = null;

    private static readonly PLAYERS: number = 2047;
    private static readonly NPCS: number = Environment.runtime.maxNpcs;

    private static readonly TICKRATE: number = Environment.NODE_TICKRATE;

    private static readonly INV_STOCKRATE: number = 100; // 1m shop restocks

    private static readonly PLAYER_SAVERATE: number = 1500; // 15m autosave
    private static readonly PLAYER_COORDLOGRATE: number = 50; // 30s server check-in
    // periodic position/skills/ip snapshots for long-term visualizations: movers are
    // sampled every 33 ticks (~10s) so map traces interpolate over at most ~66 tiles,
    // idle players only on the ~30s heartbeat (every 3rd interval)
    private static readonly PLAYER_TELEMETRYRATE: number = 33;
    private static readonly PLAYER_TELEMETRY_HEARTBEAT: number = 3;
    private static readonly PLAYER_TELEMETRY_TURNBUDGET: number = 6; // max corner samples per interval per player
    private static readonly PLAYER_TELEMETRY_MINRUN: number = 3; // min straight-run tiles before a turn counts as a corner (not combat wiggle)

    // concurrent players allowed per source IP. A 1100-account swarm from two IPs OOM'd
    // the 4GB prod box on 2026-07-21; the engine otherwise accepts up to 2048 players.
    private static readonly PLAYER_MAX_PER_IP: number = Number(process.env.MAX_PLAYERS_PER_IP ?? 200);

    private static readonly PLAYER_SLOT_AUDITRATE: number = 100; // 30s at 300ms ticks

    private static readonly AFK_EVENTRATE: number = 500; // 5m: 60/5 = 12 chances per hour
    private static readonly AFK_CHANCE1: number = 1 / (120 / 5); // 1/24 - 4% chance every 5 mins: avg 1 event every 2 hrs
    private static readonly AFK_CHANCE2: number = 1 / (60 / 5); // 1/12 - 8% chance every 5 mins: avg 1 event every 1 hr while "aggro zone" hasn't changed

    private static readonly TIMEOUT_NO_CONNECTION: number = Environment.NODE_DEBUG_SOCKET ? 60000 : 500; // 5m with no connection (relaxed for bot background tabs)
    private static readonly TIMEOUT_NO_RESPONSE: number = Environment.NODE_DEBUG_SOCKET ? 60000 : 1000; // 10m without any response (relaxed for bot background tabs)

    // the game/zones map
    readonly gameMap: GameMap = new GameMap(Environment.node.members);

    // shared inventories (shops)
    readonly invs: Set<Inventory> = new Set();

    // entities
    readonly loginRequests: Map<string, ClientSocket> = new Map(); // waiting for response from login server
    readonly logoutRequests: Map<string, LogoutRequest> = new Map(); // waiting for confirmation from login server
    readonly newPlayers: Set<Player> = new Set(); // players joining at the end of this tick

    // the server processes players in the underlying bucket-order (key fragment + insertion order)
    readonly playerLoop: HashTable<Player> = new HashTable(8);
    // the client and server communicate via player "slots," separate from processing
    readonly players: Player[] = new Array(2048);

    readonly npcs: NpcList = new NpcList(World.NPCS);

    // zones
    readonly zonesTracking: Set<Zone> = new Set();
    readonly locObjTracker: LinkList<LocObjEvent> = new LinkList();
    readonly queue: LinkList<EntityQueueState> = new LinkList();
    readonly npcEventQueue: LinkList<NpcEventRequest> = new LinkList();
    readonly objDelayedQueue: LinkList<ObjDelayedRequest> = new LinkList();

    // debug data
    readonly lastCycleStats: Uint16Array = new Uint16Array(12);
    readonly cycleStats: Uint16Array = new Uint16Array(12);

    tickRate: number = World.TICKRATE; // speeds up when we're processing server shutdown
    currentTick: number = 0; // the current tick of the game world.
    nextTick: number = 0; // the next time the game world should tick.
    shutdownTick: number = -1;
    pmCount: number = 1; // can't be 0 as clients will ignore the pm, their array is filled with 0 as default

    vars: Int32Array = new Int32Array(); // var shared
    varsString: string[] = [];

    sessionLogs: SessionLog[] = [];
    pendingTelemetry: PlayerTelemetryEvent[] = [];
    wealthTransactionGroup: Map<string, WealthTransactionEvent> = new Map();
    wealthTransactions: WealthTransactionEvent[] = [];

    loginAddressAttempts: TTLCache<string, number> = new TTLCache({ ttl: 60000 });
    loginDeviceAttempts: TTLCache<string, number> = new TTLCache({ ttl: 15000 });

    constructor() {
        this.loginThread.on('message', msg => {
            try {
                this.onLoginMessage(msg);
            } catch (err) {
                console.error(err);
            }
        });

        this.friendThread.on('message', msg => {
            try {
                this.onFriendMessage(msg);
            } catch (err) {
                console.error(err);
            }
        });
    }

    get shutdown() {
        return this.shutdownTick != -1 && this.currentTick >= this.shutdownTick;
    }

    // shutting down within the next 30s
    get shutdownSoon() {
        return this.shutdownTick != -1 && this.currentTick >= this.shutdownTick - 50;
    }

    reload(clearInvs: boolean = true): void {
        OnDemand.reloadCache();

        VarPlayerType.load('data/pack');
        VarBitType.load('data/pack');
        ParamType.load('data/pack');
        ObjType.load('data/pack');
        LocType.load('data/pack');
        NpcType.load('data/pack');
        IdkType.load('data/pack');
        SeqType.load('data/pack');
        SpotanimType.load('data/pack');
        CategoryType.load('data/pack');
        EnumType.load('data/pack');
        StructType.load('data/pack');
        InvType.load('data/pack');

        if (clearInvs) {
            this.invs.clear();
            for (let id = 0; id < InvType.count; id++) {
                const inv = InvType.get(id);

                if (inv.scope === InvType.SCOPE_SHARED) {
                    this.invs.add(Inventory.fromType(id));
                } else if (inv.scope === InvType.SCOPE_TEMP) {
                    for (const player of this.playerLoop.all()) {
                        if (player.invs.has(id)) {
                            player.invs.delete(id);
                        }
                    }
                }
            }
        }

        MesanimType.load('data/pack');
        DbTableType.load('data/pack');
        DbRowType.load('data/pack');
        DbTableIndex.init();
        HuntType.load('data/pack');
        VarNpcType.load('data/pack');
        VarSharedType.load('data/pack');

        if (this.vars.length !== VarSharedType.count) {
            const old = this.vars;
            this.vars = new Int32Array(VarSharedType.count);
            for (let i = 0; i < VarSharedType.count && i < old.length; i++) {
                this.vars[i] = old[i];
            }

            const oldString = this.varsString;
            this.varsString = new Array(VarSharedType.count);
            for (let i = 0; i < VarSharedType.count && i < old.length; i++) {
                this.varsString[i] = oldString[i];
            }

            for (let i = 0; i < this.vars.length; i++) {
                const varsh = VarSharedType.get(i);
                if (varsh.type === ScriptVarType.STRING) {
                    // todo: "null"? another value?
                    continue;
                } else {
                    this.vars[i] = varsh.type === ScriptVarType.INT ? 0 : -1;
                }
            }
        }

        Component.load('data/pack');

        const count = ScriptProvider.load('data/pack');
        if (Environment.node.debug) {
            if (count === -1) {
                this.broadcastMes('There was an issue while reloading scripts.');
            } else {
                this.broadcastMes(`Loaded ${count} scripts.`);
            }
        } else {
            if (count === -1) {
                printError('There was an issue while reloading scripts.');
            } else {
                printDebug(`Loaded ${count} scripts.`);
            }
        }

        // todo: check if any jag files changed (transmitted) then reload crcs, instead of always
        makeCrcs();
    }

    async start(skipMaps = false, startCycle = true): Promise<void> {
        printInfo('Starting world');

        FontType.load('data/pack');
        WordEnc.load('data/pack');
        Midi.load();

        this.reload();

        if (!skipMaps) {
            this.gameMap.init();
        }

        setTimeout(() => {
            this.loginThread.postMessage({
                type: 'world_startup'
            });

            this.friendThread.postMessage({
                type: 'connect'
            });
        }, 2000);

        if (!Environment.node.production && Environment.build.liveReload) {
            this.createDevThread();

            if (Environment.build.startup) {
                this.rebuild();
            }
        }

        if (Environment.web.port === 80) {
            printInfo(kleur.green().bold('World ready') + kleur.white().bold(': Visit http://localhost/rs2.cgi'));
        } else {
            printInfo(kleur.green().bold('World ready') + kleur.white().bold(': Visit http://localhost:' + Environment.web.port + '/rs2.cgi'));
        }

        if (startCycle) {
            OnDemand.cycle();

            this.nextTick = Date.now() + World.TICKRATE;
            this.cycle();
        }
    }

    // ----

    cycle(): void {
        try {
            const start: number = Date.now();
            // rs-sdk: cap catch-up at 2 ticks of backlog. Sustained overload (many bots)
            // otherwise makes the world sprint at max speed until the full backlog replays.
            this.nextTick = Math.max(this.nextTick, start - this.tickRate * 2);
            const drift: number = Math.max(0, start - this.nextTick);

            // world processing
            // - world queue
            // - npc hunt
            this.processWorld();

            // client input
            // - calculate afk event readiness
            // - process packets
            // - process pathfinding/following request
            // - client input tracking
            this.processClientsIn();

            // Spawn triggers, despawn triggers
            this.processNpcEventQueue();

            // npc processing (if npc is not busy)
            // - resume suspended script
            // - stat regen
            // - timer
            // - queue
            // - movement
            // - modes
            this.processNpcs();

            // player processing
            // - primary queue
            // - weak queue
            // - timers
            // - soft timers
            // - engine queue
            // - interactions
            // - movement
            // - close interface if attempting to logout
            this.processPlayers();

            // player logout
            this.processLogouts();

            // reclaim slots held by players the player loop can no longer see
            this.auditPlayerSlots();

            // player login, good spot for it (before packets so they immediately load but after processing so nothing hits them)
            this.processLogins();

            // process zones
            // - build list of active zones around players
            // - loc/obj despawn/respawn
            // - compute shared buffer
            this.processZones();

            // process player & npc update info
            // - convert player movements
            // - compute player info
            // - convert npc movements
            // - compute npc info
            this.processInfo();

            // client output
            // - map update
            // - player info
            // - npc info
            // - zone updates
            // - inv changes
            // - stat changes
            // - afk zones changes
            // - flush packets
            this.processClientsOut();

            // cleanup
            // - reset zones
            // - reset players
            // - reset npcs
            // - reset invs
            this.processCleanup();

            // ----

            const tick: number = this.currentTick;

            if (this.shutdown) {
                this.processShutdown();
            }

            if (tick % World.PLAYER_SAVERATE === 0 && tick > 0) {
                // auto-save players every 15 mins
                this.savePlayers();
            }

            if (tick % World.PLAYER_COORDLOGRATE === 0 && tick > 0) {
                for (const player of this.playerLoop.all()) {
                    player.addSessionLog(LoggerEventType.MODERATOR, 'Server check in');
                }
            }

            // corner/teleport detection needs per-tick position deltas so straight-line
            // interpolation between samples is exact rather than clipping through walls
            for (const player of this.playerLoop.all()) {
                this.trackTelemetryMovement(player);
            }

            if (tick % World.PLAYER_TELEMETRYRATE === 0 && tick > 0) {
                const heartbeat: boolean = tick % (World.PLAYER_TELEMETRYRATE * World.PLAYER_TELEMETRY_HEARTBEAT) === 0;
                for (const player of this.playerLoop.all()) {
                    player.telemetryTurnBudget = World.PLAYER_TELEMETRY_TURNBUDGET;
                    if (heartbeat || player.x !== player.lastTelemetryX || player.z !== player.lastTelemetryZ || player.level !== player.lastTelemetryLevel) {
                        this.pendingTelemetry.push(this.buildTelemetryEvent(player));
                    }
                }
            }

            if (this.pendingTelemetry.length > 0 && tick % World.PLAYER_TELEMETRYRATE === 0) {
                this.loggerThread.postMessage({
                    type: 'player_telemetry',
                    events: this.pendingTelemetry
                });
                this.pendingTelemetry = [];
            }

            // todo: move this into PLAYER_COORDLOGRATE if memory usage is sane?
            if (this.sessionLogs.length > 0) {
                this.loggerThread.postMessage({
                    type: 'session_log',
                    logs: this.sessionLogs
                });

                this.sessionLogs = [];
            }

            if (this.wealthTransactionGroup.size > 0) {
                this.wealthTransactions.push(...this.wealthTransactionGroup.values());

                this.wealthTransactionGroup.clear();
            }

            if (this.wealthTransactions.length > 0) {
                this.loggerThread.postMessage({
                    type: 'wealth_event',
                    events: this.wealthTransactions
                });

                this.wealthTransactions = [];
            }

            this.cycleStats[WorldStat.CYCLE] = Date.now() - start; // set the main logic stat here, before telemetry.

            this.lastCycleStats[WorldStat.CYCLE] = this.cycleStats[WorldStat.CYCLE];
            this.lastCycleStats[WorldStat.WORLD] = this.cycleStats[WorldStat.WORLD];
            this.lastCycleStats[WorldStat.CLIENT_IN] = this.cycleStats[WorldStat.CLIENT_IN];
            this.lastCycleStats[WorldStat.NPC] = this.cycleStats[WorldStat.NPC];
            this.lastCycleStats[WorldStat.PLAYER] = this.cycleStats[WorldStat.PLAYER];
            this.lastCycleStats[WorldStat.LOGOUT] = this.cycleStats[WorldStat.LOGOUT];
            this.lastCycleStats[WorldStat.LOGIN] = this.cycleStats[WorldStat.LOGIN];
            this.lastCycleStats[WorldStat.ZONE] = this.cycleStats[WorldStat.ZONE];
            this.lastCycleStats[WorldStat.CLIENT_OUT] = this.cycleStats[WorldStat.CLIENT_OUT];
            this.lastCycleStats[WorldStat.CLEANUP] = this.cycleStats[WorldStat.CLEANUP];
            this.lastCycleStats[WorldStat.BANDWIDTH_IN] = this.cycleStats[WorldStat.BANDWIDTH_IN];
            this.lastCycleStats[WorldStat.BANDWIDTH_OUT] = this.cycleStats[WorldStat.BANDWIDTH_OUT];

            // push stats to prometheus
            if (Environment.node.production) {
                trackPlayerCount.set(this.getTotalPlayers());
                trackNpcCount.set(this.getTotalNpcs());

                trackCycleTime.observe(this.cycleStats[WorldStat.CYCLE]);
                trackCycleWorldTime.observe(this.cycleStats[WorldStat.WORLD]);
                trackCycleClientInTime.observe(this.cycleStats[WorldStat.CLIENT_IN]);
                trackCycleClientOutTime.observe(this.cycleStats[WorldStat.CLIENT_OUT]);
                trackCycleNpcTime.observe(this.cycleStats[WorldStat.NPC]);
                trackCyclePlayerTime.observe(this.cycleStats[WorldStat.PLAYER]);
                trackCycleZoneTime.observe(this.cycleStats[WorldStat.ZONE]);
                trackCycleLoginTime.observe(this.cycleStats[WorldStat.LOGIN]);
                trackCycleLogoutTime.observe(this.cycleStats[WorldStat.LOGOUT]);

                trackCycleBandwidthInBytes.inc(this.cycleStats[WorldStat.BANDWIDTH_IN]);
                trackCycleBandwidthOutBytes.inc(this.cycleStats[WorldStat.BANDWIDTH_OUT]);
            }

            if (Environment.node.debugProfile) {
                printInfo(`tick ${this.currentTick}: ${this.cycleStats[WorldStat.CYCLE]}/${this.tickRate} ms, ${Math.trunc(process.memoryUsage().heapTotal / 1024 / 1024)} MB heap`);
                printDebug(`${this.getTotalPlayers()}/${World.PLAYERS} players | ${this.getTotalNpcs()}/${World.NPCS} npcs | ${this.gameMap.getTotalZones()} zones | ${this.gameMap.getTotalLocs()} locs | ${this.gameMap.getTotalObjs()} objs`);
                printDebug(
                    `${this.cycleStats[WorldStat.WORLD]} ms world | ${this.cycleStats[WorldStat.CLIENT_IN]} ms client in | ${this.cycleStats[WorldStat.NPC]} ms npcs | ${this.cycleStats[WorldStat.PLAYER]} ms players | ${this.cycleStats[WorldStat.LOGOUT]} ms logout | ${this.cycleStats[WorldStat.LOGIN]} ms login | ${this.cycleStats[WorldStat.ZONE]} ms zones | ${this.cycleStats[WorldStat.CLIENT_OUT]} ms client out | ${this.cycleStats[WorldStat.CLEANUP]} ms cleanup`
                );
            }

            this.currentTick++;
            this.nextTick += this.tickRate;

            // ----

            setTimeout(this.cycle.bind(this), Math.max(0, this.tickRate - (Date.now() - start) - drift));
        } catch (err) {
            if (err instanceof Error) {
                printError('eep eep cabbage! An unhandled error occurred during the cycle: ' + err.message);
                console.error(err.stack);
            }

            printError('Removing all players...');

            for (const player of this.playerLoop.all()) {
                this.removePlayer(player);
            }

            // TODO inform Friends server that the world has gone offline

            printError('All players removed.');
            printError('Closing the server.');
            process.exit(1);
        }
    }

    // - world queue
    // - npc hunt
    private processWorld(): void {
        const start: number = Date.now();

        // - world queue
        for (const request of this.queue.all()) {
            const delay = request.delay--;
            if (delay > 0) {
                continue;
            }

            const script: ScriptState = request.script;
            try {
                const state: number = ScriptRunner.execute(script);

                // remove from queue no matter what, re-adds if necessary
                request.unlink();

                if (state === ScriptState.SUSPENDED) {
                    // suspend to player (probably not needed)
                    script.activePlayer.activeScript = script;
                } else if (state === ScriptState.NPC_SUSPENDED) {
                    // suspend to npc (probably not needed)
                    script.activeNpc.activeScript = script;
                } else if (state === ScriptState.WORLD_SUSPENDED) {
                    // suspend to world again
                    this.enqueueScript(script, script.popInt());
                }
            } catch (err) {
                console.error(err);
            }
        }

        // - add objs delayed
        for (const request of this.objDelayedQueue.all()) {
            const delay = request.delay--;
            if (delay > 0) {
                continue;
            }
            try {
                request.unlink();
                this.addObj(request.obj, request.receiver64, request.duration);
            } catch (err) {
                console.error(err);
            }
        }

        // - npc hunt players if not busy
        if (this.getTotalPlayers() > 0) {
            for (const npc of this.npcs) {
                // Check if npc is alive
                if (npc.isActive) {
                    // Hunts will process even if the npc is delayed during this portion
                    if (npc.huntMode !== -1 && rsbuf.getNpcObservers(npc.nid) > 0) {
                        const hunt = HuntType.get(npc.huntMode);

                        if (hunt && hunt.type === HuntModeType.PLAYER) {
                            npc.huntAll(hunt);
                        }
                    }
                }
            }
        }

        this.cycleStats[WorldStat.WORLD] = Date.now() - start;
    }

    // - calculate afk event readiness
    // - process packets
    // - process pathfinding/following request
    // - client input tracking
    private processClientsIn(): void {
        const start: number = Date.now();

        this.cycleStats[WorldStat.BANDWIDTH_IN] = 0;

        for (const player of this.playerLoop.all()) {
            try {
                player.playtime++;

                if (this.currentTick % World.AFK_EVENTRATE === 0) {
                    player.afkEventReady = Math.random() < (player.zonesAfk() ? World.AFK_CHANCE2 : World.AFK_CHANCE1);
                }

                // - client input tracking
                player.processInputTracking();

                if (isClientConnected(player) && player.decodeIn()) {
                    if (player.userPath.length > 0 || player.opcalled) {
                        if (player.delayed) {
                            player.unsetMapFlag();
                            continue;
                        }

                        if (!player.busy() && player.opcalled) {
                            player.moveClickRequest = false;
                        } else {
                            player.moveClickRequest = true;
                        }
                    }
                }

                if (player.logMessage !== null) {
                    this.logPublicChat(player, player.logMessage);
                }
            } catch (err) {
                console.error(err);
                if (isClientConnected(player)) {
                    player.logout();
                    player.client.close();
                }
            }
        }

        this.cycleStats[WorldStat.CLIENT_IN] = Date.now() - start;
    }

    // Despawn and respawn
    private processNpcEventQueue(): void {
        for (const request of this.npcEventQueue.all()) {
            const npc = request.npc;
            if (!npc.delayed) {
                request.unlink();
                const state = ScriptRunner.init(request.script, npc);
                npc.executeScript(state);
            }
        }
    }

    // - resume suspended script
    // - stat regen
    // - timer
    // - queue
    // - movement
    // - modes
    private processNpcs(): void {
        const start: number = Date.now();
        for (const npc of this.npcs) {
            try {
                npc.turn();
            } catch (err) {
                console.error(err);
                this.removeNpc(npc, -1);
            }
        }
        this.cycleStats[WorldStat.NPC] = Date.now() - start;
    }

    // - resume suspended script
    // - primary queue
    // - weak queue
    // - timers
    // - soft timers
    // - engine queue
    // - interactions
    // - movement
    // - close interface if attempting to logout
    private processPlayers(): void {
        const start: number = Date.now();

        for (const player of this.playerLoop.all()) {
            try {
                if (player.delayed && this.currentTick >= player.delayedUntil) player.delayed = false;

                // - resume suspended script
                if (!player.delayed && player.activeScript && player.activeScript.execution === ScriptState.SUSPENDED) {
                    player.executeScript(player.activeScript, true, true);
                }

                // - primary queue
                // - weak queue
                player.processQueues();
                if (!player.loggingOut) {
                    // - timers
                    player.processTimers(PlayerTimerType.NORMAL);
                    // - soft timers
                    player.processTimers(PlayerTimerType.SOFT);
                }
                // - engine queue
                player.processEngineQueue();
                // Update target facing
                player.setFaceEntity();
                // - interactions
                // - movement
                player.processInteraction();

                // - run energy
                player.updateEnergy();

                if ((player.masks & PlayerInfoProt.EXACT_MOVE) == 0) {
                    player.validateDistanceWalked();
                }
            } catch (err) {
                console.error(err);
                console.warn(`[LOGOUT DEBUG] Server exception during player tick for ${player.username} - forcing logout`);
                if (isClientConnected(player)) {
                    player.logout();
                    player.client.close();
                }
            }
        }

        this.cycleStats[WorldStat.PLAYER] = Date.now() - start;
    }

    private processLogouts(): void {
        const start: number = Date.now();

        for (const player of this.playerLoop.all()) {
            let force = false;
            if (this.shutdown || this.currentTick - player.lastResponse >= World.TIMEOUT_NO_RESPONSE) {
                // world shutdown or x-logged / timed out for 60s: force logout
                console.warn(`[LOGOUT DEBUG] Server forcing logout for ${player.username} - shutdown=${this.shutdown}, ticksSinceResponse=${this.currentTick - player.lastResponse}, timeout=${World.TIMEOUT_NO_RESPONSE}`);
                player.loggingOut = true;
                force = true;
            } else if (this.currentTick - player.lastConnected >= World.TIMEOUT_NO_CONNECTION) {
                // connection lost for 30s: request idle logout
                console.warn(`[LOGOUT DEBUG] Server requesting idle logout for ${player.username} - ticksSinceConnected=${this.currentTick - player.lastConnected}, timeout=${World.TIMEOUT_NO_CONNECTION}`);
                player.requestIdleLogout = true;
            }

            if (player.requestLogout || player.requestIdleLogout) {
                if (this.currentTick >= player.preventLogoutUntil) {
                    console.warn(`[LOGOUT DEBUG] processLogouts: Setting loggingOut=true for ${player.username} (requestLogout=${player.requestLogout}, requestIdleLogout=${player.requestIdleLogout})`);
                    player.loggingOut = true;
                } else if (player.requestLogout && player.preventLogoutMessage !== null) {
                    player.messageGame(player.preventLogoutMessage); // engine message type in osrs
                    player.preventLogoutMessage = null;
                }
                player.requestLogout = false;
                player.requestIdleLogout = false;
            }

            if (player.loggingOut && (force || this.currentTick >= player.preventLogoutUntil)) {
                player.closeModal();

                let queueDiscardable = true;
                for (const request of player.queue.all()) {
                    if (request.type === PlayerQueueType.LONG) {
                        const logoutAction = request.args[0];
                        if (logoutAction === 1) {
                            // ^discard
                            continue;
                        }
                    }
                    queueDiscardable = false;
                    break;
                }
                if (player.canAccess() && player.engineQueue.head() === null && queueDiscardable) {
                    const script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.LOGOUT, -1, -1);
                    if (!script) {
                        printError('LOGOUT TRIGGER IS BROKEN!');
                        continue;
                    }

                    const state = ScriptRunner.init(script, player);
                    state.pointerAdd(ScriptPointer.ProtectedActivePlayer);
                    ScriptRunner.execute(state);

                    this.removePlayer(player);
                }
            }
        }

        for (const [username, request] of this.logoutRequests) {
            if (request.lastAttempt < Date.now() - 15000) {
                request.lastAttempt = Date.now();
                this.loginThread.postMessage({
                    type: 'player_logout',
                    username,
                    save: request.save
                });
            }
        }

        this.cycleStats[WorldStat.LOGOUT] = Date.now() - start;
    }

    private processLogins(): void {
        const start: number = Date.now();

        // counted once per tick; sessions admitted below increment it so a burst of
        // logins from one IP can't all slip under the cap in the same tick
        let ipCounts: Map<string, number> | null = null;
        if (this.newPlayers.size > 0) {
            ipCounts = new Map();
            for (const other of this.playerLoop.all()) {
                if (other instanceof NetworkPlayer) {
                    const ip = other.client.remoteAddress;
                    ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
                }
            }
        }

        player: for (const player of this.newPlayers) {
            // prevent logging in if a player save is being flushed
            if (this.logoutRequests.has(player.username)) {
                player.addSessionLog(LoggerEventType.ENGINE, 'Tried to log in - old session is mid-logout');

                if (isClientConnected(player)) {
                    player.client.send(Uint8Array.from([5]));
                    player.client.close();
                }

                continue;
            }

            // reconnect a new socket with player in the world
            if (player.reconnecting) {
                for (const other of this.playerLoop.all()) {
                    if (player.username !== other.username) {
                        continue;
                    }

                    // Save current state on reconnect to prevent progress loss from browser crashes
                    // Without this, fast reconnects prevent timeout-triggered saves from ever firing
                    this.loginThread.postMessage({
                        type: 'player_autosave',
                        username: other.username,
                        save: other.save()
                    });

                    if (isClientConnected(other)) {
                        player.addSessionLog(LoggerEventType.MODERATOR, 'Logged to world ' + Environment.node.id + ' replacing session', other.client.uuid);
                        other.client.close();
                    }

                    if (other instanceof NetworkPlayer && player instanceof NetworkPlayer) {
                        other.client = player.client;
                        other.session = other.client.uuid;
                        other.client.send(Uint8Array.from([15]));
                    }

                    rsbuf.cleanupPlayerBuildArea(other.slot);

                    other.onReconnect();

                    this.friendThread.postMessage({
                        type: 'player_login',
                        username: other.username,
                        chatModePrivate: other.privateChat,
                        staffLvl: other.staffModLevel
                    });

                    continue player;
                }
            }

            // player already logged in - kick the existing session and transfer their state to the new login
            for (const other of this.playerLoop.all()) {
                if (player.username !== other.username) {
                    continue;
                }

                if (player instanceof NetworkPlayer) {
                    player.addSessionLog(LoggerEventType.ENGINE, 'Kicking existing session to allow new login');
                }
                other.addSessionLog(LoggerEventType.ENGINE, 'Kicked due to login from another session');

                // Save the existing player's in-memory state before removing them
                // This prevents losing progress when the new login was loaded from stale disk save
                const existingSave = other.save();
                const client = isClientConnected(player) ? player.client : null;

                // Re-create the new player from the existing player's current state
                this.newPlayers.delete(player);
                const transferredPlayer = PlayerLoading.load(player.username, new Packet(existingSave), client);

                // Preserve login metadata from the original login response
                transferredPlayer.reconnecting = player.reconnecting;
                transferredPlayer.staffModLevel = player.staffModLevel;
                transferredPlayer.lowMemory = player.lowMemory;
                transferredPlayer.muted_until = player.muted_until;
                transferredPlayer.members = player.members;
                transferredPlayer.messageCount = player.messageCount;

                this.newPlayers.add(transferredPlayer);

                // Remove the old player WITHOUT flushing to disk
                // State is already transferred to the new player, so no need to save
                // This avoids a race condition where the old logout could interfere with the new player's save
                this.removePlayerWithoutSave(other);

                // Skip the rest of this iteration - transferredPlayer will be processed
                // on the next iteration of the outer loop. Without this, the original
                // player would continue to the normal login process and get added to
                // this.players, causing an infinite loop when transferredPlayer is processed.
                continue player;
            }

            // prevent logging in when the server is shutting down
            if (this.shutdownSoon) {
                if (isClientConnected(player)) {
                    player.addSessionLog(LoggerEventType.ENGINE, 'Tried to log in - server is shutting down');
                    this.forceLogout(player, 14);
                }

                continue;
            }

            // per-IP connection cap - reconnects and session transfers never reach here,
            // so this only gates net-new sessions
            if (player instanceof NetworkPlayer && ipCounts) {
                const ip = player.client.remoteAddress;
                const count = ipCounts.get(ip) ?? 0;
                if (count >= World.PLAYER_MAX_PER_IP) {
                    player.addSessionLog(LoggerEventType.ENGINE, `Tried to log in - too many connections from ${ip}`);
                    this.forceLogout(player, 7);
                    continue;
                }
                ipCounts.set(ip, count + 1);
            }

            // normal login process
            const slot: number = this.getNextPlayerSlot();
            if (slot === -1) {
                // world full
                if (isClientConnected(player)) {
                    player.addSessionLog(LoggerEventType.ENGINE, 'Tried to log in - world full');
                    this.forceLogout(player, 7);
                }
                continue;
            }

            if (isClientConnected(player)) {
                if (player.reconnecting) {
                    player.addSessionLog(LoggerEventType.MODERATOR, 'Logged in (client reports reconnecting)');
                } else {
                    player.addSessionLog(LoggerEventType.MODERATOR, 'Logged in');
                }

                player.client.state = 1;

                player.client.send(
                    Uint8Array.from([
                        2,
                        Math.min(player.staffModLevel, 2),
                        1 // mouse tracking can only be enabled on login
                    ])
                );

                const remote = player.client.remoteAddress;
                if (remote.indexOf('.') !== -1) {
                    // IPv4 - last octet determines the bucket
                    const octets = remote.split('.');
                    const bucket = (parseInt(octets[0]) << 24) | (parseInt(octets[1]) << 16) | (parseInt(octets[2]) << 8) | parseInt(octets[3]);
                    this.playerLoop.add(BigInt(bucket), player);
                } else if (remote.indexOf(':') !== -1) {
                    // IPv6 - site prefix determines the bucket.
                    // Compressed addresses (e.g. "2a01:4f8::2") can yield an empty hextet ->
                    // parseInt('') = NaN -> BigInt(NaN) THROWS, aborting processLogins for every
                    // queued player this tick (and forever after, since newPlayers is only
                    // cleared at the end). Fall back to bucket 0 for unparseable prefixes.
                    const hextets = remote.split(':');
                    const bucket = parseInt(hextets[2], 16) % 256;
                    this.playerLoop.add(BigInt(Number.isNaN(bucket) ? 0 : bucket), player);
                } else {
                    // unknown address format - still must enter the player loop or they become
                    // a zombie (in world, but never processed and never sent another packet)
                    this.playerLoop.add(0n, player);
                }
            } else {
                // 127.0.0.1
                this.playerLoop.add(2130706433n, player);
            }

            this.players[slot] = player;
            rsbuf.addPlayer(slot);
            player.slot = slot;
            player.uid = ((Number(player.username37 & 0x1fffffn) << 11) | player.slot) >>> 0;
            player.tele = true;
            player.moveClickRequest = false;

            this.gameMap.getZone(player.x, player.z, player.level).enter(player);
            player.onLogin();

            if (this.shutdownTick != -1) {
                player.write(new UpdateRebootTimer(this.shutdownTick - this.currentTick));
            }

            this.friendThread.postMessage({
                type: 'player_login',
                username: player.username,
                chatModePrivate: player.privateChat,
                staffLvl: player.staffModLevel
            });
        }
        this.newPlayers.clear();
        this.cycleStats[WorldStat.LOGIN] = Date.now() - start;
    }

    // - loc/obj despawn/respawn
    // - compute shared buffer
    private processZones(): void {
        const start: number = Date.now();
        try {
            for (const event of this.locObjTracker.all()) {
                // Check if the event is still valid
                if (event.check()) {
                    event.entity.turn();
                }
                // If this is false, we have not constructed our LinkedList properly somewhere
                else {
                    console.error('Loc Obj event is invalid');
                }
            }

            // Compute shared for tracked zones
            for (const zone of this.zonesTracking) {
                zone.computeShared();
            }
        } catch (err) {
            if (err instanceof Error) {
                printError(`Error during processZones: ${err.message}`);
                console.error(err.stack);
            }
        }
        this.cycleStats[WorldStat.ZONE] = Date.now() - start;
    }

    // - convert player movements
    // - compute player info
    // - convert npc movements
    // - compute npc info
    private processInfo(): void {
        if (this.getTotalPlayers() === 0) {
            return;
        }

        // TODO: benchmark this?
        for (const player of this.playerLoop.all()) {
            player.reorient();
            player.buildArea.rebuildNormal(); // set origin before compute player is why this is above.

            const appearance = player.masks & PlayerInfoProt.APPEARANCE ? player.generateAppearance() : (player.appearanceBuf ?? player.generateAppearance());

            rsbuf.computePlayer(
                player.x,
                player.level,
                player.z,
                player.originX,
                player.originZ,
                player.slot,
                player.tele,
                player.jump,
                player.runDir,
                player.walkDir,
                player.visibility,
                player.isActive,
                player.masks,
                appearance,
                player.lastAppearance,
                player.faceEntity,
                player.faceSquareX,
                player.faceSquareZ,
                player.faceAngleX,
                player.faceAngleZ,
                player.hitmarkDamage,
                player.hitmarkType,
                player.hitmark2Damage,
                player.hitmark2Type,
                player.levels[PlayerStat.HITPOINTS],
                player.baseLevels[PlayerStat.HITPOINTS],
                player.animId,
                player.animDelay,
                player.sayMessage,
                player.chatMessage,
                player.chatColour ?? -1,
                player.chatEffect ?? -1,
                player.chatRights ?? 0,
                player.spotanimId,
                player.spotanimHeight,
                player.spotanimTime,
                player.exactStartX,
                player.exactStartZ,
                player.exactEndX,
                player.exactEndZ,
                player.exactMoveStart,
                player.exactMoveEnd,
                player.exactMoveFacing
            );
        }

        for (const npc of this.npcs) {
            npc.reorient();
            rsbuf.computeNpc(
                npc.x,
                npc.level,
                npc.z,
                npc.nid,
                npc.type,
                npc.tele,
                npc.jump,
                npc.runDir,
                npc.walkDir,
                npc.isActive,
                npc.masks,
                npc.faceEntity,
                npc.faceSquareX,
                npc.faceSquareZ,
                npc.faceAngleX,
                npc.faceAngleZ,
                npc.hitmarkDamage,
                npc.hitmarkType,
                npc.hitmark2Damage,
                npc.hitmark2Type,
                npc.levels[NpcStat.HITPOINTS],
                npc.baseLevels[NpcStat.HITPOINTS],
                npc.animId,
                npc.animDelay,
                npc.sayMessage,
                npc.spotanimId,
                npc.spotanimHeight,
                npc.spotanimTime
            );
        }
    }

    // - map update
    // - player info
    // - npc info
    // - zone updates
    // - inv changes
    // - stat changes
    // - afk zones changes
    // - flush packets
    private processClientsOut(): void {
        const start: number = Date.now();

        this.cycleStats[WorldStat.BANDWIDTH_OUT] = 0; // reset bandwidth counter

        for (const player of this.playerLoop.all()) {
            if (!isClientConnected(player)) {
                continue;
            }

            try {
                // - map update
                player.updateMap();
                // - player info
                player.updatePlayers();
                // - npc info
                player.updateNpcs();
                // - zone updates
                player.updateZones();
                // - inv changes
                player.updateInvs();
                // - stat changes
                player.updateStats();
                // - afk zones changes
                player.updateAfkZones();

                // - flush packets
                player.encodeOut();
            } catch (err) {
                console.error(err);
                if (isClientConnected(player)) {
                    player.logout();
                    player.client.close();
                }
            }
        }
        this.cycleStats[WorldStat.CLIENT_OUT] = Date.now() - start;
    }

    // - reset zones
    // - reset players
    // - reset npcs
    // - reset invs
    private processCleanup(): void {
        const start: number = Date.now();
        const tick: number = this.currentTick;

        // - reset zones
        this.zonesTracking.forEach(zone => zone.reset());
        this.zonesTracking.clear();

        // - reset players
        for (const player of this.playerLoop.all()) {
            player.resetEntity(false);

            // - reset invs (players)
            for (const inv of player.invs.values()) {
                if (!inv) {
                    continue;
                }

                inv.resetTracking();
            }
        }

        // - reset npcs
        for (const npc of this.npcs) {
            npc.resetEntity(false);
        }

        // - reset invs (world)
        for (const inv of this.invs) {
            inv.resetTracking();

            // Increase or Decrease shop stock
            const invType = InvType.get(inv.type);

            if (!invType.restock || !invType.stockcount || !invType.stockrate) {
                continue;
            }

            for (let index: number = 0; index < inv.items.length; index++) {
                const item = inv.items[index];
                if (!item) {
                    continue;
                }
                // Item stock is under min
                if (item.count < invType.stockcount[index] && tick % invType.stockrate[index] === 0) {
                    inv.add(item.id, 1, index);
                    inv.update = true;
                    continue;
                }
                // Item stock is over min
                if (item.count > invType.stockcount[index] && tick % invType.stockrate[index] === 0) {
                    inv.remove(item.id, 1, index);
                    inv.update = true;
                    continue;
                }

                // Item stock is not listed, such as general stores
                // Tested on low and high player count worlds, ever 1 minute stock decreases.
                if (invType.allstock && !invType.stockcount[index] && tick % World.INV_STOCKRATE === 0) {
                    inv.remove(item.id, 1, index);
                    inv.update = true;
                }
            }
        }

        rsbuf.cleanup();

        this.cycleStats[WorldStat.CLEANUP] = Date.now() - start;
    }

    private processShutdown(): void {
        for (const player of this.playerLoop.all()) {
            if (isClientConnected(player)) {
                player.logout();
                player.client.close();
            }
        }

        const duration = this.currentTick - this.shutdownTick;
        if (duration >= 1024) {
            // force remove all players, they had their chances to finish processing
            for (const player of this.playerLoop.all()) {
                player.addSessionLog(LoggerEventType.ENGINE, 'Player force removed!');
                printError(`Player '${player.username}' force removed!`);
                this.removePlayer(player);
            }
        }

        const online = this.getTotalPlayers();
        if (online === 0 && this.logoutRequests.size === 0) {
            printInfo('Server shutdown complete');
            process.exit(0);
        }

        if (duration > 2) {
            // after 1 second, kick into high gear (need time to flush logout packets first)
            this.tickRate = 0;
        }
    }

    private savePlayers(): void {
        // skip in web worker contexts (but not bun/node where self === globalThis)
        if (typeof self !== 'undefined' && typeof process === 'undefined') {
            return;
        }

        for (const player of this.playerLoop.all()) {
            this.loginThread.postMessage({
                type: 'player_autosave',
                username: player.username,
                save: player.save()
            });
        }
    }

    enqueueScript(script: ScriptState, delay: number = 0): void {
        this.queue.addTail(new EntityQueueState(script, delay + 1));
    }

    getInventory(inv: number): Inventory | null {
        if (inv === -1) {
            return null;
        }

        for (const inventory of this.invs) {
            if (inventory.type === inv) {
                return inventory;
            }
        }

        const inventory: Inventory = Inventory.fromType(inv);
        this.invs.add(inventory);
        return inventory;
    }

    addNpc(npc: Npc, duration: number, firstSpawn: boolean = true): void {
        if (firstSpawn) {
            rsbuf.addNpc(npc.nid, npc.type);
            this.npcs.set(npc.nid, npc);
        }

        npc.x = npc.startX;
        npc.z = npc.startZ;
        npc.isActive = true;

        const zone = this.gameMap.getZone(npc.x, npc.z, npc.level);
        zone.enter(npc);

        switch (npc.blockWalk) {
            case BlockWalk.NPC:
                changeNpcCollision(npc.width, npc.x, npc.z, npc.level, true);
                break;
            case BlockWalk.ALL:
                changeNpcCollision(npc.width, npc.x, npc.z, npc.level, true);
                changePlayerCollision(npc.width, npc.x, npc.z, npc.level, true);
                break;
        }

        npc.resetEntity(true);
        npc.playAnimation(-1, 0);

        // Queue spawn trigger
        const type = NpcType.get(npc.type);
        const script = ScriptProvider.getByTrigger(ServerTriggerType.AI_SPAWN, type.id, type.category);
        if (script) {
            this.npcEventQueue.addTail(new NpcEventRequest(NpcEventType.SPAWN, script, npc));
        }

        if (duration > -1) {
            npc.setLifeCycle(duration);
        }
    }

    removeNpc(npc: Npc, duration: number): void {
        const zone = this.gameMap.getZone(npc.x, npc.z, npc.level);
        const adjustedDuration = this.scaleByPlayerCount(duration);
        zone.leave(npc);
        npc.isActive = false;

        switch (npc.blockWalk) {
            case BlockWalk.NPC:
                changeNpcCollision(npc.width, npc.x, npc.z, npc.level, false);
                break;
            case BlockWalk.ALL:
                changeNpcCollision(npc.width, npc.x, npc.z, npc.level, false);
                changePlayerCollision(npc.width, npc.x, npc.z, npc.level, false);
                break;
        }

        if (npc.lifecycle === EntityLifeCycle.DESPAWN) {
            rsbuf.removeNpc(npc.nid);
            this.npcs.remove(npc.nid);
            npc.cleanup();
        } else if (npc.lifecycle === EntityLifeCycle.RESPAWN && duration > -1) {
            npc.setLifeCycle(adjustedDuration);
        }
    }

    getLoc(x: number, z: number, level: number, locId: number): Loc | null {
        return this.gameMap.getZone(x, z, level).getLoc(x, z, locId);
    }

    getObj(x: number, z: number, level: number, objId: number, receiver64: bigint): Obj | null {
        return this.gameMap.getZone(x, z, level).getObj(x, z, objId, receiver64);
    }

    getObjOfReceiver(x: number, z: number, level: number, objId: number, receiver64: bigint): Obj | null {
        return this.gameMap.getZone(x, z, level).getObjOfReceiver(x, z, objId, receiver64);
    }

    trackZone(zone: Zone): void {
        this.zonesTracking.add(zone);
    }

    addLoc(loc: Loc, duration: number): void {
        // printDebug(`[World] addLoc => name: ${LocType.get(loc.type).name}, duration: ${duration}`);
        const type: LocType = LocType.get(loc.type);
        if (type.blockwalk) {
            changeLocCollision(loc.shape, loc.angle, type.blockrange, type.length, type.width, type.active, loc.x, loc.z, loc.level, true);
        }

        const zone: Zone = this.gameMap.getZone(loc.x, loc.z, loc.level);
        zone.addLoc(loc);
        this.trackZone(zone);
        loc.setLifeCycle(duration);
    }

    changeLoc(loc: Loc, typeID: number, shape: number, angle: number, duration: number) {
        // If a dynamic loc is inactive, it should never return to the game world
        if (loc.lifecycle === EntityLifeCycle.DESPAWN && !loc.isValid()) {
            return;
        }

        // Remove previous collision from game world if loc is active
        if (loc.isActive) {
            const fromType: LocType = LocType.get(loc.type);
            if (fromType.blockwalk) {
                changeLocCollision(loc.shape, loc.angle, fromType.blockrange, fromType.length, fromType.width, fromType.active, loc.x, loc.z, loc.level, false);
            }
        }

        // Update loc to new type
        loc.change(typeID, shape, angle);

        // Add new collision to game world
        const type: LocType = LocType.get(typeID);
        if (type.blockwalk) {
            changeLocCollision(loc.shape, loc.angle, type.blockrange, type.length, type.width, type.active, loc.x, loc.z, loc.level, true);
        }

        // Notify zone that loc has been changed
        const zone: Zone = this.gameMap.getZone(loc.x, loc.z, loc.level);
        zone.changeLoc(loc);
        this.trackZone(zone);

        // If the loc is changed or dynamic, set the lifecycle
        if (loc.isChanged() || loc.lifecycle === EntityLifeCycle.DESPAWN) {
            loc.setLifeCycle(duration);
        }
        // If the loc is static and unchanged (i.e., the change didn't do anything)
        else {
            loc.setLifeCycle(-1);
        }
    }

    mergeLoc(loc: Loc, player: Player, startCycle: number, endCycle: number, south: number, east: number, north: number, west: number): void {
        // printDebug(`[World] mergeLoc => name: ${LocType.get(loc.type).name}`);
        const zone: Zone = this.gameMap.getZone(loc.x, loc.z, loc.level);
        zone.mergeLoc(loc, player, startCycle, endCycle, south, east, north, west);
        this.trackZone(zone);
    }

    animLoc(loc: Loc, seq: number): void {
        // printDebug(`[World] animLoc => name: ${LocType.get(loc.type).name}, seq: ${seq}`);
        const zone: Zone = this.gameMap.getZone(loc.x, loc.z, loc.level);
        zone.animLoc(loc, seq);
        this.trackZone(zone);
    }

    removeLoc(loc: Loc, duration: number): void {
        // Locs can only be removed if they are currently active
        if (!loc.isActive) {
            return;
        }

        const type: LocType = LocType.get(loc.type);
        if (type.blockwalk) {
            changeLocCollision(loc.shape, loc.angle, type.blockrange, type.length, type.width, type.active, loc.x, loc.z, loc.level, false);
        }

        const zone: Zone = this.gameMap.getZone(loc.x, loc.z, loc.level);
        zone.removeLoc(loc);
        this.trackZone(zone);

        // If the Loc is static, set a respawn duratio
        if (loc.lifecycle === EntityLifeCycle.RESPAWN) {
            loc.setLifeCycle(duration);
        }
        // Dynamic locs get removed permanently
        else {
            loc.setLifeCycle(-1);
        }
    }

    revertLoc(loc: Loc) {
        // Remove previous collision from game world
        const fromType: LocType = LocType.get(loc.type);
        if (fromType.blockwalk) {
            changeLocCollision(loc.shape, loc.angle, fromType.blockrange, fromType.length, fromType.width, fromType.active, loc.x, loc.z, loc.level, false);
        }

        // Update loc to new type
        loc.revert();

        // Add new collision to game world
        const type: LocType = LocType.get(loc.type);
        if (type.blockwalk) {
            changeLocCollision(loc.shape, loc.angle, type.blockrange, type.length, type.width, type.active, loc.x, loc.z, loc.level, true);
        }

        // Notify zone that loc has been changed
        const zone: Zone = this.gameMap.getZone(loc.x, loc.z, loc.level);
        zone.changeLoc(loc);
        loc.setLifeCycle(-1);
        this.trackZone(zone);
    }

    addObj(obj: Obj, receiver64: bigint, duration: number): void {
        // Dev note: This function is slightly messy. Perhaps this can be organized better
        // Check if we need to changeobj first
        if (ObjType.get(obj.type).stackable && obj.lifecycle === EntityLifeCycle.DESPAWN) {
            const existing = this.getObjOfReceiver(obj.x, obj.z, obj.level, obj.type, receiver64);
            if (existing && existing.lifecycle === EntityLifeCycle.DESPAWN) {
                const nextCount = obj.count + existing.count;
                if (nextCount <= Inventory.STACK_LIMIT) {
                    // If an obj of the same type exists and is stackable and have the same receiver, then we merge them.
                    this.changeObj(existing, nextCount);
                    // Set the lifecycle without all the extra logic surrounding it
                    existing.lifecycleTick = duration;
                    return;
                }
            }
        }

        const zone: Zone = this.gameMap.getZone(obj.x, obj.z, obj.level);
        zone.addObj(obj, receiver64);
        this.trackZone(zone);

        // rs-sdk: scale the despawn timer for perishable ground items so bots have more
        // time to reach a drop. RESPAWN objs use `duration` as a respawn delay, so leave
        // those untouched. objDespawnScale is a percent (100 = vanilla).
        if (obj.lifecycle === EntityLifeCycle.DESPAWN && duration > 0) {
            duration = Math.max(1, Math.round((duration * Environment.node.objDespawnScale) / 100));
        }

        // If the obj is dropped to a specific person
        if (receiver64 !== Obj.NO_RECEIVER) {
            // objs with a receiver attempt to reveal after objRevealTicks ticks.
            // items that can't be revealed (untradable, members obj in f2p) will be skipped in revealObj
            obj.setLifeCycle(duration);
            obj.receiver64 = receiver64;

            // rs-sdk: configurable reveal delay (default Obj.REVEAL). Clamp to >=1 so a
            // receiver-scoped obj is never stuck permanently private (reveal countdown hits 0).
            obj.reveal = Math.max(1, Environment.node.objRevealTicks);
        }
        // If the obj is dropped to all
        else {
            obj.reveal = -1;
            obj.setLifeCycle(duration);
        }
    }

    revealObj(obj: Obj): void {
        const zone: Zone = this.gameMap.getZone(obj.x, obj.z, obj.level);
        zone.revealObj(obj);
        this.trackZone(zone);
    }

    changeObj(obj: Obj, newCount: number): void {
        // printDebug(`[World] changeObj => name: ${ObjType.get(obj.type).name}, receiverId: ${receiverId}, newCount: ${newCount}`);
        const zone: Zone = this.gameMap.getZone(obj.x, obj.z, obj.level);
        zone.changeObj(obj, obj.count, newCount);
        this.trackZone(zone);
    }

    // Dev note: this function is slightly awkward, might need reworked
    removeObj(obj: Obj, duration: number): void {
        // Obj must be active to remove it from the world. An inactive Obj is already removed
        if (!obj.isActive) {
            return;
        }
        // printDebug(`[World] removeObj => name: ${ObjType.get(obj.type).name}, duration: ${duration}`);
        const zone: Zone = this.gameMap.getZone(obj.x, obj.z, obj.level);
        const adjustedDuration = this.scaleByPlayerCount(duration);
        zone.removeObj(obj);
        this.trackZone(zone);

        // If the duration is positive and the Obj is a static obj, queue the Obj to respawn
        if (duration > 0 && obj.lifecycle === EntityLifeCycle.RESPAWN) {
            obj.setLifeCycle(adjustedDuration);
        } else {
            obj.setLifeCycle(-1);
        }
    }

    animMap(level: number, x: number, z: number, spotanim: number, height: number, delay: number): void {
        const zone: Zone = this.gameMap.getZone(x, z, level);
        zone.animMap(x, z, spotanim, height, delay);
        this.trackZone(zone);
    }

    mapProjAnim(level: number, x: number, z: number, dstX: number, dstZ: number, target: number, spotanim: number, srcHeight: number, dstHeight: number, startDelay: number, endDelay: number, peak: number, arc: number): void {
        const zone: Zone = this.gameMap.getZone(x, z, level);
        zone.mapProjAnim(x, z, dstX, dstZ, target, spotanim, srcHeight, dstHeight, startDelay, endDelay, peak, arc);
        this.trackZone(zone);
    }

    // ----

    addFriend(player: Player, targetUsername37: bigint) {
        //printDebug(`[World] addFriend => player: ${player.username}, target: ${targetUsername37} (${fromBase37(targetUsername37)})`);
        this.friendThread.postMessage({
            type: 'player_friendslist_add',
            username: player.username,
            target: targetUsername37
        });
    }

    removeFriend(player: Player, targetUsername37: bigint) {
        //printDebug(`[World] removeFriend => player: ${player.username}, target: ${targetUsername37} (${fromBase37(targetUsername37)})`);
        this.friendThread.postMessage({
            type: 'player_friendslist_remove',
            username: player.username,
            target: targetUsername37
        });
    }

    addIgnore(player: Player, targetUsername37: bigint) {
        //printDebug(`[World] addIgnore => player: ${player.username}, target: ${targetUsername37} (${fromBase37(targetUsername37)})`);
        this.friendThread.postMessage({
            type: 'player_ignorelist_add',
            username: player.username,
            target: targetUsername37
        });
    }

    removeIgnore(player: Player, targetUsername37: bigint) {
        //printDebug(`[World] removeIgnore => player: ${player.username}, target: ${targetUsername37} (${fromBase37(targetUsername37)})`);
        this.friendThread.postMessage({
            type: 'player_ignorelist_remove',
            username: player.username,
            target: targetUsername37
        });
    }

    sendPrivateChatModeToFriendsServer(player: Player): void {
        this.friendThread.postMessage({
            type: 'player_chat_setmode',
            username: player.username,
            chatModePrivate: player.privateChat
        });
    }

    logPublicChat(player: Player, chat: string) {
        this.friendThread.postMessage({
            type: 'public_message',
            session_uuid: player.session,
            coord: player.coord,
            chat
        });
    }

    removePlayer(player: Player): void {
        if (player.slot === -1) {
            return;
        }

        console.warn(`[LOGOUT DEBUG] Server removePlayer() called for ${player.username}`);
        if (isClientConnected(player)) {
            player.logout();
            player.client.close();
        }

        rsbuf.removePlayer(player.slot);
        this.gameMap.getZone(player.x, player.z, player.level).leave(player);
        delete this.players[player.slot];
        player.unlink();
        changeNpcCollision(player.width, player.x, player.z, player.level, false);
        player.cleanup();

        player.isActive = false;

        player.addSessionLog(LoggerEventType.MODERATOR, 'Logged out');
        this.flushPlayer(player);

        this.friendThread.postMessage({
            type: 'player_logout',
            username: player.username
        });
    }

    // Remove player during session takeover - don't flush to disk since state is transferred to new session
    removePlayerWithoutSave(player: Player): void {
        if (player.slot === -1) {
            return;
        }

        console.warn(`[LOGOUT DEBUG] Server removePlayerWithoutSave() called for ${player.username} (session takeover)`);
        if (isClientConnected(player)) {
            player.logout();
            player.client.close();
        }

        rsbuf.removePlayer(player.slot);
        this.gameMap.getZone(player.x, player.z, player.level).leave(player);
        delete this.players[player.slot];
        player.unlink();
        changeNpcCollision(player.width, player.x, player.z, player.level, false);
        player.cleanup();

        player.isActive = false;

        player.addSessionLog(LoggerEventType.MODERATOR, 'Logged out (session takeover)');
        // Don't call flushPlayer - state is already transferred to the new session

        this.friendThread.postMessage({
            type: 'player_logout',
            username: player.username
        });
    }

    // let the login server know this player can log in elsewhere, do not update save file
    forceLogout(player: Player, response = -1) {
        console.warn(`[LOGOUT DEBUG] Server forceLogout() called for ${player.username} (response=${response})`);
        this.loginThread.postMessage({
            type: 'player_force_logout',
            username: player.username
        });

        if (isClientConnected(player)) {
            if (response !== -1) {
                player.client.send(Uint8Array.from([response]));
            }

            player.client.close();
        }
    }

    sendPrivateMessage(player: Player, targetUsername37: bigint, message: string): void {
        //printDebug(`[World] sendPrivateMessage => player: ${player.username}, target: ${targetUsername37} (${fromBase37(targetUsername37)}), message: '${message}'`);

        this.friendThread.postMessage({
            type: 'private_message',
            username: player.username,
            staffLvl: player.staffModLevel,
            pmId: (Environment.node.id << 24) + ((Math.random() * 0xff) << 16) + this.pmCount++,
            target: targetUsername37,
            message: message,
            coord: player.coord
        });
    }

    getNextPlayerSlot(): number {
        for (let i = 1; i < 2047; i++) {
            if (typeof this.players[i] === 'undefined') {
                return i;
            }
        }

        return -1;
    }

    getPlayer(slot: number): Player | undefined {
        return this.players[slot];
    }

    getPlayerByUid(uid: number): Player | null {
        const slot = uid & 0x7ff;
        const hash = (uid >> 11) & 0x1fffff;

        const player = this.getPlayer(slot);
        if (!player) {
            return null;
        }

        if (Number(player.username37 & 0x1fffffn) !== hash) {
            return null;
        }

        return player;
    }

    getPlayerByUsername(username: string): Player | undefined {
        const username37: bigint = toBase37(username);
        for (const player of this.playerLoop.all()) {
            if (player.username37 === username37) {
                return player;
            }
        }

        for (const player of this.newPlayers) {
            if (player.username37 === username37) {
                return player;
            }
        }

        return undefined;
    }

    getPlayerByHash64(hash64: bigint): Player | undefined {
        for (const player of this.playerLoop.all()) {
            if (player.hash64 === hash64) {
                return player;
            }
        }

        return undefined;
    }

    // todo: could cache this, or increment/decrement on add/remove
    getTotalPlayers(): number {
        let count = 0;

        for (let i = 1; i < 2047; i++) {
            if (typeof this.players[i] !== 'undefined') {
                count++;
            }
        }

        return count;
    }

    // players[] is what getTotalPlayers() counts, and that count gates logins (world full /
    // maxConnected). A player that ends up in players[] but not in the player loop is never
    // ticked, never times out and never logs out, so its slot leaks forever and the phantom
    // count eventually locks everyone out. That can't happen by design - reclaim and shout if
    // it ever does again rather than quietly refusing every new login.
    private auditPlayerSlots(): void {
        if (this.currentTick % World.PLAYER_SLOT_AUDITRATE !== 0) {
            return;
        }

        const live: Set<Player> = new Set(this.playerLoop.all());

        for (let slot = 1; slot < 2047; slot++) {
            const player = this.players[slot];
            if (typeof player === 'undefined' || live.has(player)) {
                continue;
            }

            printError(`Reclaiming orphaned player slot ${slot} ('${player.username}') - not in the player loop`);
            this.removePlayer(player);

            if (typeof this.players[slot] !== 'undefined') {
                // removePlayer bailed (e.g. slot already reset to -1) - drop the slot anyway
                delete this.players[slot];
            }
        }
    }

    scaleByPlayerCount(rate: number): number {
        // not sure if it caps at 2k player count or not
        const playerCount = Math.min(this.getTotalPlayers(), 2000);
        return (((4000 - playerCount) * rate) / 4000) | 0; // assuming scale works the same way as the runescript one
    }

    getTotalNpcs(): number {
        return this.npcs.count;
    }

    getNpc(nid: number): Npc | undefined {
        return this.npcs.get(nid);
    }

    getNpcByUid(uid: number): Npc | null {
        const slot = uid & 0xffff;
        const type = (uid >> 16) & 0xffff;

        const npc = this.getNpc(slot);
        if (!npc || npc.type !== type) {
            return null;
        }

        return npc;
    }

    getNextNid(): number {
        return this.npcs.next();
    }

    private createDevThread() {
        this.devThread = new Worker(new URL('../cache/DevThread.ts', import.meta.url));

        this.devThread.on('message', msg => {
            try {
                if (msg.type === 'dev_reload') {
                    this.reload();
                } else if (msg.type === 'dev_failure') {
                    if (msg.error) {
                        console.error(msg.error);

                        this.broadcastMes(msg.error.replaceAll(`${Environment.build.srcDir}/scripts/`, ''));
                        this.broadcastMes('Check the console for more information.');
                    }
                } else if (msg.type === 'dev_progress') {
                    if (msg.broadcast) {
                        printDebug(msg.broadcast);

                        this.broadcastMes(msg.broadcast);
                    } else if (msg.text) {
                        printInfo(msg.text);
                    }
                }
            } catch (err) {
                console.error(err);
            }
        });

        // todo: catch all cases where it might exit instead of throwing an error, so we aren't
        // re-initializing the file watchers after errors
        this.devThread.on('exit', () => {
            try {
                // todo: remove this mes after above the todo above is addressed
                this.broadcastMes('Error while rebuilding - see console for more info.');

                this.createDevThread();
            } catch (err) {
                console.error(err);
            }
        });
    }

    rebootTimer(duration: number): void {
        this.shutdownTick = this.currentTick + duration;

        for (const player of this.playerLoop.all()) {
            player.write(new UpdateRebootTimer(this.shutdownTick - this.currentTick));
        }
    }

    get isPendingShutdown(): boolean {
        return this.shutdownTicksRemaining > -1;
    }

    get shutdownTicksRemaining(): number {
        return this.shutdownTick - this.currentTick;
    }

    broadcastMes(message: string): void {
        for (const player of this.playerLoop.all()) {
            if (message.includes('\n')) {
                message.split('\n').forEach(wrap => player.wrappedMessageGame(wrap));
            } else {
                player.wrappedMessageGame(message);
            }
        }
    }

    rebuild() {
        if (this.devThread) {
            this.devThread.postMessage({
                type: 'world_rebuild'
            });
        }
    }

    onLoginMessage(msg: GenericLoginThreadResponse) {
        if (isPlayerLoginResponse(msg)) {
            const { socket } = msg;
            if (!this.loginRequests.has(socket)) {
                // socket disconnected (or was culled) while the login thread was processing -
                // the reply has nowhere to go. Log it: from the player's perspective this is
                // a login that hangs forever on "Connecting to server..."
                console.warn(`[World] Dropping login reply ${msg.reply} for vanished socket ${socket}`);
                return;
            }

            const { reply } = msg;
            const client = this.loginRequests.get(socket)!;
            this.loginRequests.delete(socket);

            if (reply === -1) {
                // login server offline
                client.send(Uint8Array.from([8]));
                client.close();
                return;
            } else if (reply === 1) {
                // invalid username or password
                client.send(Uint8Array.from([3]));
                client.close();
                return;
            } else if (reply === 3) {
                // already logged in (on another world)
                client.send(Uint8Array.from([5]));
                client.close();
                return;
            } else if (reply === 5) {
                // account has been disabled (banned)
                client.send(Uint8Array.from([4]));
                client.close();
                return;
            } else if (reply === 6) {
                // login limit exceeded
                client.send(Uint8Array.from([9]));
                client.close();
                return;
            } else if (reply === 7) {
                // rejected
                client.send(Uint8Array.from([11]));
                client.close();
                return;
            } else if (reply === 8) {
                // too many attempts
                client.send(Uint8Array.from([16]));
                client.close();
                return;
            } else if (reply === 9) {
                // logging in to p2p on a f2p account
                client.send(Uint8Array.from([12]));
                client.close();
                return;
            } else if (reply === 10) {
                // hop timer
                const { remaining } = msg;
                client.send(Uint8Array.from([21, Math.min(255, remaining! / 1000)]));
                client.close();
                return;
            }

            const { username, lowMemory, reconnecting, staffmodlevel, muted_until, members, messageCount } = msg;
            const save = msg.save ?? new Uint8Array();

            // if (reconnecting && !this.getPlayerByUsername(username)) {
            //     // rejected
            //     client.send(Uint8Array.from([11]));
            //     client.close();
            //     return;
            // } else
            if (!save && !reconnecting) {
                // rejected
                client.send(Uint8Array.from([11]));
                client.close();
                return;
            }

            try {
                const player = PlayerLoading.load(username, new Packet(save), client);

                player.session = client.uuid;
                player.reconnecting = reconnecting;
                player.staffModLevel = staffmodlevel ?? 0;
                player.lowMemory = lowMemory;
                player.muted_until = muted_until ? new Date(muted_until) : null;
                player.members = members;
                player.messageCount = messageCount ?? 0;

                if (this.logoutRequests.has(username)) {
                    // already logged in (on another world)
                    client.send(Uint8Array.from([5]));
                    client.close();
                    return;
                }

                if (!Environment.node.members && !this.gameMap.isFreeToPlay(player.x, player.z)) {
                    // in a p2p zone when logging into f2p
                    if (player.members) {
                        client.send(Uint8Array.from([17]));
                        client.close();
                        this.loginThread.postMessage({
                            type: 'player_force_logout',
                            username: username
                        });
                        return;
                    }
                    player.teleport(3221, 3219, 0);
                }

                this.newPlayers.add(player);
                client.state = 1;
            } catch (err) {
                if (err instanceof Error) {
                    console.error(username, err.message);
                }

                // bad save :( the player won't be happy
                client.send(Uint8Array.from([13]));
                client.close();

                // todo: maybe we can tell the login thread to swap for the last-good save?
                this.loginThread.postMessage({
                    type: 'player_force_logout',
                    username: username
                });
            }
        } else if (isPlayerLogoutResponse(msg)) {
            const { username, success } = msg;
            if (!this.logoutRequests.has(username)) {
                return;
            }

            if (success) {
                this.logoutRequests.delete(username);
            }
        }
    }

    onFriendMessage(msg: FriendThreadMessage) {
        const { opcode, data } = msg;
        try {
            if (opcode === FriendsServerOpcodes.UPDATE_FRIENDLIST) {
                const username37 = BigInt(data.username37);

                // TODO make getPlayerByUsername37?
                const player = this.getPlayerByUsername(fromBase37(username37));
                if (!player) {
                    printError(`FriendThread: player ${fromBase37(username37)} not found`);
                    return;
                }

                for (let i = 0; i < data.friends.length; i++) {
                    const [world, friendUsername37] = data.friends[i];
                    player.write(new UpdateFriendList(BigInt(friendUsername37), world));
                }

                player.write(new FriendlistLoaded(2));
            } else if (opcode === FriendsServerOpcodes.UPDATE_IGNORELIST) {
                const username37 = BigInt(data.username37);

                // TODO make getPlayerByUsername37?
                const player = this.getPlayerByUsername(fromBase37(username37));
                if (!player) {
                    printError(`FriendThread: player ${fromBase37(username37)} not found`);
                    return;
                }

                const ignored: bigint[] = data.ignored.map((i: string) => BigInt(i));
                player.write(new UpdateIgnoreList(ignored));
            } else if (opcode == FriendsServerOpcodes.PRIVATE_MESSAGE) {
                // username37: username.toString(),
                // targetUsername37: target.toString(),
                // staffLvl,
                // pmId,
                // chat

                const fromPlayer = BigInt(data.username37);
                const fromPlayerStaffLvl = data.staffLvl;
                const pmId = data.pmId;
                const target = BigInt(data.targetUsername37);

                const player = this.getPlayerByUsername(fromBase37(target));
                if (!player) {
                    printError(`FriendThread: player ${fromBase37(target)} not found`);
                    return;
                }

                const chat = data.chat;

                player.write(new MessagePrivate(fromPlayer, pmId, fromPlayerStaffLvl, chat));
            } else if (opcode === FriendsServerOpcodes.RELAY_MUTE) {
                const { username, muted_until } = data;

                const player = this.getPlayerByUsername(username);
                if (player) {
                    player.muted_until = muted_until ? new Date(muted_until) : null;
                }
            } else if (opcode === FriendsServerOpcodes.RELAY_KICK) {
                const { username } = data;

                const player = this.getPlayerByUsername(username);
                if (player) {
                    console.warn(`[LOGOUT DEBUG] RELAY_KICK received for ${username} from friends server`);
                    player.loggingOut = true;

                    if (isClientConnected(player)) {
                        player.logout();
                        player.client.close();
                    }
                }
            } else if (opcode === FriendsServerOpcodes.RELAY_BROADCAST) {
                const { message } = data;

                this.broadcastMes(message);
            } else if (opcode === FriendsServerOpcodes.RELAY_SHUTDOWN) {
                const { duration } = data;

                this.rebootTimer(duration);
            } else if (opcode === FriendsServerOpcodes.RELAY_TRACK) {
                const { username, state } = data;

                const player = this.getPlayerByUsername(username);
                if (player) {
                    player.input.active = state;
                }
            } else if (opcode === FriendsServerOpcodes.RELAY_RELOAD) {
                this.reload(false);
            } else if (opcode === FriendsServerOpcodes.RELAY_CLEARLOGINS) {
                this.loginRequests.clear();
            } else if (opcode === FriendsServerOpcodes.RELAY_CLEARLOGOUTS) {
                this.logoutRequests.clear();
            } else if (opcode === FriendsServerOpcodes.RELAY_QUEUESCRIPT) {
                const { scriptName, username } = data;

                const player = this.getPlayerByUsername(username);
                if (player) {
                    const script = ScriptProvider.getByName(`[queue,${scriptName}]`);

                    if (script) {
                        player.enqueueScript(script);
                    }
                }
            } else {
                printError('Unknown friend message: ' + opcode);
            }
        } catch (err) {
            console.log(err);
        }
    }

    static loginBuf = Packet.alloc(1);

    onClientData(client: ClientSocket) {
        if (client.state !== 0) {
            // connection negotiation only
            return;
        }

        if (client.available < 1) {
            return;
        }

        if (client.opcode === -1) {
            World.loginBuf.pos = 0;
            client.read(World.loginBuf.data, 0, 1);

            // todo: login encoders/decoders
            client.opcode = World.loginBuf.g1();

            if (client.opcode === 14) {
                client.waiting = 1;
            } else if (client.opcode === 16 || client.opcode === 18) {
                client.waiting = -1;
            } else {
                client.waiting = 0;
            }
        }

        if (client.waiting === -1) {
            World.loginBuf.pos = 0;
            client.read(World.loginBuf.data, 0, 1);

            client.waiting = World.loginBuf.g1();
        } else if (client.waiting === -2) {
            World.loginBuf.pos = 0;
            client.read(World.loginBuf.data, 0, 2);

            client.waiting = World.loginBuf.g2();
        }

        if (client.available < client.waiting) {
            return;
        }

        World.loginBuf.pos = 0;
        client.read(World.loginBuf.data, 0, client.waiting);

        if (client.opcode === 14) {
            client.send(Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0]));

            if (Environment.node.production && Environment.node.rateLimitAddressLogin > 0) {
                const last = this.loginAddressAttempts.get(client.remoteAddress);
                const attempts = last ? last + 1 : 1;
                this.loginAddressAttempts.set(client.remoteAddress, attempts);

                if (attempts >= Environment.node.rateLimitAddressLogin) {
                    // login attempts exceeded
                    client.send(Uint8Array.from([16]));
                    client.close();
                    return;
                }
            }

            const _loginServer = World.loginBuf.g1(); // jagex stores player saves on different servers
            client.send(Uint8Array.from([0]));

            const seed = new Packet(new Uint8Array(8));
            seed.p4(Math.floor(Math.random() * 0x00ffffff));
            seed.p4(Math.floor(Math.random() * 0xffffffff));
            client.send(seed.data);
        } else if (client.opcode === 16 || client.opcode === 18) {
            let rev = World.loginBuf.g1();
            if (rev === 0xff) {
                rev = World.loginBuf.g2();
            }
            if (rev !== Environment.engine.revision) {
                client.send(Uint8Array.from([6]));
                client.close();
                return;
            }

            const info = World.loginBuf.g1();
            const lowMemory = (info & 0x1) !== 0;

            const crcs = new Uint8Array(9 * 4);
            World.loginBuf.gdata(crcs, 0, crcs.length);

            if (CrcBuffer32 !== Packet.getcrc(crcs, 0, crcs.length)) {
                client.send(Uint8Array.from([6]));
                client.close();
                return;
            }

            World.loginBuf.rsadec(priv);

            if (World.loginBuf.g1() !== 10) {
                // RSA error
                // sending out of date intentionally
                client.send(Uint8Array.from([6]));
                client.close();
                return;
            }

            const seed = [];
            for (let i = 0; i < 4; i++) {
                seed[i] = World.loginBuf.g4s();
            }
            client.decryptor = new Isaac(seed);

            for (let i = 0; i < 4; i++) {
                seed[i] += 50;
            }
            client.encryptor = new Isaac(seed);

            const uid = World.loginBuf.g4s();
            const username = World.loginBuf.gjstr();
            const password = World.loginBuf.gjstr();

            if (Environment.node.production && Environment.node.rateLimitDeviceLogin > 0) {
                const last = this.loginDeviceAttempts.get(`${uid}@${client.remoteAddress}`);
                const attempts = last ? last + 1 : 1;
                this.loginDeviceAttempts.set(`${uid}@${client.remoteAddress}`, attempts);

                if (attempts >= Environment.node.rateLimitDeviceLogin) {
                    // login attempts exceeded
                    client.send(Uint8Array.from([16]));
                    client.close();
                    return;
                }
            }

            if (username.length < 1 || username.length > 12) {
                client.send(Uint8Array.from([3]));
                client.close();
                return;
            }

            if (password.length < 1 || password.length > 20) {
                client.send(Uint8Array.from([3]));
                client.close();
                return;
            }

            if (this.getTotalPlayers() > Environment.node.maxConnected) {
                client.send(Uint8Array.from([7]));
                client.close();
                return;
            }

            if (this.logoutRequests.has(username)) {
                // still trying to log out from the last session on this world!
                client.send(Uint8Array.from([5]));
                client.close();
                return;
            }

            const safeName = toSafeName(username);

            this.loginRequests.set(client.uuid, client);
            this.loginThread.postMessage({
                type: 'player_login',
                socket: client.uuid,
                remoteAddress: client.remoteAddress,
                username: safeName,
                password,
                uid,
                lowMemory,
                reconnecting: client.opcode === 18,
                hasSave: client.opcode === 18 ? typeof this.getPlayerByUsername(username) !== 'undefined' : false
            });
        } else if (client.opcode === 15) {
            client.state = 2;
            client.send(new Uint8Array(8));
        } else {
            client.terminate();
        }

        client.opcode = -1;
    }

    addSessionLog(event_type: LoggerEventType, session_uuid: string, coord: number, message: string, ...args: string[]) {
        this.sessionLogs.push({
            session_uuid,
            timestamp: Date.now(),
            coord,
            event: args.length ? message + ' ' + args.join(' ') : message,
            event_type
        });
        trackSessionEventsPublished.inc();
    }

    // emit extra samples at path corners and teleports so the map's straight-line
    // interpolation between consecutive samples matches the tiles actually walked
    private trackTelemetryMovement(player: Player): void {
        const px: number = player.telemetryPrevX;
        const pz: number = player.telemetryPrevZ;
        player.telemetryPrevX = player.x;
        player.telemetryPrevZ = player.z;
        if (px === -1) {
            return;
        }

        const dx: number = player.x - px;
        const dz: number = player.z - pz;
        if (dx === 0 && dz === 0) {
            return;
        }

        if (Math.abs(dx) > 2 || Math.abs(dz) > 2) {
            // teleport/jump - pin both ends so no line can be drawn across the gap
            this.pendingTelemetry.push(this.buildTelemetryEvent(player, px, pz));
            this.pendingTelemetry.push(this.buildTelemetryEvent(player));
            player.telemetryDirX = 0;
            player.telemetryDirZ = 0;
            player.telemetryRunLen = 0;
            return;
        }

        const sx: number = Math.sign(dx);
        const sz: number = Math.sign(dz);
        if ((player.telemetryDirX !== 0 || player.telemetryDirZ !== 0) && (sx !== player.telemetryDirX || sz !== player.telemetryDirZ)) {
            // direction changed - the previous tile is a path corner. Emit it if the
            // straight run into it was long enough to be real movement (not combat
            // wiggle), so interpolated segments hug the actual path around obstacles.
            if (player.telemetryTurnBudget > 0 && player.telemetryRunLen >= World.PLAYER_TELEMETRY_MINRUN) {
                player.telemetryTurnBudget--;
                this.pendingTelemetry.push(this.buildTelemetryEvent(player, px, pz));
            }
            player.telemetryRunLen = 0;
        }
        player.telemetryRunLen += Math.max(Math.abs(dx), Math.abs(dz));
        player.telemetryDirX = sx;
        player.telemetryDirZ = sz;
    }

    private buildTelemetryEvent(player: Player, overrideX?: number, overrideZ?: number): PlayerTelemetryEvent {
        let totalXp = 0;
        let baseLevelSum = 0;
        for (let i = 0; i < player.stats.length; i++) {
            if (PlayerStatEnabled[i]) {
                totalXp += player.stats[i];
                baseLevelSum += player.baseLevels[i];
            }
        }

        // total_xp is on every row; the full blob only when a base level changed, since
        // grinding bots gain xp every snapshot and would bloat the table otherwise
        let skills: string | null = null;
        if (player.lastTelemetryBaseLevelSum !== baseLevelSum) {
            const blob: Record<string, { xp: number; level: number }> = {};
            for (let i = 0; i < player.stats.length; i++) {
                const name = PlayerStatNameMap.get(i);
                if (name && PlayerStatEnabled[i]) {
                    blob[name.toLowerCase()] = { xp: player.stats[i], level: player.baseLevels[i] };
                }
            }
            skills = JSON.stringify(blob);
            player.lastTelemetryBaseLevelSum = baseLevelSum;
        }

        const x: number = overrideX ?? player.x;
        const z: number = overrideZ ?? player.z;
        player.lastTelemetryX = x;
        player.lastTelemetryZ = z;
        player.lastTelemetryLevel = player.level;

        return {
            timestamp: Date.now(),
            username: player.username,
            session_uuid: player.session !== 'headless' ? player.session : null,
            x,
            z,
            level: player.level,
            ip: player instanceof NetworkPlayer ? player.client.remoteAddress : null,
            total_xp: totalXp,
            skills
        };
    }

    addWealthEvent(event: WealthEvent) {
        if (filteredEventTypes.includes(event.event_type) && Math.abs(event.account_value) < Environment.node.minimumWealthValueEvent) {
            return;
        }

        const transaction: WealthTransactionEvent = {
            timestamp: Date.now(),
            ...event
        };

        if (!groupedEventTypes.includes(event.event_type)) {
            this.wealthTransactions.push(transaction);
            return;
        }

        const key = JSON.stringify({
            type: event.event_type,
            session: event.session_uuid,
            recipient: event.recipient_session,
            coord: event.coord,
            tick: this.currentTick
        });

        const entry = this.wealthTransactionGroup.get(key);
        if (entry) {
            entry.account_items.push(...event.account_items);
            entry.account_value += event.account_value;
        } else {
            this.wealthTransactionGroup.set(key, transaction);
        }
    }

    notifyPlayerBan(staff: string, username: string, until: number) {
        const other = this.getPlayerByUsername(username);
        if (other) {
            console.warn(`[LOGOUT DEBUG] notifyPlayerBan: ${username} banned by ${staff} until ${until}`);
            other.loggingOut = true;
            if (isClientConnected(other)) {
                other.logout();
                other.client.close();
            }
        }

        this.loginThread.postMessage({
            type: 'player_ban',
            staff,
            username,
            until
        });
    }

    notifyPlayerMute(staff: string, username: string, until: number) {
        const other = this.getPlayerByUsername(username);
        if (other) {
            other.muted_until = new Date(until);
        }

        this.loginThread.postMessage({
            type: 'player_mute',
            staff,
            username,
            until: until
        });
    }

    notifyPlayerReport(player: Player, offender: string, reason: ReportAbuseReason) {
        if (reason === ReportAbuseReason.MACROING || reason === ReportAbuseReason.BUG_ABUSE) {
            const offenderPlayer = this.getPlayerByUsername(offender);
            if (offenderPlayer) {
                // Immediately turn on tracking when a user is reported as macroing or abusing a bug.
                offenderPlayer.input.active = true;
            }
        }
        this.loggerThread.postMessage({
            type: 'report',
            session_uuid: player.session,
            coord: player.coord,
            offender,
            reason
        });
    }

    submitInputTracking(player: Player, buf: Uint8Array) {
        this.loggerThread.postMessage({
            type: 'input_track',
            session_uuid: player.session,
            timestamp: Date.now(),
            buf: Buffer.from(buf).toString('base64')
        });
    }

    flushPlayer(player: Player) {
        const save = player.save();

        this.logoutRequests.set(player.username, {
            save,
            lastAttempt: -1
        });
    }
}

export default new World();
