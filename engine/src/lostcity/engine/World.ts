import {Worker} from 'worker_threads';
import fs from 'fs';
import Watcher from 'watcher';
import {basename} from 'path';
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
import {isNetworkPlayer, NetworkPlayer} from '#lostcity/entity/NetworkPlayer.js';
import {EntityQueueState} from '#lostcity/entity/EntityQueueRequest.js';
import {PlayerTimerType} from '#lostcity/entity/EntityTimer.js';

import ClientSocket from '#lostcity/server/ClientSocket.js';
import ServerProt from '#lostcity/server/ServerProt.js';

import Environment from '#lostcity/util/Environment.js';
import {getLatestModified, getModified, shouldBuildFileAny} from '#lostcity/util/PackFile.js';
import Zone from './zone/Zone.js';
import LinkList from '#jagex2/datastruct/LinkList.js';
import {createWorker} from '#lostcity/util/WorkerFactory.js';
import {LoginResponse} from '#lostcity/server/LoginServer.js';
import ClientProt from '#lostcity/network/225/incoming/prot/ClientProt.js';
import {makeCrcs} from '#lostcity/server/CrcTable.js';
import {preloadClient} from '#lostcity/server/PreloadedPacks.js';
import {Position} from '#lostcity/entity/Position.js';

class World {
    id = Environment.WORLD_ID as number;
    members = Environment.MEMBERS_WORLD as boolean;
    currentTick = 0;
    tickRate = 600; // speeds up when we're processing server shutdown
    shutdownTick = -1;

    // packed data timestamps
    allLastModified: number = 0;
    datLastModified: Map<string, number> = new Map();

    // debug data
    lastCycleStats: number[] = [];
    lastCycleBandwidth: number[] = [0, 0];

    readonly gameMap = new GameMap();
    readonly invs: Inventory[] = []; // shared inventories (shops)
    vars: Int32Array = new Int32Array(); // var shared
    varsString: string[] = [];

    // entities
    readonly newPlayers: Player[] = []; // players joining at the end of this tick
    readonly players: PlayerList = new PlayerList(2048);
    readonly npcs: NpcList = new NpcList(8192);

    // zones
    readonly zonesTracking: Map<number, Set<Zone>> = new Map();
    readonly queue: LinkList<EntityQueueState> = new LinkList();

    devWatcher: Watcher | null = null;
    devThread: Worker | null = null;
    devRebuilding: boolean = false;
    devMTime: Map<string, number> = new Map();

    // ----

    shouldReload(type: string, client: boolean = false): boolean {
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
            ObjType.load('data/pack', this.members);
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

            for (let i = 0; i < InvType.count; i++) {
                const inv = InvType.get(i);
    
                if (inv && inv.scope === InvType.SCOPE_SHARED) {
                    this.invs[i] = Inventory.fromType(i);
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

    broadcastMes(message: string): void {
        for (const player of this.players) {
            player.messageGame(message);
        }
    }

    async start(skipMaps = false, startCycle = true): Promise<void> {
        console.log('Starting world...');

        FontType.load('data/pack');
        WordEnc.load('data/pack');

        this.reload();

        if (!skipMaps) {
            this.gameMap.init();
        }

        Login.loginThread.postMessage({
            type: 'reset'
        });

        if (Environment.LOCAL_DEV) {
            this.startDevWatcher();

            // console.time('checker');
            // todo: this check takes me 300ms on startup! but it saves double building fresh setups
            if (Environment.BUILD_ON_STARTUP && (shouldBuildFileAny('data/pack/client', 'data/pack/client/lastbuild.pack') || shouldBuildFileAny('data/pack/server', 'data/pack/server/lastbuild.pack'))) {
                this.devThread!.postMessage({
                    type: 'pack'
                });
            }
            // console.timeEnd('checker');
        }

        if (Environment.WEB_PORT === 80) {
            console.log(kleur.green().bold('World ready') + kleur.white().bold(': http://' + Environment.PUBLIC_IP));
        } else {
            console.log(kleur.green().bold('World ready') + kleur.white().bold(': http://' + Environment.PUBLIC_IP + ':' + Environment.WEB_PORT));
        }

        if (startCycle) {
            await this.cycle();
        }
    }

    startDevWatcher(): void {
        this.devThread = createWorker('./src/lostcity/server/DevThread.ts');

        this.devThread.on('message', msg => {
            if (msg.type === 'done') {
                this.devRebuilding = false;
                this.reload();
            }
        });

        this.devThread.on('exit', () => {
            this.devRebuilding = false;
            this.broadcastMes('Error while rebuilding - see console for more info.');
            this.stopDevWatcher();
            this.startDevWatcher();
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

            console.log('dev:', basename(targetPath), 'was edited');
            this.devRebuilding = true;
            this.broadcastMes('Rebuilding, please wait...');

            if (!this.devThread) {
                this.devThread = createWorker('./src/lostcity/server/DevThread.ts');
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
            player.writeLowPriority(ServerProt.UPDATE_REBOOT_TIMER, this.shutdownTick - this.currentTick);
        }
    }

    async cycle(continueCycle = true): Promise<void> {
        const start = Date.now();

        // world processing
        // - world queue
        // - calculate afk event readiness
        // - npc spawn scripts
        // - npc hunt
        let worldProcessing = Date.now();
        for (let request = this.queue.head(); request !== null; request = this.queue.next()) {
            const delay = request.delay--;
            if (delay > 0) {
                continue;
            }

            const script = request.script;
            try {
                const state = ScriptRunner.execute(script);

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

        if (this.currentTick % 500 === 0) {
            for (const player of this.players) {
                // (normal) 1/12 chance every 5 minutes of setting an afk event state (even distrubution 60/5)
                // (afk) double the chance?
                player.afkEventReady = Math.random() < (player.zonesAfk() ? 0.1666 : 0.0833);
            }
        }

        for (const npc of this.npcs) {
            if (!npc.updateLifeCycle(this.currentTick)) {
                continue;
            }
            if (npc.lifecycle === EntityLifeCycle.RESPAWN) {
                this.addNpc(npc, -1);
            } else if (npc.lifecycle === EntityLifeCycle.DESPAWN) {
                this.removeNpc(npc, -1);
            }
        }

        for (const npc of this.npcs) {
            if (!npc.checkLifeCycle(this.currentTick) || npc.delayed()) {
                continue;
            }

            if (npc.huntMode !== -1) {
                npc.huntAll();
            }
        }
        worldProcessing = Date.now() - worldProcessing;

        // client input
        // - decode packets
        this.lastCycleBandwidth[0] = 0; // reset bandwidth counter
        let clientInput = Date.now();
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
        clientInput = Date.now() - clientInput;

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

                if (player.opcalled && (player.userPath.length === 0 || !Environment.CLIENT_PATHFINDER)) {
                    player.pathToTarget();
                    continue;
                }

                player.pathToMoveClick(player.userPath, !Environment.CLIENT_PATHFINDER);
            }

            if (player.target instanceof Player && (player.targetOp === ServerTriggerType.APPLAYER3 || player.targetOp === ServerTriggerType.OPPLAYER3)) {
                if (Position.distanceToSW(player, player.target) <= 25) {
                    player.pathToPathingTarget();
                } else {
                    player.clearWaypoints();
                }
            }
        }

        // npc processing (if npc is not busy)
        // - resume suspended script
        // - stat regen
        // - timer
        // - queue
        // - movement
        // - modes
        let npcProcessing = Date.now();
        for (const npc of this.npcs) {
            if (!npc.checkLifeCycle(this.currentTick)) {
                continue;
            }

            try {
                if (npc.delayed()) {
                    npc.delay--;
                }

                if (npc.delayed()) {
                    continue;
                }

                if (npc.activeScript) {
                    npc.executeScript(npc.activeScript);
                }

                if (!npc.checkLifeCycle(this.currentTick)) {
                    // if the npc just despawned then don't do anything else.
                    continue;
                }

                npc.processTimers();
                npc.processQueue();
                npc.processNpcModes();

                npc.validateDistanceWalked();
            } catch (err) {
                console.error(err);
                this.removeNpc(npc, -1);
            }
        }
        npcProcessing = Date.now() - npcProcessing;

        // player processing
        // - resume suspended script
        // - primary queue
        // - weak queue
        // - timers
        // - soft timers
        // - engine queue
        // - loc/obj interactions
        // - movement
        // - player/npc interactions
        // - close interface if attempting to logout
        let playerProcessing = Date.now();
        for (const player of this.players) {
            try {
                player.playtime++;

                if (player.delayed()) {
                    player.delay--;
                }

                if (player.activeScript && !player.delayed() && player.activeScript.execution === ScriptState.SUSPENDED) {
                    player.executeScript(player.activeScript, true);
                }

                player.processQueues();
                player.processTimers(PlayerTimerType.NORMAL);
                player.processTimers(PlayerTimerType.SOFT);
                player.processEngineQueue();
                player.processInteraction();

                if ((player.mask & Player.EXACT_MOVE) == 0) {
                    player.validateDistanceWalked();
                }

                if (this.shutdownTick < this.currentTick) {
                    // request logout on socket idle after 30 seconds (this may be 16 *ticks* in osrs!)
                    if (this.currentTick - player.lastResponse >= 50) {
                        player.logoutRequested = true;
                    }
                }

                if (player.logoutRequested) {
                    player.closeModal();
                }
            } catch (err) {
                console.error(err);
                await this.removePlayer(player);
            }
        }
        playerProcessing = Date.now() - playerProcessing;

        // player logout
        let playerLogout = Date.now();
        for (const player of this.players) {
            if (this.currentTick - player.lastResponse >= 100) {
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
        playerLogout = Date.now() - playerLogout;

        // player login, good spot for it (before packets so they immediately load but after processing so nothing hits them)
        let playerLogin = Date.now();
        for (let i = 0; i < this.newPlayers.length; i++) {
            const player = this.newPlayers[i];
            this.newPlayers.splice(i--, 1);

            let pid: number;
            try {
                // if it throws then there was no available pid. otherwise guaranteed to not be -1.
                pid = this.getNextPid(isNetworkPlayer(player) ? player.client : null);
            } catch (e) {
                if (player instanceof NetworkPlayer && player.client) {
                    // world full
                    player.client.send(LoginResponse.WORLD_FULL);
                    player.client.close();
                }
                continue;
            }

            // insert player into first available slot
            this.players.set(pid, player);
            player.pid = pid;
            player.uid = ((Number(player.username37 & 0x1fffffn) << 11) | player.pid) >>> 0;
            player.tele = true;

            this.getZone(player.x, player.z, player.level).enter(player);

            if (!Environment.CLIRUNNER) {
                // todo: check response from login script?
                player.onLogin();
            }

            if (this.shutdownTick > -1) {
                // todo: confirm if reboot timer is low or high priority
                player.writeLowPriority(ServerProt.UPDATE_REBOOT_TIMER, this.shutdownTick - this.currentTick);
            }

            if (player instanceof NetworkPlayer && player.client) {
                player.client.state = 1;
                if (player.staffModLevel >= 2) {
                    player.client.send(LoginResponse.STAFF_MOD_LEVEL);
                } else {
                    player.client.send(LoginResponse.SUCCESSFUL);
                }
            }
        }
        playerLogin = Date.now() - playerLogin;

        // process zones
        // - build list of active zones around players
        // - loc/obj despawn/respawn
        // - compute shared buffer
        let zoneProcessing = Date.now();
        for (const zone of Array.from(this.zonesTracking.get(this.currentTick) ?? [])) {
            zone.tick(this.currentTick);
        }
        this.computeSharedEvents();
        zoneProcessing = Date.now() - zoneProcessing;

        for (const player of this.players) {
            player.convertMovementDir();
        }

        for (const npc of this.npcs) {
            npc.convertMovementDir();
        }

        // client output
        // - map update
        // - player info
        // - npc info
        // - zone updates
        // - inv changes
        // - stat changes
        // - flush packets
        this.lastCycleBandwidth[1] = 0; // reset bandwidth counter
        let clientOutput = Date.now();
        for (const player of this.players) {
            if (!isNetworkPlayer(player)) {
                continue;
            }

            try {
                player.updateMap();
                player.updatePlayers();
                player.updateNpcs();
                player.updateZones();
                player.updateInvs();
                player.updateStats();
                player.updateAfkZones();

                player.encodeOut();
            } catch (err) {
                console.error(err);
                await this.removePlayer(player);
            }
        }
        clientOutput = Date.now() - clientOutput;

        let cleanup = Date.now();
        // cleanup zone updates
        for (const zone of Array.from(this.zonesTracking.get(this.currentTick) ?? [])) {
            zone.reset();
        }
        this.zonesTracking.delete(this.currentTick);

        // reset entity masks
        for (const player of this.players) {
            player.resetEntity(false);

            for (const inv of player.invs.values()) {
                if (!inv) {
                    continue;
                }

                inv.update = false;
            }
        }

        for (const npc of this.npcs) {
            if (!npc.checkLifeCycle(this.currentTick)) {
                continue;
            }

            npc.resetEntity(false);
        }

        for (let i = 0; i < this.invs.length; i++) {
            const inv = this.invs[i];
            if (!inv) {
                continue;
            }

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
                if (item.count < invType.stockcount[index] && this.currentTick % invType.stockrate[index] === 0) {
                    inv.add(item?.id, 1, index, true, false, false);
                    inv.update = true;
                    continue;
                }
                // Item stock is over min
                if (item.count > invType.stockcount[index] && this.currentTick % invType.stockrate[index] === 0) {
                    inv.remove(item?.id, 1, index, true);
                    inv.update = true;
                    continue;
                }

                // Item stock is not listed, such as general stores
                // Tested on low and high player count worlds, ever 1 minute stock decreases.
                if (invType.allstock && !invType.stockcount[index] && this.currentTick % 100 === 0) {
                    inv.remove(item?.id, 1, index, true);
                    inv.update = true;
                }
            }
        }
        cleanup = Date.now() - cleanup;

        if (this.currentTick % 100 === 0) {
            const players: bigint[] = [];
            for (const player of this.players) {
                players.push(player.username37);
            }

            Login.loginThread.postMessage({
                type: 'heartbeat',
                players
            });
        }

        // server shutdown
        if (this.shutdownTick > -1 && this.currentTick >= this.shutdownTick) {
            const duration = this.currentTick - this.shutdownTick; // how long have we been trying to shutdown
            const online = this.getTotalPlayers();

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
                    // we've already attempted to shutdown, now we speed things up
                    if (this.tickRate > 1) {
                        this.tickRate = 1;
                    }

                    // if we've exceeded 24000 ticks then we *really* need to shut down now
                    if (duration > 24000) {
                        for (const player of this.players) {
                            await this.removePlayer(player);
                        }

                        this.tickRate = 600;
                    }
                }
            } else {
                process.exit(0);
            }
        }

        if (this.currentTick % 1500 === 0 && this.currentTick > 0) {
            // auto-save players every 15 mins
            for (const player of this.players) {
                const sav = player.save();
                sav.release();
            }
        }

        const end = Date.now();
        // console.log(`tick ${this.currentTick} took ${end - start}ms: ${this.getTotalPlayers()} players`);
        // console.log(`${worldProcessing} ms world | ${clientInput} ms client in | ${npcProcessing} ms npcs | ${playerProcessing} ms players | ${playerLogout} ms logout | ${playerLogin} ms login | ${zoneProcessing} ms zones | ${clientOutput} ms client out | ${cleanup} ms cleanup`);
        // console.log('----');

        this.currentTick++;
        this.lastCycleStats = [end - start, worldProcessing, clientInput, npcProcessing, playerProcessing, playerLogout, playerLogin, zoneProcessing, clientOutput, cleanup];

        if (continueCycle) {
            const nextTick = this.tickRate - (end - start);
            setTimeout(this.cycle.bind(this), nextTick);
        }
    }

    enqueueScript(script: ScriptState, delay: number = 0): void {
        this.queue.addTail(new EntityQueueState(script, delay + 1));
    }

    getInventory(inv: number): Inventory | null {
        if (inv === -1) {
            return null;
        }

        let container = this.invs.find(x => x && x.type == inv);
        if (!container) {
            container = Inventory.fromType(inv);
            this.invs.push(container);
        }

        return container;
    }

    getZone(absoluteX: number, absoluteZ: number, level: number): Zone {
        return this.gameMap.zoneManager.getZone(absoluteX, absoluteZ, level);
    }

    getZoneIndex(zoneIndex: number): Zone | undefined {
        return this.gameMap.zoneManager.zones.get(zoneIndex);
    }

    computeSharedEvents(): void {
        const zones: Set<number> = new Set();
        for (const player of this.players) {
            if (!isNetworkPlayer(player)) {
                continue;
            }
            for (const zone of player.loadedZones) {
                zones.add(zone);
            }
        }
        for (const zoneIndex of zones) {
            const zone: Zone | undefined = this.getZoneIndex(zoneIndex);
            if (!zone) {
                continue;
            }
            zone.computeShared();
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
        if (receiverId !== -1 && objType.tradeable) {
            obj.setLifeCycle(this.currentTick + 100);
            this.trackZone(this.currentTick + 100, zone);
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
        const zone: Zone = this.getZone(obj.x, obj.z, obj.level);
        zone.revealObj(obj, obj.receiverId);
        obj.setLifeCycle(this.currentTick + duration);
        this.trackZone(this.currentTick + duration, zone);
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
        this.lastCycleBandwidth[0] += stream.data.length;

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
        this.newPlayers.push(player);
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

    getPlayer(pid: number): Player | null {
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

    getNpc(nid: number): Npc | null {
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
