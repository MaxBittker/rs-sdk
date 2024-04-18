import { Worker } from 'worker_threads';

import Packet from '#jagex2/io/Packet.js';

import { toBase37 } from '#jagex2/jstring/JString.js';

import CategoryType from '#lostcity/cache/CategoryType.js';
import DbRowType from '#lostcity/cache/DbRowType.js';
import DbTableType from '#lostcity/cache/DbTableType.js';
import EnumType from '#lostcity/cache/EnumType.js';
import FontType from '#lostcity/cache/FontType.js';
import HuntType from '#lostcity/cache/HuntType.js';
import IdkType from '#lostcity/cache/IdkType.js';
import Component from '#lostcity/cache/Component.js';
import InvType from '#lostcity/cache/InvType.js';
import LocType from '#lostcity/cache/LocType.js';
import MesanimType from '#lostcity/cache/MesanimType.js';
import NpcType from '#lostcity/cache/NpcType.js';
import ObjType from '#lostcity/cache/ObjType.js';
import ParamType from '#lostcity/cache/ParamType.js';
import SeqFrame from '#lostcity/cache/SeqFrame.js';
import SeqType from '#lostcity/cache/SeqType.js';
import StructType from '#lostcity/cache/StructType.js';
import VarNpcType from '#lostcity/cache/VarNpcType.js';
import VarPlayerType from '#lostcity/cache/VarPlayerType.js';
import VarSharedType from '#lostcity/cache/VarSharedType.js';
import WordEnc from '#lostcity/cache/WordEnc.js';
import SpotanimType from '#lostcity/cache/SpotanimType.js';

import GameMap from '#lostcity/engine/GameMap.js';
import { Inventory } from '#lostcity/engine/Inventory.js';
import Login from '#lostcity/engine/Login.js';

import CollisionManager from '#lostcity/engine/collision/CollisionManager.js';

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

import ClientSocket from '#lostcity/server/ClientSocket.js';
import ServerProt from '#lostcity/server/ServerProt.js';

import Environment from '#lostcity/util/Environment.js';
import { EntityQueueState } from '#lostcity/entity/EntityQueueRequest.js';
import { PlayerTimerType } from '#lostcity/entity/EntityTimer.js';
import { getLatestModified, getModified } from '#lostcity/util/PackFile.js';
import { ZoneEvent } from './zone/Zone.js';
import LinkList from '#jagex2/datastruct/LinkList.js';
import ClientProt from '#lostcity/server/ClientProt.js';

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

    gameMap = new GameMap();
    invs: Inventory[] = []; // shared inventories (shops)
    vars: Int32Array = new Int32Array(); // var shared

    newPlayers: Player[] = []; // players joining at the end of this tick
    players: (Player | null)[] = new Array<Player | null>(2048);
    playerIds: number[] = new Array(2048); // indexes into players

    npcs: (Npc | null)[] = new Array<Npc>(8192);

    trackedZones: number[] = [];
    zoneBuffers: Map<number, Packet> = new Map();
    futureUpdates: Map<number, number[]> = new Map();
    queue: LinkList = new LinkList();

    friendThread: Worker = new Worker('./src/lostcity/server/FriendThread.ts');

    constructor() {
        this.players.fill(null);
        this.playerIds.fill(-1);

        this.friendThread.on('message', data => {
            try {
                this.onFriendMessage(data);
            } catch (err) {
                console.error('Friend Thread:', err);
            }
        });
    }

    // ----

    onFriendMessage(msg: any) {
        switch (msg.type) {
            default:
                throw new Error('Unknown message type: ' + msg.type);
        }
    }

    socialAddFriend(player: bigint, other: bigint) {
        this.friendThread.postMessage({
            type: 'addfriend',
            player: player,
            other: other
        });
    }

    socialRemoveFriend(player: bigint, other: bigint) {
        this.friendThread.postMessage({
            type: 'delfriend',
            player: player,
            other: other
        });
    }

    socialAddIgnore(player: bigint, other: bigint) {
        this.friendThread.postMessage({
            type: 'addignore',
            player: player,
            other: other
        });
    }

    socialRemoveIgnore(player: bigint, other: bigint) {
        this.friendThread.postMessage({
            type: 'delignore',
            player: player,
            other: other
        });
    }

    socialLogin(username: bigint) {
        this.friendThread.postMessage({
            type: 'login',
            world: this.id,
            username
        });
    }

    socialLogout(username: bigint) {
        this.friendThread.postMessage({
            type: 'logout',
            world: this.id,
            username
        });
    }

    socialPrivateMessage(from: bigint, to: bigint, text: string) {
        this.friendThread.postMessage({
            type: 'private_message',
            from,
            to,
            text
        });
    }

    socialPublicMessage(from: bigint, text: string) {
        this.friendThread.postMessage({
            type: 'public_message',
            from,
            text
        });
    }

    // ----

    get collisionManager(): CollisionManager {
        return this.gameMap.collisionManager;
    }

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

    reload() {
        if (this.shouldReload('varp', true)) {
            VarPlayerType.load('data/pack');
        }

        if (this.shouldReload('param')) {
            ParamType.load('data/pack');
        }

        if (this.shouldReload('obj', true)) {
            ObjType.load('data/pack', this.members);
        }

        if (this.shouldReload('loc', true)) {
            LocType.load('data/pack');
        }

        if (this.shouldReload('npc', true)) {
            NpcType.load('data/pack');
        }

        if (this.shouldReload('idk', true)) {
            IdkType.load('data/pack');
        }

        if (this.shouldReload('frame_del')) {
            SeqFrame.load('data/pack');
        }

        if (this.shouldReload('seq', true)) {
            SeqType.load('data/pack');
        }

        if (this.shouldReload('spotanim', true)) {
            SpotanimType.load('data/pack');
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
        }

        if (this.shouldReload('interface')) {
            Component.load('data/pack');
        }

        if (this.shouldReload('script')) {
            const count = ScriptProvider.load('data/pack');
            if (count === -1) {
                this.broadcastMes('There was an issue while reloading. Please wait or try again.');
            } else {
                this.broadcastMes(`Reloaded ${count} scripts.`);
            }
        }

        this.allLastModified = getLatestModified('data/pack', '.dat');
    }

    broadcastMes(message: string) {
        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            if (!player) {
                continue;
            }

            player.messageGame(message);
        }
    }

    async start(skipMaps = false, startCycle = true) {
        console.log('Starting world...');

        for (let i = 0; i < this.npcs.length; i++) {
            this.npcs[i] = null;
        }

        FontType.load('data/pack');
        WordEnc.load('data/pack');

        this.reload();

        if (!skipMaps) {
            this.gameMap.init();
        }

        this.vars = new Int32Array(VarSharedType.count);

        Login.loginThread.postMessage({
            type: 'reset'
        });

        this.friendThread.postMessage({
            type: 'reset'
        });

        console.log('World ready!');

        if (startCycle) {
            await this.cycle();
        }
    }

    rebootTimer(duration: number) {
        this.shutdownTick = this.currentTick + duration;

        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            if (!player) {
                continue;
            }

            player.write(ServerProt.UPDATE_REBOOT_TIMER, this.shutdownTick - this.currentTick);
        }
    }

    async cycle(continueCycle = true) {
        if (Environment.LOCAL_DEV) {
            const lastModified = getLatestModified('data/pack/server', '.dat');
            if (lastModified != this.allLastModified) {
                console.log('Reloading data...');
                this.reload();
            }
        }

        const start = Date.now();

        // world processing
        // - world queue
        // - calculate afk event readiness
        // - npc spawn scripts
        // - npc hunt
        let worldProcessing = Date.now();
        for (let request: EntityQueueState | null = this.queue.head() as EntityQueueState | null; request !== null; request = this.queue.next() as EntityQueueState | null) {
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
            for (let i = 0; i < this.players.length; i++) {
                const player = this.players[i];
                if (!player) {
                    continue;
                }

                // 1/12 chance every 5 minutes of setting an afk event state (even distrubution 60/5)
                player.afkEventReady = Math.random() < 0.0833;
            }
        }

        for (let i = 0; i < this.npcs.length; i++) {
            const npc = this.npcs[i];

            if (!npc || npc.respawn !== this.currentTick) {
                continue;
            }

            this.addNpc(npc);
        }

        for (let i = 0; i < this.npcs.length; i++) {
            const npc = this.npcs[i];

            if (!npc || npc.despawn !== -1 || npc.delayed()) {
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
        for (let i = 0; i < this.playerIds.length; i++) {
            // iterate on playerIds so pid order matters
            if (this.playerIds[i] === -1) {
                continue;
            }

            const player = this.players[this.playerIds[i]];
            if (!player) {
                continue;
            }

            if (!player.client) {
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

        // npc processing (if npc is not busy)
        // - resume suspended script
        // - stat regen
        // - timer
        // - queue
        // - movement
        // - modes
        let npcProcessing = Date.now();
        for (let i = 1; i < this.npcs.length; i++) {
            const npc = this.npcs[i];

            if (!npc || npc.despawn !== -1) {
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

                npc.processTimers();
                npc.processQueue();
                npc.processNpcModes();

                npc.validateDistanceWalked();
            } catch (err) {
                console.error(err);
                this.removeNpc(npc);
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
        for (let i = 0; i < this.playerIds.length; i++) {
            // iterate on playerIds so pid order matters
            if (this.playerIds[i] === -1) {
                continue;
            }

            const player = this.players[this.playerIds[i]];
            if (!player) {
                continue;
            }

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
        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            if (!player) {
                continue;
            }

            if (this.currentTick - player.lastResponse >= 100) {
                // remove after 60 seconds
                player.queue.clear();
                player.weakQueue.clear();
                player.engineQueue.clear();
                player.clearInteraction();
                player.closeModal();
                player.unsetMapFlag();
                player.logoutRequested = true;
                player.setVar('lastcombat', 0); // temp fix for logging out in combat, since logout trigger conditions still run...
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

            const pid = this.getNextPid(player.client);
            if (pid === -1) {
                if (player.client) {
                    // world full
                    player.client.send(Uint8Array.from([7]));
                    player.client.close();
                }

                this.newPlayers.splice(i--, 1);
                continue;
            }

            // insert player into first available slot
            let index = -1;
            for (let i = 0; i < this.players.length; i++) {
                if (this.players[i] === null) {
                    index = i;
                    break;
                }
            }
            this.players[index] = player;
            this.playerIds[pid] = index;
            player.pid = pid;
            player.uid = ((Number(player.username37 & 0x1fffffn) << 11) | player.pid) >>> 0;

            this.getZone(player.x, player.z, player.level).enter(player);

            if (!Environment.CLIRUNNER) {
                // todo: check response from login script?
                player.onLogin();
            }

            this.newPlayers.splice(i--, 1);

            if (this.shutdownTick > -1) {
                player.write(ServerProt.UPDATE_REBOOT_TIMER, this.shutdownTick - this.currentTick);
            }

            if (player.client) {
                player.client.state = 1;
                player.client.send(Uint8Array.from([2]));
            }

            this.socialLogin(player.username37);
        }
        playerLogin = Date.now() - playerLogin;

        // process zones
        // - build list of active zones around players
        // - loc/obj despawn/respawn
        // - compute shared buffer
        let zoneProcessing = Date.now();
        const future = this.futureUpdates.get(this.currentTick);
        if (future) {
            // despawn dynamic
            for (let i = 0; i < future.length; i++) {
                const zoneIndex = future[i];
                const zone = this.getZoneIndex(zoneIndex);

                for (let i = 0; i < zone.locs.length; i++) {
                    const loc = zone.locs[i];
                    if (!loc || loc.despawn === -1) {
                        continue;
                    }

                    if (loc.despawn === this.currentTick) {
                        this.removeLoc(loc, -1);
                        i--;
                    }
                }

                for (let i = 0; i < zone.objs.length; i++) {
                    const obj = zone.objs[i];
                    if (!obj || obj.despawn === -1) {
                        continue;
                    }

                    if (obj.despawn === this.currentTick) {
                        this.removeObj(obj, null);
                        i--;
                    }
                }
            }

            // respawn static
            for (let i = 0; i < future.length; i++) {
                const zoneIndex = future[i];
                const zone = this.getZoneIndex(zoneIndex);

                for (let i = 0; i < zone.staticLocs.length; i++) {
                    const loc = zone.staticLocs[i];
                    if (!loc || loc.respawn === -1) {
                        continue;
                    }

                    if (loc.respawn === this.currentTick) {
                        loc.respawn = -1;
                        this.addLoc(loc, -1);
                    }
                }

                for (let i = 0; i < zone.staticObjs.length; i++) {
                    const obj = zone.staticObjs[i];
                    if (!obj || obj.respawn === -1) {
                        continue;
                    }

                    if (obj.respawn === this.currentTick) {
                        obj.respawn = -1;
                        this.addObj(obj, null, -1);
                    }
                }
            }

            this.futureUpdates.delete(this.currentTick);
        }

        this.computeSharedEvents();
        zoneProcessing = Date.now() - zoneProcessing;

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
        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            if (!player) {
                continue;
            }

            if (!player.client) {
                continue;
            }

            try {
                player.updateMap();
                player.updatePlayers();
                player.updateNpcs();
                player.updateZones();
                player.updateInvs();
                player.updateStats();

                player.encodeOut();
            } catch (err) {
                console.error(err);
                await this.removePlayer(player);
            }
        }
        clientOutput = Date.now() - clientOutput;

        // reset entity masks
        let cleanup = Date.now();
        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            if (!player) {
                continue;
            }

            player.resetEntity(false);

            for (const inv of player.invs.values()) {
                if (!inv) {
                    continue;
                }

                inv.update = false;
            }
        }

        for (let i = 1; i < this.npcs.length; i++) {
            const npc = this.npcs[i];

            if (!npc || npc.despawn !== -1) {
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

            if (invType.restock) {
                inv.items.forEach((item, index) => {
                    if (item) {
                        // Item stock is under min
                        if (item.count < invType.stockcount[index] && this.currentTick % invType.stockrate[index] === 0) {
                            inv.add(item?.id, 1, index, true, false, false);
                            inv.update = true;
                            return;
                        }

                        // Item stock is over min
                        if (item.count > invType.stockcount[index] && this.currentTick % invType.stockrate[index] === 0) {
                            inv.remove(item?.id, 1, index, true);
                            inv.update = true;
                            return;
                        }

                        // Item stock is not listed, such as general stores
                        // Tested on low and high player count worlds, ever 1 minute stock decreases.
                        if (invType.allstock) {
                            if (!invType.stockcount[index] && this.currentTick % 100 === 0) {
                                inv.remove(item?.id, 1, index, true);
                                inv.update = true;
                                return;
                            }
                        }
                    }
                });
            }
        }
        cleanup = Date.now() - cleanup;

        if (this.currentTick % 100 === 0) {
            const players: bigint[] = [];
            for (let i = 0; i < this.players.length; i++) {
                const player = this.players[i];
                if (!player) {
                    continue;
                }

                players.push(player.username37);
            }

            Login.loginThread.postMessage({
                type: 'heartbeat',
                players
            });

            this.friendThread.postMessage({
                type: 'heartbeat',
                players
            });
        }

        // server shutdown
        if (this.shutdownTick > -1 && this.currentTick >= this.shutdownTick) {
            const duration = this.currentTick - this.shutdownTick; // how long have we been trying to shutdown
            const online = this.playerIds.filter(p => p !== -1).length;

            if (online) {
                for (let i = 0; i < this.players.length; i++) {
                    const player = this.players[i];
                    if (!player) {
                        continue;
                    }

                    player.logoutRequested = true;

                    if (player.client) {
                        player.logout(); // visually log out

                        // if it's been more than a few ticks and the client just won't leave us alone, close the socket
                        if (player.client && duration > 2) {
                            player.client.close();
                        }
                    }
                }

                if (this.npcs.length > 0) {
                    this.npcs = [];
                }

                if (duration > 2) {
                    // we've already attempted to shutdown, now we speed things up
                    if (this.tickRate > 1) {
                        this.tickRate = 1;
                    }

                    // if we've exceeded 24000 ticks then we *really* need to shut down now
                    if (duration > 24000) {
                        for (let i = 0; i < this.players.length; i++) {
                            const player = this.players[i];

                            if (player !== null) {
                                await this.removePlayer(player);
                            }
                        }

                        this.tickRate = 600;
                    }
                }
            } else {
                process.exit(0);
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

            this.friendThread.postMessage({
                type: 'latest'
            });
        }
    }

    enqueueScript(script: ScriptState, delay: number = 0) {
        this.queue.addTail(new EntityQueueState(script, delay + 1));
    }

    getInventory(inv: number) {
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

    getZone(absoluteX: number, absoluteZ: number, level: number) {
        return this.gameMap.zoneManager.getZone(absoluteX, absoluteZ, level);
    }

    getZoneIndex(zoneIndex: number) {
        return this.gameMap.zoneManager.zones.get(zoneIndex)!;
    }

    computeSharedEvents() {
        this.trackedZones = [];
        this.zoneBuffers = new Map();

        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            if (!player) {
                continue;
            }

            // TODO: optimize this
            const zones = Object.keys(player.loadedZones);
            for (let j = 0; j < zones.length; j++) {
                const zoneIndex = parseInt(zones[j]);
                if (!this.trackedZones.includes(zoneIndex)) {
                    this.trackedZones.push(zoneIndex);
                }
            }
        }

        for (let i = 0; i < this.trackedZones.length; i++) {
            const zoneIndex = this.trackedZones[i];
            const zone = this.getZoneIndex(zoneIndex);

            const updates = zone.updates;
            if (!updates.length) {
                continue;
            }

            zone.updates = updates.filter((event: ZoneEvent): boolean => {
                // filter transient updates
                if ((event.type === ServerProt.LOC_MERGE.id || event.type === ServerProt.LOC_ANIM.id || event.type === ServerProt.MAP_ANIM.id || event.type === ServerProt.MAP_PROJANIM.id) && event.tick < this.currentTick) {
                    return false;
                }

                return true;
            });
        }
    }

    getSharedEvents(zoneIndex: number): Packet | undefined {
        return this.zoneBuffers.get(zoneIndex);
    }

    getUpdates(zoneIndex: number) {
        return this.gameMap.zoneManager.zones.get(zoneIndex)!.updates;
    }

    getReceiverUpdates(zoneIndex: number, receiverId: number) {
        const updates = this.getUpdates(zoneIndex);
        return updates.filter((event: ZoneEvent): boolean => {
            if (event.type !== ServerProt.OBJ_ADD.id && event.type !== ServerProt.OBJ_DEL.id && event.type !== ServerProt.OBJ_COUNT.id && event.type !== ServerProt.OBJ_REVEAL.id) {
                return false;
            }

            // if (event.type === ServerProt.OBJ_DEL && receiverId !== -1 && event.receiverId !== receiverId) {
            //     return false;
            // }

            return true;
        });
    }

    getZonePlayers(x: number, z: number, level: number) {
        return this.getZone(x, z, level).players;
    }

    getZoneNpcs(x: number, z: number, level: number) {
        return this.getZone(x, z, level).npcs;
    }

    addNpc(npc: Npc) {
        this.npcs[npc.nid] = npc;
        npc.x = npc.startX;
        npc.z = npc.startZ;

        const zone = this.getZone(npc.x, npc.z, npc.level);
        zone.enter(npc);

        switch (npc.blockWalk) {
            case BlockWalk.NPC:
                this.collisionManager.changeNpcCollision(npc.width, npc.x, npc.z, npc.level, true);
                break;
            case BlockWalk.ALL:
                this.collisionManager.changeNpcCollision(npc.width, npc.x, npc.z, npc.level, true);
                this.collisionManager.changePlayerCollision(npc.width, npc.x, npc.z, npc.level, true);
                break;
        }

        npc.resetEntity(true);
        npc.playAnimation(-1, 0);
    }

    removeNpc(npc: Npc) {
        const zone = this.getZone(npc.x, npc.z, npc.level);
        zone.leave(npc);

        switch (npc.blockWalk) {
            case BlockWalk.NPC:
                this.collisionManager.changeNpcCollision(npc.width, npc.x, npc.z, npc.level, false);
                break;
            case BlockWalk.ALL:
                this.collisionManager.changeNpcCollision(npc.width, npc.x, npc.z, npc.level, false);
                this.collisionManager.changePlayerCollision(npc.width, npc.x, npc.z, npc.level, false);
                break;
        }

        if (!npc.static) {
            this.npcs[npc.nid] = null;
        } else {
            const type = NpcType.get(npc.type);
            npc.despawn = this.currentTick;
            npc.respawn = this.currentTick + type.respawnrate;
        }
    }

    getLoc(x: number, z: number, level: number, locId: number) {
        return this.getZone(x, z, level).getLoc(x, z, locId);
    }

    getZoneLocs(x: number, z: number, level: number) {
        return [...this.getZone(x, z, level).staticLocs.filter(l => l.respawn < this.currentTick), ...this.getZone(x, z, level).locs];
    }

    getObj(x: number, z: number, level: number, objId: number) {
        return this.getZone(x, z, level).getObj(x, z, objId);
    }

    addLoc(loc: Loc, duration: number) {
        const zone = this.getZone(loc.x, loc.z, loc.level);
        zone.addLoc(loc, duration);

        const type = LocType.get(loc.type);
        if (type.blockwalk) {
            this.collisionManager.changeLocCollision(loc.shape, loc.angle, type.blockrange, type.length, type.width, type.active, loc.x, loc.z, loc.level, true);
        }

        loc.despawn = this.currentTick + duration;
        loc.respawn = -1;
        if (duration !== -1) {
            const endTick = this.currentTick + duration;
            let future = this.futureUpdates.get(endTick);
            if (!future) {
                future = [];
            }

            if (!future.includes(zone.index)) {
                future.push(zone.index);
            }

            this.futureUpdates.set(endTick, future);
        }
    }

    removeLoc(loc: Loc, duration: number) {
        const zone = this.getZone(loc.x, loc.z, loc.level);
        zone.removeLoc(loc, duration);

        const type = LocType.get(loc.type);
        if (type.blockwalk) {
            this.collisionManager.changeLocCollision(loc.shape, loc.angle, type.blockrange, type.length, type.width, type.active, loc.x, loc.z, loc.level, false);
        }

        loc.despawn = -1;
        loc.respawn = this.currentTick + duration;
        if (duration !== -1) {
            const endTick = this.currentTick + duration;
            let future = this.futureUpdates.get(endTick);
            if (!future) {
                future = [];
            }

            if (!future.includes(zone.index)) {
                future.push(zone.index);
            }

            this.futureUpdates.set(endTick, future);
        }
    }

    addObj(obj: Obj, receiver: Player | null, duration: number) {
        const zone = this.getZone(obj.x, obj.z, obj.level);
        const existing = this.getObj(obj.x, obj.z, obj.level, obj.id);
        if (existing && existing.id == obj.id) {
            const type = ObjType.get(obj.type);
            const nextCount = obj.count + existing.count;
            if (type.stackable && nextCount <= Inventory.STACK_LIMIT) {
                // if an obj of the same type exists and is stackable, then we merge them.
                obj.count = nextCount;
                zone.removeObj(existing, receiver);
            }
        }
        zone.addObj(obj, receiver, duration);

        obj.despawn = this.currentTick + duration;
        obj.respawn = -1;
        if (duration !== -1) {
            const endTick = this.currentTick + duration;
            let future = this.futureUpdates.get(endTick);
            if (!future) {
                future = [];
            }

            if (!future.includes(zone.index)) {
                future.push(zone.index);
            }

            this.futureUpdates.set(endTick, future);
        }
    }

    removeObj(obj: Obj, receiver: Player | null) {
        // TODO
        // stackable objs when they overflow are created into another slot on the floor
        // currently when you pickup from a tile with multiple stackable objs
        // you will pickup one of them and the other one disappears
        const zone = this.getZone(obj.x, obj.z, obj.level);
        zone.removeObj(obj, receiver, -1);
        obj.despawn = this.currentTick;
        obj.respawn = this.currentTick + ObjType.get(obj.type).respawnrate;
        if (zone.staticObjs.includes(obj)) {
            let future = this.futureUpdates.get(obj.respawn);
            if (!future) {
                future = [];
            }
            if (!future.includes(zone.index)) {
                future.push(zone.index);
            }
            this.futureUpdates.set(obj.respawn, future);
        }
    }

    // ----

    async readIn(socket: ClientSocket, stream: Packet) {
        this.lastCycleBandwidth[0] += stream.length;

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

            socket.in.set(stream.gdata(stream.pos - start, start, false), socket.inOffset);
            socket.inOffset += stream.pos - start;
        }
    }

    addPlayer(player: Player, client: ClientSocket | null) {
        if (client) {
            client.player = player;
            player.client = client;
        }

        this.newPlayers.push(player);
    }

    async removePlayer(player: Player) {
        if (player.pid === -1) {
            return;
        }

        player.playerLog('Logging out');
        if (player.client) {
            // visually disconnect the client
            player.logout();
            player.client.close();
            player.client = null;
        }

        Login.logout(player);
        this.socialLogout(player.username37);
    }

    getPlayer(pid: number) {
        const slot = this.playerIds[pid];
        if (slot === -1) {
            return null;
        }

        const player = this.players[slot];
        if (!player) {
            return null;
        }

        return player;
    }

    getPlayerByUid(uid: number) {
        const pid = uid & 0x7ff;
        const name37 = (uid >> 11) & 0x1fffff;

        const slot = this.playerIds[pid];
        if (slot === -1) {
            return null;
        }

        const player = this.players[slot];
        if (!player) {
            return null;
        }

        if (Number(player.username37 & 0x1fffffn) !== name37) {
            return null;
        }

        return player;
    }

    getPlayerByUsername(username: string) {
        const username37 = toBase37(username);
        return this.players.find(p => p && p.username37 === username37) ?? this.newPlayers.find(p => p && p.username37 === username37);
    }

    getTotalPlayers() {
        return this.players.filter(p => p).length;
    }

    getTotalNpcs() {
        return this.npcs.filter(n => n).length;
    }

    getNpc(nid: number) {
        return this.npcs[nid];
    }

    getNpcByUid(uid: number) {
        const slot = uid & 0xffff;
        const type = (uid >> 16) & 0xffff;

        const npc = this.npcs[slot];
        if (!npc || npc.type !== type) {
            return null;
        }

        return npc;
    }

    getNextNid() {
        return this.npcs.indexOf(null, 1);
    }

    getNextPid(client: ClientSocket | null = null) {
        let pid = -1;

        // valid pid range is 1-2046
        if (client) {
            // pid = first available index starting from (low ip octet % 20) * 100
            const ip = client.remoteAddress;
            const octets = ip.split('.');
            const start = (parseInt(octets[3]) % 20) * 100;

            // start searching at 1 if the calculated start is 0
            const init = start === 0 ? 1 : 0;
            for (let i = init; i < 100; i++) {
                const index = start + i;
                if (this.playerIds[index] === -1) {
                    pid = index;
                    break;
                }
            }
        }

        if (pid === -1) {
            // pid = first available index starting at 1 (0 is reserved for the protocol's local character)
            for (let i = 1; i < this.playerIds.length - 1; i++) {
                if (this.playerIds[i] === -1) {
                    pid = i;
                    break;
                }
            }
        }

        return pid;
    }
}

export default new World();
