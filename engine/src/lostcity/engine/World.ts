import {Worker} from 'worker_threads';
import fs from 'fs';
import Watcher from 'watcher';
import path from 'path';
import kleur from 'kleur';

import Packet from '#jagex2/io/Packet.js';

import {toBase37} from '#jagex2/jstring/JString.js';

import CategoryType from '#lostcity/cache/config/CategoryType.js';
import DbRowType from '#lostcity/cache/config/DbRowType.js';
import DbTableType from '#lostcity/cache/config/DbTableType.js';
import EnumType from '#lostcity/cache/config/EnumType.js';
import FontType from '#lostcity/cache/config/FontType.js';
import HuntType from '#lostcity/cache/config/HuntType.js';
import IdkType from '#lostcity/cache/config/IdkType.js';
import Component from '#lostcity/cache/config/Component.js';
import InvType from '#lostcity/cache/config/InvType.js';
import LocType from '#lostcity/cache/config/LocType.js';
import MesanimType from '#lostcity/cache/config/MesanimType.js';
import NpcType from '#lostcity/cache/config/NpcType.js';
import ObjType from '#lostcity/cache/config/ObjType.js';
import ParamType from '#lostcity/cache/config/ParamType.js';
import SeqFrame from '#lostcity/cache/config/SeqFrame.js';
import SeqType from '#lostcity/cache/config/SeqType.js';
import StructType from '#lostcity/cache/config/StructType.js';
import VarNpcType from '#lostcity/cache/config/VarNpcType.js';
import VarPlayerType from '#lostcity/cache/config/VarPlayerType.js';
import VarSharedType from '#lostcity/cache/config/VarSharedType.js';
import WordEnc from '#lostcity/cache/wordenc/WordEnc.js';
import SpotanimType from '#lostcity/cache/config/SpotanimType.js';

import GameMap from '#lostcity/engine/GameMap.js';
import {Inventory} from '#lostcity/engine/Inventory.js';
import Login from '#lostcity/engine/Login.js';

import ScriptPointer from '#lostcity/engine/script/ScriptPointer.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import ScriptRunner from '#lostcity/engine/script/ScriptRunner.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';

import BlockWalk from '#lostcity/entity/BlockWalk.js';
import Loc from '#lostcity/entity/Loc.js';
import Npc from '#lostcity/entity/Npc.js';
import Obj from '#lostcity/entity/Obj.js';
import Player from '#lostcity/entity/Player.js';
import EntityLifeCycle from '#lostcity/entity/EntityLifeCycle.js';
import {NpcList, PlayerList} from '#lostcity/entity/EntityList.js';
import {isNetworkPlayer} from '#lostcity/entity/NetworkPlayer.js';
import {EntityQueueState} from '#lostcity/entity/EntityQueueRequest.js';
import {PlayerTimerType} from '#lostcity/entity/EntityTimer.js';

import ClientSocket from '#lostcity/server/ClientSocket.js';

import Environment from '#lostcity/util/Environment.js';
import {getLatestModified, getModified, shouldBuildFileAny} from '#lostcity/util/PackFile.js';
import Zone from './zone/Zone.js';
import LinkList from '#jagex2/datastruct/LinkList.js';
import {createWorker} from '#lostcity/util/WorkerFactory.js';
import {LoginResponse} from '#lostcity/server/LoginServer.js';
import ClientProt from '#lostcity/network/225/incoming/prot/ClientProt.js';
import {makeCrcs, makeCrcsAsync} from '#lostcity/server/CrcTable.js';
import {preloadClient, preloadClientAsync} from '#lostcity/server/PreloadedPacks.js';
import {Position} from '#lostcity/entity/Position.js';
import UpdateRebootTimer from '#lostcity/network/outgoing/model/UpdateRebootTimer.js';
import ZoneGrid from '#lostcity/engine/zone/ZoneGrid.js';
import ZoneMap from '#lostcity/engine/zone/ZoneMap.js';
import WorldStat from '#lostcity/engine/WorldStat.js';

class World {
    private static readonly PLAYERS: number = 2048;
    private static readonly NPCS: number = 8192;

    private static readonly NORMAL_TICKRATE: number = 600;
    private static readonly SHUTDOWN_TICKRATE: number = 1;

    private static readonly LOGIN_PINGRATE: number = 100;
    private static readonly INV_STOCKRATE: number = 100;
    private static readonly AFK_EVENTRATE: number = 500;
    private static readonly PLAYER_SAVERATE: number = 1500;

    private static readonly SHUTDOWN_TICKS: number = 24000;
    private static readonly TIMEOUT_IDLE_TICKS: number = 75;
    private static readonly TIMEOUT_LOGOUT_TICKS: number = 100;

    readonly gameMap: GameMap;
    readonly zoneMap: ZoneMap;
    readonly invs: Set<Inventory>; // shared inventories (shops)

    // entities
    readonly newPlayers: Set<Player>; // players joining at the end of this tick
    readonly players: PlayerList;
    readonly npcs: NpcList;

    // zones
    readonly zonesTracking: Map<number, Set<Zone>>;
    readonly queue: LinkList<EntityQueueState>;

    // debug data
    readonly lastCycleStats: number[];
    readonly cycleStats: number[];

    tickRate: number = World.NORMAL_TICKRATE; // speeds up when we're processing server shutdown
    currentTick: number = 0;
    shutdownTick: number = -1;

    // packed data timestamps
    allLastModified: number = 0;
    datLastModified: Map<string, number> = new Map();

    vars: Int32Array = new Int32Array(); // var shared
    varsString: string[] = [];

    devWatcher: Watcher | null = null;
    devThread: Worker | null = null;
    devRebuilding: boolean = false;
    devMTime: Map<string, number> = new Map();

    constructor() {
        this.gameMap = new GameMap();
        this.zoneMap = new ZoneMap();
        this.invs = new Set();
        this.newPlayers = new Set();
        this.players = new PlayerList(World.PLAYERS - 1);
        this.npcs = new NpcList(World.NPCS - 1);
        this.zonesTracking = new Map();
        this.queue = new LinkList();
        this.lastCycleStats = new Array(12).fill(0);
        this.cycleStats = new Array(12).fill(0);
    }

    // ----

    shouldReload(type: string, client: boolean = false): boolean {
        if (typeof self !== 'undefined') {
            return true;
        }

        const current = Math.max(getModified(`data/pack/server/${type}.dat`), client ? getModified('data/pack/client/config') : 0);

        if (!this.datLastModified.has(type)) {
            this.datLastModified.set(type, current);
            return true;
        }

        const changed = this.datLastModified.get(type) !== current;
        if (changed) {
            this.datLastModified.set(type, current);
        }
        return changed;
    }

    reload(): void {
        let transmitted = false;

        if (this.shouldReload('varp', true)) {
            VarPlayerType.load('data/pack');
            transmitted = true;
        }

        if (this.shouldReload('param')) {
            ParamType.load('data/pack');
        }

        if (this.shouldReload('obj', true)) {
            ObjType.load('data/pack');
            transmitted = true;
        }

        if (this.shouldReload('loc', true)) {
            LocType.load('data/pack');
            transmitted = true;
        }

        if (this.shouldReload('npc', true)) {
            NpcType.load('data/pack');
            transmitted = true;
        }

        if (this.shouldReload('idk', true)) {
            IdkType.load('data/pack');
            transmitted = true;
        }

        if (this.shouldReload('frame_del')) {
            SeqFrame.load('data/pack');
        }

        if (this.shouldReload('seq', true)) {
            SeqType.load('data/pack');
            transmitted = true;
        }

        if (this.shouldReload('spotanim', true)) {
            SpotanimType.load('data/pack');
            transmitted = true;
        }

        if (this.shouldReload('category')) {
            CategoryType.load('data/pack');
        }

        if (this.shouldReload('enum')) {
            EnumType.load('data/pack');
        }

        if (this.shouldReload('struct')) {
            StructType.load('data/pack');
        }

        if (this.shouldReload('inv')) {
            InvType.load('data/pack');

            this.invs.clear();
            for (let i = 0; i < InvType.count; i++) {
                const inv = InvType.get(i);
    
                if (inv && inv.scope === InvType.SCOPE_SHARED) {
                    this.invs.add(Inventory.fromType(i));
                }
            }
        }

        if (this.shouldReload('mesanim')) {
            MesanimType.load('data/pack');
        }

        if (this.shouldReload('dbtable')) {
            DbTableType.load('data/pack');
        }

        if (this.shouldReload('dbrow')) {
            DbRowType.load('data/pack');
        }

        if (this.shouldReload('hunt')) {
            HuntType.load('data/pack');
        }

        if (this.shouldReload('varn')) {
            VarNpcType.load('data/pack');
        }

        if (this.shouldReload('vars')) {
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
            }
        }

        if (this.shouldReload('interface')) {
            Component.load('data/pack');
            transmitted = true;
        }

        if (this.shouldReload('script')) {
            const count = ScriptProvider.load('data/pack');
            if (count === -1) {
                this.broadcastMes('There was an issue while reloading scripts.');
            } else {
                this.broadcastMes(`Reloaded ${count} scripts.`);
            }
        }

        // todo: check if any jag files changed (transmitted) then reload crcs
        // if (transmitted) {
        //     makeCrcs();
        // }

        makeCrcs();

        // todo: detect and reload static data (like maps)
        preloadClient();

        this.allLastModified = getLatestModified('data/pack', '.dat');
    }

    async loadAsync(): Promise<void> {
        console.time('Loading packs');
        const count = (await Promise.all([
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
            ScriptProvider.loadAsync('data/pack'),
        ])).at(-1);

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
        }

        if (count === -1) {
            this.broadcastMes('There was an issue while reloading scripts.');
        } else {
            this.broadcastMes(`Reloaded ${count} scripts.`);
        }
        console.timeEnd('Loading packs');
    }

    broadcastMes(message: string): void {
        for (const player of this.players) {
            player.messageGame(message);
        }
    }

    async start(skipMaps = false, startCycle = true): Promise<void> {
        console.log('Starting world...');

        if (typeof self === 'undefined') {
            FontType.load('data/pack');
            WordEnc.load('data/pack');

            this.reload();

            if (!skipMaps) {
                this.gameMap.init(this.zoneMap);
            }
        } else {
            console.time('World ready');
            await this.loadAsync();

            if (!skipMaps) {
                await this.gameMap.initAsync(this.zoneMap);
            }
            console.timeEnd('World ready');
        }

        Login.loginThread.postMessage({
            type: 'reset'
        });

        if (typeof self === 'undefined') {
            if (!Environment.NODE_PRODUCTION) {
                this.startDevWatcher();

                // console.time('checker');
                // todo: this check takes me 300ms on startup! but it saves double building fresh setups
                if (Environment.BUILD_STARTUP && (shouldBuildFileAny('data/pack/client', 'data/pack/client/lastbuild.pack') || shouldBuildFileAny('data/pack/server', 'data/pack/server/lastbuild.pack'))) {
                    this.devThread!.postMessage({
                        type: 'pack'
                    });
                }
                // console.timeEnd('checker');
            }

            if (Environment.WEB_PORT === 80) {
                console.log(kleur.green().bold('World ready') + kleur.white().bold(': http://localhost'));
            } else {
                console.log(kleur.green().bold('World ready') + kleur.white().bold(': http://localhost:' + Environment.WEB_PORT));
            }
        }

        if (startCycle) {
            await this.cycle();
        }
    }

    startDevWatcher(): void {
        this.devThread = createWorker('./src/lostcity/server/DevThread.ts') as Worker;

        this.devThread.on('message', msg => {
            if (msg.type === 'done') {
                this.devRebuilding = false;
                this.reload();
            }
        });

        this.devThread.on('exit', () => {
            this.devRebuilding = false;
            this.stopDevWatcher();

            if (this.shutdownTick === -1) {
                this.broadcastMes('Error while rebuilding - see console for more info.');
                this.startDevWatcher();
            }
        });

        this.devWatcher = new Watcher('./data/src', {
            recursive: true
        });

        this.devWatcher.on('add', (targetPath: string) => {
            if (targetPath.endsWith('.pack')) {
                return;
            }

            const stat = fs.statSync(targetPath);
            this.devMTime.set(targetPath, stat.mtimeMs);
        });

        this.devWatcher.on('change', (targetPath: string) => {
            if (targetPath.endsWith('.pack')) {
                return;
            }

            const stat = fs.statSync(targetPath);
            const known = this.devMTime.get(targetPath);

            if (known && known >= stat.mtimeMs) {
                return;
            }

            this.devMTime.set(targetPath, stat.mtimeMs);
            if (this.devRebuilding) {
                return;
            }

            console.log('dev:', path.basename(targetPath), 'was edited');
            this.devRebuilding = true;
            this.broadcastMes('Rebuilding, please wait...');

            if (!this.devThread) {
                this.devThread = createWorker('./src/lostcity/server/DevThread.ts') as Worker;
            }

            this.devThread.postMessage({
                type: 'pack'
            });
        });
    }

    stopDevWatcher(): void {
        if (this.devWatcher) {
            this.devWatcher.close();
        }

        if (this.devThread) {
            this.devThread.terminate();
            this.devThread = null;
        }
    }

    rebootTimer(duration: number): void {
        this.shutdownTick = this.currentTick + duration;
        this.stopDevWatcher();

        for (const player of this.players) {
            player.write(new UpdateRebootTimer(this.shutdownTick - this.currentTick));
        }
    }

    async cycle(continueCycle: boolean = true): Promise<void> {
        const start: number = Date.now();

        // world processing
        // - world queue
        // - calculate afk event readiness
        // - npc spawn scripts
        // - npc hunt
        this.processWorld();

        // client input
        // - decode packets
        // - process pathfinding/following
        await this.processClientsIn();

        // npc processing (if npc is not busy)
        // - resume suspended script
        // - stat regen
        // - timer
        // - queue
        // - movement
        // - modes
        this.processNpcs();

        // player processing
        // - resume suspended script
        // - primary queue
        // - weak queue
        // - timers
        // - soft timers
        // - engine queue
        // - interactions
        // - movement
        // - close interface if attempting to logout
        await this.processPlayers();

        // player logout
        await this.processLogouts();

        // player login, good spot for it (before packets so they immediately load but after processing so nothing hits them)
        await this.processLogins();

        // process zones
        // - build list of active zones around players
        // - loc/obj despawn/respawn
        // - compute shared buffer
        this.processZones();

        // process movement directions
        // - convert player movements
        // - convert npc movements
        this.processMovementDirections();

        // client output
        // - map update
        // - player info
        // - npc info
        // - zone updates
        // - inv changes
        // - stat changes
        // - afk zones changes
        // - flush packets
        await this.processClientsOut();

        // cleanup
        // - reset zones
        // - reset players
        // - reset npcs
        // - reset invs
        this.processCleanup();

        // ----

        const tick: number = this.currentTick;

        if (tick % World.LOGIN_PINGRATE === 0) {
            this.heartbeat();
        }

        // server shutdown
        if (this.shutdownTick > -1 && tick >= this.shutdownTick) {
            await this.processShutdown();
        }

        if (tick % World.PLAYER_SAVERATE === 0 && tick > 0) {
            // auto-save players every 15 mins
            this.savePlayers();
        }

        this.currentTick++;
        this.cycleStats[WorldStat.CYCLE] = Date.now() - start;

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

        if (continueCycle) {
            setTimeout(this.cycle.bind(this), this.tickRate - this.cycleStats[WorldStat.CYCLE]);
        }

        if (Environment.NODE_DEBUG_PROFILE) {
            console.log(`tick ${this.currentTick} took ${this.cycleStats[WorldStat.CYCLE]}ms: ${this.getTotalPlayers()} players`);
            console.log(`${this.cycleStats[WorldStat.WORLD]} ms world | ${this.cycleStats[WorldStat.CLIENT_IN]} ms client in | ${this.cycleStats[WorldStat.NPC]} ms npcs | ${this.cycleStats[WorldStat.PLAYER]} ms players | ${this.cycleStats[WorldStat.LOGOUT]} ms logout | ${this.cycleStats[WorldStat.LOGIN]} ms login | ${this.cycleStats[WorldStat.ZONE]} ms zones | ${this.cycleStats[WorldStat.CLIENT_OUT]} ms client out | ${this.cycleStats[WorldStat.CLEANUP]} ms cleanup`);
            console.log('----');
        }
    }

    // - world queue
    // - calculate afk event readiness
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

        // - calculate afk event readiness
        if (tick % World.AFK_EVENTRATE === 0) {
            for (const player of this.players) {
                // (normal) 1/12 chance every 5 minutes of setting an afk event state (even distrubution 60/5)
                // (afk) double the chance?
                player.afkEventReady = Math.random() < (player.zonesAfk() ? 0.1666 : 0.0833);
            }
        }

        // - npc spawn scripts
        for (const npc of this.npcs) {
            if (!npc.updateLifeCycle(tick)) {
                continue;
            }
            if (npc.lifecycle === EntityLifeCycle.RESPAWN) {
                this.addNpc(npc, -1);
            } else if (npc.lifecycle === EntityLifeCycle.DESPAWN) {
                this.removeNpc(npc, -1);
            }
        }

        // - npc hunt
        for (const npc of this.npcs) {
            if (!npc.checkLifeCycle(tick) || npc.delayed()) {
                continue;
            }

            if (npc.huntMode !== -1) {
                npc.huntAll();
            }
        }
        this.cycleStats[WorldStat.WORLD] = Date.now() - start;
    }

    // - decode packets
    // - process pathfinding/following
    private async processClientsIn(): Promise<void> {
        const start: number = Date.now();

        this.cycleStats[WorldStat.BANDWIDTH_IN] = 0; // reset bandwidth counter

        // - decode packets
        for (const player of this.players) {
            if (!isNetworkPlayer(player)) {
                continue;
            }

            try {
                player.decodeIn();
            } catch (err) {
                console.error(err);
                await this.removePlayer(player);
            }
        }

        // - process pathfinding/following
        for (const player of this.players) {
            if (!isNetworkPlayer(player)) {
                continue;
            }

            if (player.userPath.length > 0 || player.opcalled) {
                if (player.delayed()) {
                    player.unsetMapFlag();
                    continue;
                }

                if ((!player.target || player.target instanceof Loc || player.target instanceof Obj) && player.faceEntity !== -1) {
                    player.faceEntity = -1;
                    player.mask |= Player.FACE_ENTITY;
                }

                if (player.opcalled && (player.userPath.length === 0 || !Environment.NODE_CLIENT_ROUTEFINDER)) {
                    player.pathToTarget();
                    continue;
                }

                player.pathToMoveClick(player.userPath, !Environment.NODE_CLIENT_ROUTEFINDER);
            }

            if (player.target instanceof Player && (player.targetOp === ServerTriggerType.APPLAYER3 || player.targetOp === ServerTriggerType.OPPLAYER3)) {
                if (Position.distanceToSW(player, player.target) <= 25) {
                    player.pathToPathingTarget();
                } else {
                    player.clearWaypoints();
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
                if (!npc.checkLifeCycle(this.currentTick)) {
                    continue;
                }
    
                if (npc.delayed()) {
                    npc.delay--;
                }

                if (npc.delayed()) {
                    continue;
                }

                // - resume suspended script
                if (npc.activeScript && npc.activeScript.execution === ScriptState.NPC_SUSPENDED) {
                    npc.executeScript(npc.activeScript);
                }

                if (!npc.checkLifeCycle(this.currentTick)) {
                    // if the npc just despawned then don't do anything else.
                    continue;
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
    private async processPlayers(): Promise<void> {
        const start: number = Date.now();
        for (const player of this.players) {
            try {
                player.playtime++;

                if (player.delayed()) {
                    player.delay--;
                }

                // - resume suspended script
                if (player.activeScript && player.activeScript.execution === ScriptState.SUSPENDED && !player.delayed()) {
                    player.executeScript(player.activeScript, true, true);
                }

                // - primary queue
                // - weak queue
                player.processQueues();
                // - timers
                player.processTimers(PlayerTimerType.NORMAL);
                // - soft timers
                player.processTimers(PlayerTimerType.SOFT);
                // - engine queue
                player.processEngineQueue();
                // - interactions
                // - movement
                player.processInteraction();

                if ((player.mask & Player.EXACT_MOVE) == 0) {
                    player.validateDistanceWalked();
                }

                if (this.shutdownTick < this.currentTick) {
                    // request logout on socket idle after 45 seconds (this may be 16 *ticks* in osrs!)
                    // increased timeout for compatibility with old PCs that take ages to load
                    if (Environment.NODE_SOCKET_TIMEOUT && this.currentTick - player.lastResponse >= World.TIMEOUT_IDLE_TICKS) {
                        player.logoutRequested = true;
                    }
                }

                // - close interface if attempting to logout
                if (player.logoutRequested) {
                    player.closeModal();
                }
            } catch (err) {
                console.error(err);
                await this.removePlayer(player);
            }
        }
        this.cycleStats[WorldStat.PLAYER] = Date.now() - start;
    }

    private async processLogouts(): Promise<void> {
        const start: number = Date.now();
        for (const player of this.players) {
            if (Environment.NODE_SOCKET_TIMEOUT && this.currentTick - player.lastResponse >= World.TIMEOUT_LOGOUT_TICKS) {
                // remove after 60 seconds
                player.queue.clear();
                player.weakQueue.clear();
                player.engineQueue.clear();
                player.clearInteraction();
                player.closeModal();
                player.unsetMapFlag();
                player.logoutRequested = true;
                player.setVar(VarPlayerType.LASTCOMBAT, 0); // temp fix for logging out in combat, since logout trigger conditions still run...
            }

            if (!player.logoutRequested) {
                continue;
            }

            if (player.queue.head() === null) {
                const script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.LOGOUT, -1, -1);
                if (!script) {
                    console.error('LOGOUT TRIGGER IS BROKEN!');
                    continue;
                }

                const state = ScriptRunner.init(script, player);
                state.pointerAdd(ScriptPointer.ProtectedActivePlayer);
                ScriptRunner.execute(state);

                const result = state.popInt();
                if (result === 0) {
                    player.logoutRequested = false;
                }

                if (player.logoutRequested) {
                    await this.removePlayer(player);
                }
            } else {
                player.messageGame('[DEBUG]: Waiting for queue to empty before logging out.');
            }
        }
        this.cycleStats[WorldStat.LOGOUT] = Date.now() - start;
    }

    private async processLogins(): Promise<void> {
        const start: number = Date.now();
        player: for (const player of this.newPlayers) {
            for (const other of this.players) {
                if (player.username !== other.username) {
                    continue;
                }
                if (isNetworkPlayer(player) && player.client) {
                    player.client.send(LoginResponse.LOGGED_IN);
                    player.client.close();
                }
                continue player;
            }

            let pid: number;
            try {
                // if it throws then there was no available pid. otherwise guaranteed to not be -1.
                pid = this.getNextPid(isNetworkPlayer(player) ? player.client : null);
            } catch (e) {
                // world full
                if (isNetworkPlayer(player)) {
                    player.client?.send(LoginResponse.WORLD_FULL);
                    player.client?.close();
                }
                continue;
            }

            // insert player into first available slot
            this.players.set(pid, player);
            player.pid = pid;
            player.uid = ((Number(player.username37 & 0x1fffffn) << 11) | player.pid) >>> 0;
            player.tele = true;

            this.getZone(player.x, player.z, player.level).enter(player);
            player.onLogin(); // todo: check response from login script?

            if (this.shutdownTick > -1) {
                player.write(new UpdateRebootTimer(this.shutdownTick - this.currentTick));
            }

            if (isNetworkPlayer(player) && player.client) {
                player.client.state = 1;
                if (player.staffModLevel >= 2) {
                    player.client.send(LoginResponse.STAFF_MOD_LEVEL);
                } else {
                    player.client.send(LoginResponse.SUCCESSFUL);
                }
            }
        }
        this.newPlayers.clear();
        this.cycleStats[WorldStat.LOGIN] = Date.now() - start;
    }

    // - build list of active zones around players
    // - loc/obj despawn/respawn
    // - compute shared buffer
    private processZones(): void {
        const start: number = Date.now();
        const tick: number = this.currentTick;
        const zones: Set<Zone> | undefined = this.zonesTracking.get(tick);
        if (typeof zones !== 'undefined') {
            // - loc/obj despawn/respawn
            for (const zone of zones) {
                zone.tick(tick);
            }
        }
        // - build list of active zones around players
        // - compute shared buffer
        this.computeSharedEvents();
        this.cycleStats[WorldStat.ZONE] = Date.now() - start;
    }

    // - convert player movements
    // - convert npc movements
    private processMovementDirections(): void {
        // TODO: benchmark this?
        for (const player of this.players) {
            player.convertMovementDir();
        }

        for (const npc of this.npcs) {
            npc.convertMovementDir();
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
    private async processClientsOut(): Promise<void> {
        const start: number = Date.now();

        this.cycleStats[WorldStat.BANDWIDTH_OUT] = 0; // reset bandwidth counter

        for (const player of this.players) {
            if (!isNetworkPlayer(player)) {
                player.highPriorityOut.clear();
                player.lowPriorityOut.clear();
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
                await this.removePlayer(player);
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
        const zones: Set<Zone> | undefined = this.zonesTracking.get(tick);
        if (typeof zones !== 'undefined') {
            for (const zone of zones) {
                zone.reset();
            }
        }
        this.zonesTracking.delete(tick);

        // - reset players
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
        this.cycleStats[WorldStat.CLEANUP] = Date.now() - start;
    }

    private heartbeat(): void {
        const players: bigint[] = [];
        for (const player of this.players) {
            players.push(player.username37);
        }

        Login.loginThread.postMessage({
            type: 'heartbeat',
            players
        });
    }

    private async processShutdown(): Promise<void> {
        const duration: number = this.currentTick - this.shutdownTick; // how long have we been trying to shutdown
        const online: number = this.getTotalPlayers();

        if (online) {
            for (const player of this.players) {
                player.logoutRequested = true;

                if (isNetworkPlayer(player)) {
                    player.logout(); // visually log out

                    // if it's been more than a few ticks and the client just won't leave us alone, close the socket
                    if (player.client && duration > 2) {
                        player.client.close();
                    }
                }
            }

            this.npcs.reset();

            if (duration > 2) {
                console.log('Super fast shutdown initiated...');

                // we've already attempted to shutdown, now we speed things up
                if (this.tickRate > World.SHUTDOWN_TICKRATE) {
                    this.tickRate = World.SHUTDOWN_TICKRATE;
                }

                // if we've exceeded 24000 ticks then we *really* need to shut down now
                if (duration > World.SHUTDOWN_TICKS) {
                    for (const player of this.players) {
                        await this.removePlayer(player);
                    }

                    this.tickRate = World.NORMAL_TICKRATE;
                }

                if (!Environment.NODE_PRODUCTION) {
                    process.exit(0);
                }
            }
        } else {
            process.exit(0);
        }
    }

    private savePlayers(): void {
        // would cause excessive save dialogs on webworker
        if (typeof self !== 'undefined') {
            return;
        }

        for (const player of this.players) {
            player.save().release();
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

    getZone(x: number, z: number, level: number): Zone {
        return this.zoneMap.zone(x, z, level);
    }

    getZoneIndex(zoneIndex: number): Zone {
        return this.zoneMap.zoneByIndex(zoneIndex);
    }

    getZoneGrid(level: number): ZoneGrid {
        return this.zoneMap.grid(level);
    }

    computeSharedEvents(): void {
        const zones: Set<number> = new Set();
        for (const player of this.players) {
            if (!isNetworkPlayer(player)) {
                continue;
            }
            for (const zone of player.buildArea.loadedZones) {
                zones.add(zone);
            }
        }
        for (const zoneIndex of zones) {
            this.getZoneIndex(zoneIndex).computeShared();
        }
    }

    addNpc(npc: Npc, duration: number): void {
        this.npcs.set(npc.nid, npc);
        npc.x = npc.startX;
        npc.z = npc.startZ;

        const zone = this.getZone(npc.x, npc.z, npc.level);
        zone.enter(npc);

        switch (npc.blockWalk) {
            case BlockWalk.NPC:
                this.gameMap.changeNpcCollision(npc.width, npc.x, npc.z, npc.level, true);
                break;
            case BlockWalk.ALL:
                this.gameMap.changeNpcCollision(npc.width, npc.x, npc.z, npc.level, true);
                this.gameMap.changePlayerCollision(npc.width, npc.x, npc.z, npc.level, true);
                break;
        }

        npc.resetEntity(true);
        npc.playAnimation(-1, 0);

        npc.setLifeCycle(this.currentTick + duration);
    }

    removeNpc(npc: Npc, duration: number): void {
        const zone = this.getZone(npc.x, npc.z, npc.level);
        zone.leave(npc);

        switch (npc.blockWalk) {
            case BlockWalk.NPC:
                this.gameMap.changeNpcCollision(npc.width, npc.x, npc.z, npc.level, false);
                break;
            case BlockWalk.ALL:
                this.gameMap.changeNpcCollision(npc.width, npc.x, npc.z, npc.level, false);
                this.gameMap.changePlayerCollision(npc.width, npc.x, npc.z, npc.level, false);
                break;
        }

        if (npc.lifecycle === EntityLifeCycle.DESPAWN) {
            this.npcs.remove(npc.nid);
        } else if (npc.lifecycle === EntityLifeCycle.RESPAWN) {
            npc.setLifeCycle(this.currentTick + duration);
        }
    }

    getLoc(x: number, z: number, level: number, locId: number): Loc | null {
        return this.getZone(x, z, level).getLoc(x, z, locId);
    }

    getObj(x: number, z: number, level: number, objId: number, receiverId: number): Obj | null {
        return this.getZone(x, z, level).getObj(x, z, objId, receiverId);
    }

    trackZone(tick: number, zone: Zone): void {
        let zones: Set<Zone>;
        const active: Set<Zone> | undefined = this.zonesTracking.get(tick);
        if (!active) {
            zones = new Set();
        } else {
            zones = active;
        }
        zones.add(zone);
        this.zonesTracking.set(tick, zones);
    }

    addLoc(loc: Loc, duration: number): void {
        // console.log(`[World] addLoc => name: ${LocType.get(loc.type).name}, duration: ${duration}`);
        const type: LocType = LocType.get(loc.type);
        if (type.blockwalk) {
            this.gameMap.changeLocCollision(loc.shape, loc.angle, type.blockrange, type.length, type.width, type.active, loc.x, loc.z, loc.level, true);
        }

        const zone: Zone = this.getZone(loc.x, loc.z, loc.level);
        zone.addLoc(loc);
        loc.setLifeCycle(this.currentTick + duration);
        this.trackZone(this.currentTick + duration, zone);
        this.trackZone(this.currentTick, zone);
    }

    mergeLoc(loc: Loc, player: Player, startCycle: number, endCycle: number, south: number, east: number, north: number, west: number): void {
        // console.log(`[World] mergeLoc => name: ${LocType.get(loc.type).name}`);
        const zone: Zone = this.getZone(loc.x, loc.z, loc.level);
        zone.mergeLoc(loc, player, startCycle, endCycle, south, east, north, west);
        this.trackZone(this.currentTick, zone);
    }

    animLoc(loc: Loc, seq: number): void {
        // console.log(`[World] animLoc => name: ${LocType.get(loc.type).name}, seq: ${seq}`);
        const zone: Zone = this.getZone(loc.x, loc.z, loc.level);
        zone.animLoc(loc, seq);
        this.trackZone(this.currentTick, zone);
    }

    removeLoc(loc: Loc, duration: number): void {
        // console.log(`[World] removeLoc => name: ${LocType.get(loc.type).name}, duration: ${duration}`);
        const type: LocType = LocType.get(loc.type);
        if (type.blockwalk) {
            this.gameMap.changeLocCollision(loc.shape, loc.angle, type.blockrange, type.length, type.width, type.active, loc.x, loc.z, loc.level, false);
        }

        const zone: Zone = this.getZone(loc.x, loc.z, loc.level);
        zone.removeLoc(loc);
        loc.setLifeCycle(this.currentTick + duration);
        this.trackZone(this.currentTick + duration, zone);
        this.trackZone(this.currentTick, zone);
    }

    addObj(obj: Obj, receiverId: number, duration: number): void {
        // console.log(`[World] addObj => name: ${ObjType.get(obj.type).name}, receiverId: ${receiverId}, duration: ${duration}`);
        const objType: ObjType = ObjType.get(obj.type);
        // check if we need to changeobj first.
        const existing = this.getObj(obj.x, obj.z, obj.level, obj.type, receiverId);
        if (existing && existing.lifecycle === EntityLifeCycle.DESPAWN && obj.lifecycle === EntityLifeCycle.DESPAWN) {
            const nextCount = obj.count + existing.count;
            if (objType.stackable && nextCount <= Inventory.STACK_LIMIT) {
                // if an obj of the same type exists and is stackable, then we merge them.
                this.changeObj(existing, receiverId, nextCount);
                return;
            }
        }
        const zone: Zone = this.getZone(obj.x, obj.z, obj.level);
        zone.addObj(obj, receiverId);
        if (receiverId !== -1 && objType.tradeable && (objType.members && Environment.NODE_MEMBERS || !objType.members)) {
            // objs always reveal 100 ticks after being dropped.
            const reveal: number = this.currentTick + Obj.REVEAL;
            obj.setLifeCycle(reveal);
            this.trackZone(reveal, zone);
            this.trackZone(this.currentTick, zone);
            obj.receiverId = receiverId;
            obj.reveal = duration;
        } else {
            obj.setLifeCycle(this.currentTick + duration);
            this.trackZone(this.currentTick + duration, zone);
            this.trackZone(this.currentTick, zone);
        }
    }

    revealObj(obj: Obj): void {
        // console.log(`[World] revealObj => name: ${ObjType.get(obj.type).name}`);
        const duration: number = obj.reveal;
        const change: number = obj.lastChange;
        const zone: Zone = this.getZone(obj.x, obj.z, obj.level);
        zone.revealObj(obj, obj.receiverId);
        // objs next life cycle always starts from the last time they changed + the inputted duration.
        // accounting for reveal time here.
        const nextLifecycle: number = (change !== -1 ? (Obj.REVEAL - (this.currentTick - change)) : 0) + this.currentTick + duration;
        obj.setLifeCycle(nextLifecycle);
        this.trackZone(nextLifecycle, zone);
        this.trackZone(this.currentTick, zone);
    }

    changeObj(obj: Obj, receiverId: number, newCount: number): void {
        // console.log(`[World] changeObj => name: ${ObjType.get(obj.type).name}, receiverId: ${receiverId}, newCount: ${newCount}`);
        const zone: Zone = this.getZone(obj.x, obj.z, obj.level);
        zone.changeObj(obj, receiverId, obj.count, newCount);
        this.trackZone(this.currentTick, zone);
    }

    removeObj(obj: Obj, duration: number): void {
        // console.log(`[World] removeObj => name: ${ObjType.get(obj.type).name}, duration: ${duration}`);
        const zone: Zone = this.getZone(obj.x, obj.z, obj.level);
        zone.removeObj(obj);
        obj.setLifeCycle(this.currentTick + duration);
        this.trackZone(this.currentTick + duration, zone);
        this.trackZone(this.currentTick, zone);
    }

    animMap(level: number, x: number, z: number, spotanim: number, height: number, delay: number): void {
        const zone: Zone = this.getZone(x, z, level);
        zone.animMap(x, z, spotanim, height, delay);
        this.trackZone(this.currentTick, zone);
    }

    mapProjAnim(level: number, x: number, z: number, dstX: number, dstZ: number, target: number, spotanim: number, srcHeight: number, dstHeight: number, startDelay: number, endDelay: number, peak: number, arc: number): void {
        const zone: Zone = this.getZone(x, z, level);
        zone.mapProjAnim(x, z, dstX, dstZ, target, spotanim, srcHeight, dstHeight, startDelay, endDelay, peak, arc);
        this.trackZone(this.currentTick, zone);
    }

    // ----

    async readIn(socket: ClientSocket, stream: Packet): Promise<void> {
        while (stream.available > 0) {
            const start = stream.pos;
            let opcode = stream.g1();

            if (socket.decryptor) {
                opcode = (opcode - socket.decryptor.nextInt()) & 0xff;
                stream.data[start] = opcode;
            }

            if (typeof ClientProt.byId[opcode] === 'undefined') {
                socket.state = -1;
                socket.close();
                return;
            }

            let length = ClientProt.byId[opcode].length;
            if (length === -1) {
                length = stream.g1();
            } else if (length === -2) {
                length = stream.g2();
            }

            if (stream.available < length) {
                break;
            }

            stream.pos += length;

            socket.inCount[opcode]++;
            if (socket.inCount[opcode] > 5) {
                continue;
            }

            const data = new Uint8Array(stream.pos - start);
            const pos = stream.pos;
            stream.pos = start;
            stream.gdata(data, 0, data.length);
            stream.pos = pos;

            socket.in.set(data, socket.inOffset);
            socket.inOffset += stream.pos - start;
        }
    }

    addPlayer(player: Player): void {
        this.newPlayers.add(player);
    }

    async removePlayer(player: Player): Promise<void> {
        if (player.pid === -1) {
            return;
        }

        player.playerLog('Logging out');
        if (isNetworkPlayer(player)) {
            // visually disconnect the client
            player.logout();
            player.client!.close();
            player.client = null;
        }

        Login.logout(player);
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

    getTotalPlayers(): number {
        return this.players.count;
    }

    getTotalNpcs(): number {
        return this.npcs.count;
    }

    getTotalZones(): number {
        return this.zoneMap.zoneCount();
    }

    getTotalLocs(): number {
        return this.zoneMap.locCount();
    }

    getTotalObjs(): number {
        return this.zoneMap.objCount();
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
            // pid = first available index starting from (low ip octet % 20) * 100
            const ip = client.remoteAddress;
            const octets = ip.split('.');
            const start = (parseInt(octets[3]) % 20) * 100;
            return this.players.next(true, start);
        }
        return this.players.next();
    }
}

export default new World();
