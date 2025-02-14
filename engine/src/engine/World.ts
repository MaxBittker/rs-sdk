// stdlib
import fs from 'fs';
import { Worker as NodeWorker } from 'worker_threads';

// deps
import kleur from 'kleur';
import forge from 'node-forge';

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
import SeqFrame from '#/cache/config/SeqFrame.js';
import SeqType from '#/cache/config/SeqType.js';
import SpotanimType from '#/cache/config/SpotanimType.js';
import StructType from '#/cache/config/StructType.js';
import VarNpcType from '#/cache/config/VarNpcType.js';
import VarPlayerType from '#/cache/config/VarPlayerType.js';
import VarSharedType from '#/cache/config/VarSharedType.js';
import WordEnc from '#/cache/wordenc/WordEnc.js';
import { CrcBuffer32, makeCrcs, makeCrcsAsync } from '#/cache/CrcTable.js';
import { preloadClient, preloadClientAsync } from '#/cache/PreloadedPacks.js';

import { CoordGrid } from '#/engine/CoordGrid.js';
import GameMap, { changeLocCollision, changeNpcCollision, changePlayerCollision } from '#/engine/GameMap.js';
import { Inventory } from '#/engine/Inventory.js';
import WorldStat from '#/engine/WorldStat.js';

import ScriptProvider from '#/engine/script/ScriptProvider.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';
import ScriptState from '#/engine/script/ScriptState.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import Zone from '#/engine/zone/Zone.js';
import PlayerRenderer from '#/engine/renderer/PlayerRenderer.js';
import NpcRenderer from '#/engine/renderer/NpcRenderer.js';

import InfoProt from '#/network/rs225/server/prot/InfoProt.js';

import BlockWalk from '#/engine/entity/BlockWalk.js';
import Loc from '#/engine/entity/Loc.js';
import Npc from '#/engine/entity/Npc.js';
import Obj from '#/engine/entity/Obj.js';
import Player from '#/engine/entity/Player.js';
import EntityLifeCycle from '#/engine/entity/EntityLifeCycle.js';
import { NpcList, PlayerList } from '#/engine/entity/EntityList.js';
import { isClientConnected, NetworkPlayer } from '#/engine/entity/NetworkPlayer.js';
import { EntityQueueState, PlayerQueueType } from '#/engine/entity/EntityQueueRequest.js';
import { PlayerTimerType } from '#/engine/entity/EntityTimer.js';

import UpdateRebootTimer from '#/network/server/model/UpdateRebootTimer.js';
import UpdateFriendList from '#/network/server/model/UpdateFriendList.js';
import UpdateIgnoreList from '#/network/server/model/UpdateIgnoreList.js';
import MessagePrivate from '#/network/server/model/MessagePrivate.js';

import ClientSocket from '#/server/ClientSocket.js';
import { FriendsServerOpcodes } from '#/server/friend/FriendServer.js';

import Packet from '#/io/Packet.js';

import Environment from '#/util/Environment.js';
import { printDebug, printError, printInfo } from '#/util/Logger.js';
import { createWorker } from '#/util/WorkerFactory.js';
import HuntModeType from '#/engine/entity/hunt/HuntModeType.js';
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
    trackPlayerCount
} from '#/server/Metrics.js';
import WalkTriggerSetting from '#/util/WalkTriggerSetting.js';
import LinkList from '#/util/LinkList.js';
import { fromBase37, toBase37, toSafeName } from '#/util/JString.js';
import { PlayerLoading } from '#/engine/entity/PlayerLoading.js';
import ScriptPointer from '#/engine/script/ScriptPointer.js';
import Isaac from '#/io/Isaac.js';
import LoggerEventType from '#/server/logger/LoggerEventType.js';
import MoveSpeed from '#/engine/entity/MoveSpeed.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import InputTrackingEvent from './entity/tracking/InputEvent.js';
import { SessionLog } from '#/engine/entity/tracking/SessionLog.js';

const priv = forge.pki.privateKeyFromPem(Environment.STANDALONE_BUNDLE ? await (await fetch('data/config/private.pem')).text() : fs.readFileSync('data/config/private.pem', 'ascii'));

type LogoutRequest = {
    save: Uint8Array;
    lastAttempt: number;
};

class World {
    private loginThread = createWorker(Environment.STANDALONE_BUNDLE ? 'LoginThread.js' : './server/login/LoginThread.ts');
    private friendThread = createWorker(Environment.STANDALONE_BUNDLE ? 'FriendThread.js' : './server/friend/FriendThread.ts');
    private loggerThread = createWorker(Environment.STANDALONE_BUNDLE ? 'LoggerThread.js' : './server/logger/LoggerThread.ts');
    private devThread: Worker | NodeWorker | null = null;

    private static readonly PLAYERS: number = Environment.NODE_MAX_PLAYERS;
    private static readonly NPCS: number = Environment.NODE_MAX_NPCS;

    private static readonly TICKRATE: number = 600; // 0.6s / 600ms

    private static readonly INV_STOCKRATE: number = 100; // 1m
    private static readonly AFK_EVENTRATE: number = 500; // 5m
    private static readonly PLAYER_SAVERATE: number = 500; // 5m
    private static readonly PLAYER_COORDLOGRATE: number = 50; // 30s

    private static readonly TIMEOUT_NO_CONNECTION: number = Environment.NODE_DEBUG_SOCKET ? 60000 : 50; // 30s with no connection (16 ticks in osrs)
    private static readonly TIMEOUT_NO_RESPONSE: number = Environment.NODE_DEBUG_SOCKET ? 60000 : 100; // 60s without any response

    // the game/zones map
    readonly gameMap: GameMap;

    // shared inventories (shops)
    readonly invs: Set<Inventory>;

    // entities
    readonly loginRequests: Map<string, ClientSocket> = new Map(); // waiting for response from login server
    readonly logoutRequests: Map<string, LogoutRequest> = new Map(); // waiting for confirmation from login server
    readonly newPlayers: Set<Player>; // players joining at the end of this tick
    readonly players: PlayerList;
    readonly npcs: NpcList;
    readonly playerGrid: Map<number, Player[]>; // store player coords for player_info for fast lookup

    // zones
    readonly zonesTracking: Map<number, Set<Zone>>;
    readonly queue: LinkList<EntityQueueState>;

    readonly playerRenderer: PlayerRenderer;
    readonly npcRenderer: NpcRenderer;

    // debug data
    readonly lastCycleStats: number[];
    readonly cycleStats: number[];

    tickRate: number = World.TICKRATE; // speeds up when we're processing server shutdown
    currentTick: number = 0; // the current tick of the game world.
    nextTick: number = 0; // the next time the game world should tick.
    shutdownTick: number = -1;
    pmCount: number = 1; // can't be 0 as clients will ignore the pm, their array is filled with 0 as default

    vars: Int32Array = new Int32Array(); // var shared
    varsString: string[] = [];

    sessionLogs: SessionLog[] = [];

    constructor() {
        this.gameMap = new GameMap(Environment.NODE_MEMBERS);
        this.invs = new Set();
        this.newPlayers = new Set();
        this.players = new PlayerList(World.PLAYERS);
        this.npcs = new NpcList(World.NPCS);
        this.playerGrid = new Map();
        this.zonesTracking = new Map();
        this.queue = new LinkList();
        this.playerRenderer = new PlayerRenderer();
        this.npcRenderer = new NpcRenderer();
        this.lastCycleStats = new Array(12).fill(0);
        this.cycleStats = new Array(12).fill(0);

        if (Environment.STANDALONE_BUNDLE) {
            if (this.loginThread instanceof Worker) {
                this.loginThread.onmessage = msg => {
                    try {
                        this.onLoginMessage(msg.data);
                    } catch (err) {
                        console.error(err);
                    }
                };
            }

            if (this.friendThread instanceof Worker) {
                this.friendThread.onmessage = msg => {
                    try {
                        this.onFriendMessage(msg.data);
                    } catch (err) {
                        console.error(err);
                    }
                };
            }
        } else {
            if (this.loginThread instanceof NodeWorker) {
                this.loginThread.on('message', msg => {
                    try {
                        this.onLoginMessage(msg);
                    } catch (err) {
                        console.error(err);
                    }
                });
            }

            if (this.friendThread instanceof NodeWorker) {
                this.friendThread.on('message', msg => {
                    try {
                        this.onFriendMessage(msg);
                    } catch (err) {
                        console.error(err);
                    }
                });
            }
        }
    }

    get shutdown() {
        return this.shutdownTick != -1 && this.currentTick >= this.shutdownTick;
    }

    // shutting down within the next 30s
    get shutdownSoon() {
        return this.shutdownTick != -1 && this.currentTick >= this.shutdownTick - 50;
    }

    reload(): void {
        VarPlayerType.load('data/pack');
        ParamType.load('data/pack');
        ObjType.load('data/pack');
        LocType.load('data/pack');
        NpcType.load('data/pack');
        IdkType.load('data/pack');
        SeqFrame.load('data/pack');
        SeqType.load('data/pack');
        SpotanimType.load('data/pack');
        CategoryType.load('data/pack');
        EnumType.load('data/pack');
        StructType.load('data/pack');
        InvType.load('data/pack');

        this.invs.clear();
        for (let i = 0; i < InvType.count; i++) {
            const inv = InvType.get(i);

            if (inv && inv.scope === InvType.SCOPE_SHARED) {
                this.invs.add(Inventory.fromType(i));
            }
        }

        MesanimType.load('data/pack');
        DbTableType.load('data/pack');
        DbRowType.load('data/pack');
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
        if (count === -1) {
            this.broadcastMes('There was an issue while reloading scripts.');
        } else {
            this.broadcastMes(`Reloaded ${count} scripts.`);
        }

        // todo: check if any jag files changed (transmitted) then reload crcs, instead of always
        makeCrcs();

        // todo: detect and reload static data (like maps)
        preloadClient();
    }

    async loadAsync(): Promise<void> {
        const count = (
            await Promise.all([
                NpcType.loadAsync('data/pack'),
                ObjType.loadAsync('data/pack'),
                LocType.loadAsync('data/pack'),
                FontType.loadAsync('data/pack'),
                WordEnc.loadAsync('data/pack'),
                VarPlayerType.loadAsync('data/pack'),
                ParamType.loadAsync('data/pack'),
                IdkType.loadAsync('data/pack'),
                SeqFrame.loadAsync('data/pack'),
                SeqType.loadAsync('data/pack'),
                SpotanimType.loadAsync('data/pack'),
                CategoryType.loadAsync('data/pack'),
                EnumType.loadAsync('data/pack'),
                StructType.loadAsync('data/pack'),
                InvType.loadAsync('data/pack'),
                MesanimType.loadAsync('data/pack'),
                DbTableType.loadAsync('data/pack'),
                DbRowType.loadAsync('data/pack'),
                HuntType.loadAsync('data/pack'),
                VarNpcType.loadAsync('data/pack'),
                VarSharedType.loadAsync('data/pack'),
                Component.loadAsync('data/pack'),
                makeCrcsAsync(),
                preloadClientAsync(),
                ScriptProvider.loadAsync('data/pack')
            ])
        ).at(-1);

        this.invs.clear();
        for (let i = 0; i < InvType.count; i++) {
            const inv = InvType.get(i);

            if (inv && inv.scope === InvType.SCOPE_SHARED) {
                this.invs.add(Inventory.fromType(i));
            }
        }

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

        if (count === -1) {
            this.broadcastMes('There was an issue while reloading scripts.');
        } else {
            this.broadcastMes(`Reloaded ${count} scripts.`);
        }
    }

    async start(skipMaps = false, startCycle = true): Promise<void> {
        printInfo('Starting world');

        if (Environment.STANDALONE_BUNDLE) {
            await this.loadAsync();

            if (!skipMaps) {
                await this.gameMap.initAsync();
            }
        } else {
            FontType.load('data/pack');
            WordEnc.load('data/pack');

            this.reload();

            if (!skipMaps) {
                this.gameMap.init();
            }
        }

        this.loginThread.postMessage({
            type: 'world_startup'
        });

        this.friendThread.postMessage({
            type: 'connect'
        });

        if (!Environment.STANDALONE_BUNDLE) {
            if (!Environment.NODE_PRODUCTION) {
                this.createDevThread();

                if (Environment.BUILD_STARTUP) {
                    this.rebuild();
                }
            }

            if (Environment.WEB_PORT === 80) {
                printInfo(kleur.green().bold('World ready') + kleur.white().bold(': Visit http://localhost/rs2.cgi'));
            } else {
                printInfo(kleur.green().bold('World ready') + kleur.white().bold(': Visit http://localhost:' + Environment.WEB_PORT + '/rs2.cgi'));
            }
        }

        if (startCycle) {
            this.nextTick = Date.now() + World.TICKRATE;
            this.cycle();
        }
    }

    // ----

    cycle(): void {
        try {
            const start: number = Date.now();
            const drift = Math.max(0, start - this.nextTick);

            // world processing
            // - world queue
            // - npc spawn scripts
            // - npc hunt
            this.processWorld();

            // client input
            // - calculate afk event readiness
            // - process packets
            // - process pathfinding/following request
            // - client input tracking
            this.processClientsIn();

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
                for (const player of this.players) {
                    player.addSessionLog(LoggerEventType.MODERATOR, 'Server check in');
                }
            }

            // todo: move this into PLAYER_COORDLOGRATE if memory usage is sane?
            if (this.sessionLogs.length > 0) {
                this.loggerThread.postMessage({
                    type: 'session_log',
                    logs: this.sessionLogs
                });

                this.sessionLogs = [];
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
            if (Environment.NODE_PRODUCTION) {
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

            if (Environment.NODE_DEBUG_PROFILE) {
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
            }

            printError('Removing all players...');

            for (const player of this.players) {
                this.removePlayer(player);
            }

            // TODO inform Friends server that the world has gone offline

            printError('All players removed.');
            printError('Closing the server.');
            process.exit(1);
        }
    }

    // - world queue
    // - npc spawn scripts
    // - npc hunt
    private processWorld(): void {
        const start: number = Date.now();

        const tick: number = this.currentTick;

        // - world queue
        for (let request: EntityQueueState | null = this.queue.head(); request; request = this.queue.next()) {
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

        // - npc ai_spawn scripts
        // - npc hunt players if not busy
        for (const npc of this.npcs) {
            if (!npc.checkLifeCycle(tick)) {
                continue;
            }
            // check if spawned last tick
            if (npc.lastLifecycleTick === tick - 1 && npc.lifecycle !== EntityLifeCycle.FOREVER) {
                const type = NpcType.get(npc.type);
                const script = ScriptProvider.getByTrigger(ServerTriggerType.AI_SPAWN, type.id, type.category);
                if (script) {
                    npc.executeScript(ScriptRunner.init(script, npc));
                }
            }
            if (npc.delayed) {
                continue;
            }
            if (npc.huntMode !== -1) {
                const hunt = HuntType.get(npc.huntMode);
                if (hunt && hunt.type === HuntModeType.PLAYER) {
                    npc.huntAll();
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

        for (const player of this.players) {
            try {
                player.playtime++;

                if (this.currentTick % World.AFK_EVENTRATE === 0) {
                    // (normal) 1/12 chance every 5 minutes of setting an afk event state (even distrubution 60/5)
                    // (afk) double the chance?
                    player.afkEventReady = Math.random() < (player.zonesAfk() ? 0.1666 : 0.0833);
                }

                if (isClientConnected(player) && player.decodeIn()) {
                    const followingPlayer = player.targetOp === ServerTriggerType.APPLAYER3 || player.targetOp === ServerTriggerType.OPPLAYER3;
                    if (player.userPath.length > 0 || player.opcalled) {
                        if (player.delayed) {
                            player.unsetMapFlag();
                            continue;
                        }

                        if ((!player.target || player.target instanceof Loc || player.target instanceof Obj) && player.faceEntity !== -1) {
                            player.faceEntity = -1;
                            player.masks |= InfoProt.PLAYER_FACE_ENTITY.id;
                        }

                        if ((!player.busy() && player.opcalled) || player.opucalled) {
                            // opu in osrs doesnt have a busy check
                            player.moveClickRequest = false;
                        } else {
                            player.moveClickRequest = true;
                        }

                        if (!followingPlayer && player.opcalled && (player.userPath.length === 0 || !Environment.NODE_CLIENT_ROUTEFINDER)) {
                            player.pathToTarget();
                            continue;
                        }

                        if (Environment.NODE_WALKTRIGGER_SETTING !== WalkTriggerSetting.PLAYERPACKET) {
                            player.pathToMoveClick(player.userPath, !Environment.NODE_CLIENT_ROUTEFINDER);

                            if (Environment.NODE_WALKTRIGGER_SETTING === WalkTriggerSetting.PLAYERSETUP && !player.opcalled && player.hasWaypoints()) {
                                player.processWalktrigger();
                            }
                        }
                    }
                }

                // - client input tracking
                player.processInputTracking();

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
                // timers continue to tick when npc is despawned
                if (npc.timerInterval !== 0) {
                    npc.timerClock++;
                }
                if (npc.checkLifeCycle(this.currentTick)) {
                    if (npc.delayed && this.currentTick >= npc.delayedUntil) npc.delayed = false;

                    // - resume suspended script
                    if (!npc.delayed && npc.activeScript && npc.activeScript.execution === ScriptState.NPC_SUSPENDED) {
                        npc.executeScript(npc.activeScript);
                    }
                }

                // - respawn
                if (npc.updateLifeCycle(this.currentTick)) {
                    try {
                        if (npc.lifecycle === EntityLifeCycle.RESPAWN) {
                            this.addNpc(npc, -1, false);
                        } else if (npc.lifecycle === EntityLifeCycle.DESPAWN) {
                            this.removeNpc(npc, -1);
                        }
                    } catch (err) {
                        // there was an error adding or removing them, try again next tick...
                        // ex: server is full on npc IDs (did we have a leak somewhere?) and we don't want to re-use the last ID (syncing related)
                        if (npc.lifecycle === EntityLifeCycle.RESPAWN) {
                            printError('[World] An unhandled error occurred while respawning a NPC');
                        } else if (npc.lifecycle === EntityLifeCycle.DESPAWN) {
                            printError('[World] An unhandled error occurred while despawning a NPC');
                        }

                        printError(`[World] NPC type:${npc.type} lifecycle:${npc.lifecycle} ID:${npc.nid}`);
                        console.error(err);

                        npc.setLifeCycle(this.currentTick + 1); // retry next tick
                    }
                }

                if (npc.delayed) {
                    continue;
                }

                if (!npc.checkLifeCycle(this.currentTick)) {
                    // if the npc just despawned then don't do anything else.
                    continue;
                }

                // - hunt npc/obj/loc
                if (npc.huntMode !== -1) {
                    const hunt = HuntType.get(npc.huntMode);
                    if (hunt && hunt.type !== HuntModeType.PLAYER) {
                        npc.huntAll();
                    }
                }
                // - stat regen
                npc.processRegen();
                // - timer
                npc.processTimers();
                // - queue
                npc.processQueue();
                // - movement
                // - modes
                npc.processNpcModes();

                npc.validateDistanceWalked();
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

        for (const player of this.players) {
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
                // - interactions
                // - movement
                player.processInteraction();

                // - run energy
                player.updateEnergy();

                if ((player.masks & InfoProt.PLAYER_EXACT_MOVE.id) == 0) {
                    player.validateDistanceWalked();
                }
            } catch (err) {
                console.error(err);
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

        for (const player of this.players) {
            let force = false;
            if (this.shutdown || this.currentTick - player.lastResponse >= World.TIMEOUT_NO_RESPONSE) {
                // world shutdown or x-logged / timed out for 60s: force logout
                player.loggingOut = true;
                force = true;
            } else if (this.currentTick - player.lastConnected >= World.TIMEOUT_NO_CONNECTION) {
                // connection lost for 30s: request idle logout
                player.requestIdleLogout = true;
            }

            if (player.requestLogout || player.requestIdleLogout) {
                if (this.currentTick >= player.preventLogoutUntil) {
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
                for (let request = player.queue.head(); request !== null; request = player.queue.next()) {
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
                for (const other of this.players) {
                    if (player.username !== other.username) {
                        continue;
                    }

                    if (isClientConnected(other)) {
                        player.addSessionLog(LoggerEventType.MODERATOR, 'Logged to world ' + Environment.NODE_ID + ' replacing session', other.client.uuid);
                        other.client.close();
                    }

                    if (other instanceof NetworkPlayer && player instanceof NetworkPlayer) {
                        other.client = player.client;
                        other.client.send(Uint8Array.from([15]));
                    }

                    other.onReconnect();

                    continue player;
                }
            }

            // player already logged in
            for (const other of this.players) {
                if (player.username !== other.username) {
                    continue;
                }

                if (player instanceof NetworkPlayer) {
                    player.addSessionLog(LoggerEventType.ENGINE, 'Tried to log in - already logged in');
                    player.client.send(Uint8Array.from([5]));
                    player.client.close();
                }

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

            // normal login process
            let pid: number;
            try {
                // if it throws then there was no available pid. otherwise guaranteed to not be -1.
                pid = this.getNextPid(isClientConnected(player) ? player.client : null);
            } catch (e) {
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

                if (player.staffModLevel >= 1) {
                    player.client.send(Uint8Array.from([18]));
                } else {
                    player.client.send(Uint8Array.from([2]));
                }
            }

            // insert player into first available slot
            this.players.set(pid, player);
            player.pid = pid;
            player.uid = ((Number(player.username37 & 0x1fffffn) << 11) | player.pid) >>> 0;
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
        const tick: number = this.currentTick;
        // - loc/obj despawn/respawn
        // - compute shared buffer
        this.zonesTracking.get(tick)?.forEach(zone => zone.tick(tick));
        this.cycleStats[WorldStat.ZONE] = Date.now() - start;
    }

    // - convert player movements
    // - compute player info
    // - convert npc movements
    // - compute npc info
    private processInfo(): void {
        // TODO: benchmark this?
        for (const player of this.players) {
            player.convertMovementDir();
            player.reorient();

            const grid = this.playerGrid;
            const coord = CoordGrid.packCoord(player.level, player.x, player.z);
            const players = grid.get(coord) ?? [];
            players.push(player);
            if (!grid.has(coord)) {
                grid.set(coord, players);
            }

            this.playerRenderer.computeInfo(player);
        }

        for (const npc of this.npcs) {
            npc.convertMovementDir();
            npc.reorient();
            this.npcRenderer.computeInfo(npc);
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

        for (const player of this.players) {
            if (!isClientConnected(player)) {
                continue;
            }

            try {
                // - map update
                player.updateMap();
                // - player info
                player.updatePlayers(this.playerRenderer);
                // - npc info
                player.updateNpcs(this.npcRenderer);
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
        this.zonesTracking.get(tick)?.forEach(zone => zone.reset());
        this.zonesTracking.delete(tick);

        // - reset players
        this.playerRenderer.removeTemporary();
        for (const player of this.players) {
            player.resetEntity(false);

            // - reset invs (players)
            for (const inv of player.invs.values()) {
                if (!inv) {
                    continue;
                }

                inv.update = false;
            }
        }

        // - reset npcs
        this.npcRenderer.removeTemporary();
        for (const npc of this.npcs) {
            if (!npc.checkLifeCycle(tick)) {
                continue;
            }

            npc.resetEntity(false);
        }

        // - reset invs (world)
        for (const inv of this.invs) {
            inv.update = false;

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
                    inv.add(item?.id, 1, index, true, false, false);
                    inv.update = true;
                    continue;
                }
                // Item stock is over min
                if (item.count > invType.stockcount[index] && tick % invType.stockrate[index] === 0) {
                    inv.remove(item?.id, 1, index, true);
                    inv.update = true;
                    continue;
                }

                // Item stock is not listed, such as general stores
                // Tested on low and high player count worlds, ever 1 minute stock decreases.
                if (invType.allstock && !invType.stockcount[index] && tick % World.INV_STOCKRATE === 0) {
                    inv.remove(item?.id, 1, index, true);
                    inv.update = true;
                }
            }
        }

        this.playerGrid.clear();

        this.cycleStats[WorldStat.CLEANUP] = Date.now() - start;
    }

    private processShutdown(): void {
        for (const player of this.players) {
            if (isClientConnected(player)) {
                player.logout();
                player.client.close();
            }
        }

        const duration = this.currentTick - this.shutdownTick;
        if (duration >= 1024) {
            // force remove all players, they had their chances to finish processing
            for (const player of this.players) {
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
        // would cause excessive save dialogs on webworker
        if (typeof self !== 'undefined') {
            return;
        }

        const names = [];

        for (const player of this.players) {
            names.push(player.username);

            this.loginThread.postMessage({
                type: 'player_autosave',
                username: player.username,
                save: player.save()
            });
        }

        this.loginThread.postMessage({
            type: 'world_heartbeat',
            names
        });
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
            this.npcs.set(npc.nid, npc);
        }

        npc.x = npc.startX;
        npc.z = npc.startZ;

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

        npc.setLifeCycle(this.currentTick + duration);
    }

    removeNpc(npc: Npc, duration: number): void {
        const zone = this.gameMap.getZone(npc.x, npc.z, npc.level);
        const adjustedDuration = this.scaleByPlayerCount(duration);
        zone.leave(npc);

        switch (npc.blockWalk) {
            case BlockWalk.NPC:
                changeNpcCollision(npc.width, npc.x, npc.z, npc.level, false);
                break;
            case BlockWalk.ALL:
                changeNpcCollision(npc.width, npc.x, npc.z, npc.level, false);
                changePlayerCollision(npc.width, npc.x, npc.z, npc.level, false);
                break;
        }

        this.npcRenderer.removePermanent(npc.nid);

        if (npc.lifecycle === EntityLifeCycle.DESPAWN) {
            this.npcs.remove(npc.nid);
            npc.cleanup();
        } else if (npc.lifecycle === EntityLifeCycle.RESPAWN) {
            npc.setLifeCycle(this.currentTick + adjustedDuration);
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

    trackZone(tick: number, zone: Zone): void {
        const tracking: Map<number, Set<Zone>> = this.zonesTracking;
        const zones: Set<Zone> = (tracking.get(tick) ?? new Set()).add(zone);
        if (!tracking.has(tick)) {
            tracking.set(tick, zones);
        }
    }

    addLoc(loc: Loc, duration: number): void {
        // printDebug(`[World] addLoc => name: ${LocType.get(loc.type).name}, duration: ${duration}`);
        const type: LocType = LocType.get(loc.type);
        if (type.blockwalk) {
            changeLocCollision(loc.shape, loc.angle, type.blockrange, type.length, type.width, type.active, loc.x, loc.z, loc.level, true);
        }

        const zone: Zone = this.gameMap.getZone(loc.x, loc.z, loc.level);
        zone.addLoc(loc);
        loc.setLifeCycle(this.currentTick + duration);
        this.trackZone(this.currentTick + duration, zone);
        this.trackZone(this.currentTick, zone);
    }

    mergeLoc(loc: Loc, player: Player, startCycle: number, endCycle: number, south: number, east: number, north: number, west: number): void {
        // printDebug(`[World] mergeLoc => name: ${LocType.get(loc.type).name}`);
        const zone: Zone = this.gameMap.getZone(loc.x, loc.z, loc.level);
        zone.mergeLoc(loc, player, startCycle, endCycle, south, east, north, west);
        this.trackZone(this.currentTick, zone);
    }

    animLoc(loc: Loc, seq: number): void {
        // printDebug(`[World] animLoc => name: ${LocType.get(loc.type).name}, seq: ${seq}`);
        const zone: Zone = this.gameMap.getZone(loc.x, loc.z, loc.level);
        zone.animLoc(loc, seq);
        this.trackZone(this.currentTick, zone);
    }

    removeLoc(loc: Loc, duration: number): void {
        // printDebug(`[World] removeLoc => name: ${LocType.get(loc.type).name}, duration: ${duration}`);
        const type: LocType = LocType.get(loc.type);
        if (type.blockwalk) {
            changeLocCollision(loc.shape, loc.angle, type.blockrange, type.length, type.width, type.active, loc.x, loc.z, loc.level, false);
        }

        const zone: Zone = this.gameMap.getZone(loc.x, loc.z, loc.level);
        zone.removeLoc(loc);
        loc.setLifeCycle(this.currentTick + duration);
        this.trackZone(this.currentTick + duration, zone);
        this.trackZone(this.currentTick, zone);
    }

    addObj(obj: Obj, receiver64: bigint, duration: number): void {
        // printDebug(`[World] addObj => name: ${ObjType.get(obj.type).name}, receiverId: ${receiverId}, duration: ${duration}`);
        // check if we need to changeobj first.
        if (ObjType.get(obj.type).stackable && obj.lifecycle === EntityLifeCycle.DESPAWN) {
            const existing = this.getObjOfReceiver(obj.x, obj.z, obj.level, obj.type, receiver64);
            if (existing && existing.lifecycle === EntityLifeCycle.DESPAWN) {
                const nextCount = obj.count + existing.count;
                if (nextCount <= Inventory.STACK_LIMIT) {
                    // if an obj of the same type exists and is stackable and have the same receiver, then we merge them.
                    this.changeObj(existing, receiver64, nextCount);
                    return;
                }
            }
        }
        const zone: Zone = this.gameMap.getZone(obj.x, obj.z, obj.level);
        zone.addObj(obj, receiver64);
        if (receiver64 !== Obj.NO_RECEIVER) {
            // objs with a receiver always attempt to reveal 100 ticks after being dropped.
            // items that can't be revealed (untradable, members obj in f2p) will be skipped in revealObj
            const reveal: number = this.currentTick + Obj.REVEAL;
            obj.setLifeCycle(reveal);
            this.trackZone(reveal, zone);
            this.trackZone(this.currentTick, zone);
            obj.receiver64 = receiver64;
            obj.reveal = duration;
        } else {
            obj.setLifeCycle(this.currentTick + duration);
            this.trackZone(this.currentTick + duration, zone);
            this.trackZone(this.currentTick, zone);
        }
    }

    revealObj(obj: Obj): void {
        // printDebug(`[World] revealObj => name: ${ObjType.get(obj.type).name}`);
        const duration: number = obj.reveal;
        const change: number = obj.lastChange;
        const zone: Zone = this.gameMap.getZone(obj.x, obj.z, obj.level);
        zone.revealObj(obj, obj.receiver64);
        // objs next life cycle always starts from the last time they changed + the inputted duration.
        // accounting for reveal time here.
        const nextLifecycle: number = (change !== -1 ? Obj.REVEAL - (this.currentTick - change) : 0) + this.currentTick + duration;
        obj.setLifeCycle(nextLifecycle);
        this.trackZone(nextLifecycle, zone);
        this.trackZone(this.currentTick, zone);
    }

    changeObj(obj: Obj, receiver64: bigint, newCount: number): void {
        // printDebug(`[World] changeObj => name: ${ObjType.get(obj.type).name}, receiverId: ${receiverId}, newCount: ${newCount}`);
        const zone: Zone = this.gameMap.getZone(obj.x, obj.z, obj.level);
        zone.changeObj(obj, receiver64, obj.count, newCount);
        this.trackZone(this.currentTick, zone);
    }

    removeObj(obj: Obj, duration: number): void {
        // printDebug(`[World] removeObj => name: ${ObjType.get(obj.type).name}, duration: ${duration}`);
        const zone: Zone = this.gameMap.getZone(obj.x, obj.z, obj.level);
        const adjustedDuration = this.scaleByPlayerCount(duration);
        zone.removeObj(obj);
        obj.setLifeCycle(this.currentTick + adjustedDuration);
        this.trackZone(this.currentTick + adjustedDuration, zone);
        this.trackZone(this.currentTick, zone);
    }

    animMap(level: number, x: number, z: number, spotanim: number, height: number, delay: number): void {
        const zone: Zone = this.gameMap.getZone(x, z, level);
        zone.animMap(x, z, spotanim, height, delay);
        this.trackZone(this.currentTick, zone);
    }

    mapProjAnim(level: number, x: number, z: number, dstX: number, dstZ: number, target: number, spotanim: number, srcHeight: number, dstHeight: number, startDelay: number, endDelay: number, peak: number, arc: number): void {
        const zone: Zone = this.gameMap.getZone(x, z, level);
        zone.mapProjAnim(x, z, dstX, dstZ, target, spotanim, srcHeight, dstHeight, startDelay, endDelay, peak, arc);
        this.trackZone(this.currentTick, zone);
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

    addPlayer(player: Player): void {
        this.newPlayers.add(player);
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
            username: player.username,
            coord: player.coord,
            chat
        });
    }

    removePlayer(player: Player): void {
        if (player.pid === -1) {
            return;
        }

        if (isClientConnected(player)) {
            player.logout();
            player.client.close();
        }

        this.playerRenderer.removePermanent(player.pid);
        this.gameMap.getZone(player.x, player.z, player.level).leave(player);
        this.players.remove(player.pid);
        changeNpcCollision(player.width, player.x, player.z, player.level, false);
        player.cleanup();

        player.addSessionLog(LoggerEventType.MODERATOR, 'Logged out');
        this.flushPlayer(player);

        this.friendThread.postMessage({
            type: 'player_logout',
            username: player.username
        });
    }

    // let the login server know this player can log in elsewhere, do not update save file
    forceLogout(player: Player, response = -1) {
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
            pmId: (Environment.NODE_ID << 24) + ((Math.random() * 0xff) << 16) + this.pmCount++,
            target: targetUsername37,
            message: message,
            coord: player.coord
        });
    }

    getPlayer(pid: number): Player | undefined {
        return this.players.get(pid);
    }

    getPlayerByUid(uid: number): Player | null {
        const pid = uid & 0x7ff;
        const name37 = (uid >> 11) & 0x1fffff;

        const player = this.getPlayer(pid);
        if (!player) {
            return null;
        }

        if (Number(player.username37 & 0x1fffffn) !== name37) {
            return null;
        }

        return player;
    }

    getPlayerByUsername(username: string): Player | undefined {
        const username37: bigint = toBase37(username);
        for (const player of this.players) {
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
        for (const player of this.players) {
            if (player.hash64 === hash64) {
                return player;
            }
        }
        return undefined;
    }

    getTotalPlayers(): number {
        return this.players.count;
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

    getNextPid(client: ClientSocket | null = null): number {
        // valid pid range is 1-2046
        if (client) {
            const ip = client.remoteAddress;
            if (ip.indexOf('.') !== -1) {
                // IPv4 - first available index starting from (low ip octet % 20) * 100
                const octets = ip.split('.');
                const start = (parseInt(octets[3]) % 20) * 100;
                return this.players.next(true, start);
            } else if (ip.indexOf(':') !== -1) {
                // IPv6 - first available index starting from (low site prefix % 20) * 100
                const start = (parseInt(ip.split(':')[2], 16) % 20) * 100;
                return this.players.next(true, start);
            }
        }
        return this.players.next();
    }

    scaleByPlayerCount(rate: number): number {
        // not sure if it caps at 2k player count or not
        const playerCount = Math.min(this.getTotalPlayers(), 2000);
        return (((4000 - playerCount) * rate) / 4000) | 0; // assuming scale works the same way as the runescript one
    }

    private createDevThread() {
        this.devThread = createWorker('./cache/DevThread.ts');

        if (this.devThread instanceof NodeWorker) {
            this.devThread.on('message', msg => {
                try {
                    if (msg.type === 'dev_reload') {
                        this.reload();
                    } else if (msg.type === 'dev_failure') {
                        if (msg.error) {
                            console.error(msg.error);

                            this.broadcastMes(msg.error.replaceAll('data/src/scripts/', ''));
                            this.broadcastMes('Check the console for more information.');
                        }
                    } else if (msg.type === 'dev_progress') {
                        if (msg.broadcast) {
                            console.log(msg.broadcast);

                            this.broadcastMes(msg.broadcast);
                        } else if (msg.text) {
                            console.log(msg.text);
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
    }

    rebootTimer(duration: number): void {
        this.shutdownTick = this.currentTick + duration;

        for (const player of this.players) {
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
        for (const player of this.players) {
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

    onLoginMessage(msg: any) {
        const { type } = msg;

        if (type === 'player_login') {
            const { socket } = msg;
            if (!this.loginRequests.has(socket)) {
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
            }

            const { account_id, username, lowMemory, reconnecting, staffmodlevel, muted_until } = msg;
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

                player.account_id = account_id;
                player.reconnecting = reconnecting;
                player.staffModLevel = staffmodlevel;
                player.lowMemory = lowMemory;
                player.muted_until = muted_until ? new Date(muted_until) : null;

                if (this.logoutRequests.has(username)) {
                    // already logged in (on another world)
                    client.send(Uint8Array.from([5]));
                    client.close();
                    return;
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
        } else if (type === 'player_logout') {
            const { username, success } = msg;
            if (!this.logoutRequests.has(username)) {
                return;
            }

            if (success) {
                this.logoutRequests.delete(username);
            }
        }
    }

    onFriendMessage({ opcode, data }: { opcode: FriendsServerOpcodes; data: any }) {
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
            } else if (opcode === FriendsServerOpcodes.UPDATE_IGNORELIST) {
                const username37 = BigInt(data.username37);

                // TODO make getPlayerByUsername37?
                const player = this.getPlayerByUsername(fromBase37(username37));
                if (!player) {
                    printError(`FriendThread: player ${fromBase37(username37)} not found`);
                    return;
                }

                const ignored: bigint[] = data.ignored.map((i: string) => BigInt(i));

                if (ignored.length > 0) {
                    player.write(new UpdateIgnoreList(ignored));
                }
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
            client.waiting = client.opcode === 16 || client.opcode === 18 ? -1 : 0;
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

        if (client.opcode === 16 || client.opcode === 18) {
            const rev = World.loginBuf.g1();
            if (rev !== 225) {
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
                seed[i] = World.loginBuf.g4();
            }
            client.decryptor = new Isaac(seed);

            for (let i = 0; i < 4; i++) {
                seed[i] += 50;
            }
            client.encryptor = new Isaac(seed);

            const uid = World.loginBuf.g4();
            const username = World.loginBuf.gjstr();
            const password = World.loginBuf.gjstr();

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

            if (this.getTotalPlayers() > 750) {
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
        } else {
            client.terminate();
        }

        client.opcode = -1;
    }

    addSessionLog(event_type: LoggerEventType, account_id: number, session_uuid: string, coord: number, message: string, ...args: string[]) {
        this.sessionLogs.push({
            account_id,
            session_uuid,
            timestamp: Date.now(),
            coord,
            event: args.length ? message + ' ' + args.join(' ') : message,
            event_type
        });
    }

    notifyPlayerBan(staff: string, username: string, until: number) {
        const other = this.getPlayerByUsername(username);
        if (other) {
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

    notifyPlayerReport(player: Player, offender: string, reason: number) {
        this.loggerThread.postMessage({
            type: 'report',
            username: player.username,
            coord: player.coord,
            offender,
            reason
        });
    }

    submitInputTracking(username: string, session_uuid: string, events: InputTrackingEvent[]) {
        this.loggerThread.postMessage({
            type: 'input_track',
            username,
            session_uuid,
            timestamp: Date.now(),
            events
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
