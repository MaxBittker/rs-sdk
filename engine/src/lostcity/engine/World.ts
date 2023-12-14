import Packet from '#jagex2/io/Packet.js';

import { toBase37 } from '#jagex2/jstring/JString.js';

import PathFinder from '#rsmod/PathFinder.js';
import LineValidator from '#rsmod/LineValidator.js';
import CollisionFlagMap from '#rsmod/collision/CollisionFlagMap.js';

import CategoryType from '#lostcity/cache/CategoryType.js';
import DbRowType from '#lostcity/cache/DbRowType.js';
import DbTableType from '#lostcity/cache/DbTableType.js';
import EnumType from '#lostcity/cache/EnumType.js';
import FontType from '#lostcity/cache/FontType.js';
import HuntType from '#lostcity/cache/HuntType.js';
import IdkType from '#lostcity/cache/IdkType.js';
import IfType from '#lostcity/cache/IfType.js';
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

import { Inventory } from '#lostcity/engine/Inventory.js';
import GameMap from '#lostcity/engine/GameMap.js';

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

import { ClientProtLengths } from '#lostcity/server/ClientProt.js';
import ClientSocket from '#lostcity/server/ClientSocket.js';
import { ServerProt } from '#lostcity/server/ServerProt.js';

import Environment from '#lostcity/util/Environment.js';
import { LoginClient } from '#lostcity/server/LoginServer.js';
import NaivePathFinder from '#rsmod/NaivePathFinder.js';
import StepValidator from '#rsmod/StepValidator.js';

class World {
    members = Environment.MEMBERS_WORLD as boolean;
    currentTick = 0;
    tickRate = 600; // speeds up when we're processing server shutdown
    shutdownTick = -1;

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
    queue: {
        script: ScriptState;
        delay: number;
    }[] = [];

    constructor() {
        this.players.fill(null);
        this.playerIds.fill(-1);
    }

    get collisionManager(): CollisionManager {
        return this.gameMap.collisionManager;
    }

    get collisionFlags(): CollisionFlagMap {
        return this.collisionManager.flags;
    }

    get pathFinder(): PathFinder {
        return this.collisionManager.pathFinder;
    }

    get naivePathFinder(): NaivePathFinder {
        return this.collisionManager.naivePathFinder;
    }

    get lineValidator(): LineValidator {
        return this.collisionManager.lineValidator;
    }

    get stepValidator(): StepValidator {
        return this.collisionManager.stepValidator;
    }

    async start(skipMaps = false, startCycle = true) {
        console.log('Starting world...');

        for (let i = 0; i < this.npcs.length; i++) {
            this.npcs[i] = null;
        }

        // console.time('Loading category.dat');
        CategoryType.load('data/pack/server');
        // console.timeEnd('Loading category.dat');

        // console.time('Loading param.dat');
        ParamType.load('data/pack/server');
        // console.timeEnd('Loading param.dat');

        // console.time('Loading enum.dat');
        EnumType.load('data/pack/server');
        // console.timeEnd('Loading enum.dat');

        // console.time('Loading struct.dat');
        StructType.load('data/pack/server');
        // console.timeEnd('Loading struct.dat');

        // console.time('Loading inv.dat');
        InvType.load('data/pack/server');
        // console.timeEnd('Loading inv.dat');

        for (let i = 0; i < InvType.count; i++) {
            const inv = InvType.get(i);

            if (inv && inv.scope === InvType.SCOPE_SHARED) {
                this.invs.push(Inventory.fromType(i));
            }
        }

        // console.time('Loading varp.dat');
        VarPlayerType.load('data/pack/server');
        // console.timeEnd('Loading varp.dat');

        // console.time('Loading obj.dat');
        ObjType.load('data/pack/server', this.members);
        // console.timeEnd('Loading obj.dat');

        // console.time('Loading loc.dat');
        LocType.load('data/pack/server');
        // console.timeEnd('Loading loc.dat');

        // console.time('Loading npc.dat');
        NpcType.load('data/pack/server');
        // console.timeEnd('Loading npc.dat');

        // console.time('Loading idk.dat');
        IdkType.load('data/pack/server');
        // console.timeEnd('Loading idk.dat');

        // console.time('Loading interface.dat');
        IfType.load('data/pack/server');
        // console.timeEnd('Loading interface.dat');

        // console.time('Loading frame_del.dat');
        SeqFrame.load('data/pack/server');
        // console.timeEnd('Loading frame_del.dat');

        // console.time('Loading seq.dat');
        SeqType.load('data/pack/server');
        // console.timeEnd('Loading seq.dat');

        // console.time('Loading fonts');
        FontType.load('data/pack/client');
        // console.timeEnd('Loading fonts');

        // console.time('Loading mesanim.dat');
        MesanimType.load('data/pack/server');
        // console.timeEnd('Loading mesanim.dat');

        // console.time('Loading dbtable.dat');
        DbTableType.load('data/pack/server');
        // console.timeEnd('Loading dbtable.dat');

        // console.time('Loading dbrow.dat');
        DbRowType.load('data/pack/server');
        // console.timeEnd('Loading dbrow.dat');

        // console.time('Loading hunt.dat');
        HuntType.load('data/pack/server');
        // console.timeEnd('Loading hunt.dat');

        // console.time('Loading varn.dat');
        VarNpcType.load('data/pack/server');
        // console.timeEnd('Loading varn.dat');

        // console.time('Loading vars.dat');
        VarSharedType.load('data/pack/server');
        // console.timeEnd('Loading vars.dat');

        if (!skipMaps) {
            this.gameMap.init();
        }

        // console.time('Loading script.dat');
        ScriptProvider.load('data/pack/server');
        // console.timeEnd('Loading script.dat');

        this.vars = new Int32Array(VarSharedType.count);

        if (Environment.LOGIN_KEY) {
            await LoginClient.reset();
        }

        // for (let i = 0; i < 1999; i++) {
        //     const player = Player.load('test' + i);
        //     player.x = 3232 + Math.random() * 32 - 16;
        //     player.z = 3232 + Math.random() * 32 - 16;
        //     this.addPlayer(player, new ClientSocket(null, '127.0.0.1', ClientSocket.TCP, 1));
        // }

        console.log('World ready!');

        if (startCycle) {
            await this.cycle();
        }
    }

    async cycle(continueCycle = true) {
        const start = Date.now();

        // world processing
        // - world queue
        // - npc spawn scripts
        // - npc hunt
        for (let i = 0; i < this.queue.length; i++) {
            const entry = this.queue[i];

            entry.delay--;
            if (entry.delay > 0) {
                continue;
            }

            const script = entry.script;
            try {
                const state = ScriptRunner.execute(script);

                // remove from queue no matter what, re-adds if necessary
                this.queue.splice(i, 1);
                i--;

                if (state === ScriptState.SUSPENDED) {
                    // suspend to player (probably not needed)
                    script.activePlayer.activeScript = script;
                } else if (state === ScriptState.NPC_SUSPENDED) {
                    // suspend to npc (probably not needed)
                    script.activeNpc.activeScript = script;
                } else if (state === ScriptState.WORLD_SUSPENDED) {
                    // suspend to world again
                    this.enqueueScript(script);
                }
            } catch (err) {
                console.error(err);
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

        // client input
        // - decode packets
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

            player.decodeIn();
        }

        // npc processing (if npc is not busy)
        // - resume suspended script
        // - stat regen
        // - timer
        // - queue
        // - movement
        // - modes
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

                if (player.activeScript && player.canAccess() && player.activeScript.execution === ScriptState.SUSPENDED) {
                    player.executeScript(player.activeScript, true);
                }

                player.queue = player.queue.filter(s => s);
                if (player.queue.find(s => s.type === 'strong')) {
                    // the presence of a strong script closes modals before anything runs regardless of the order
                    player.closeModal();
                }

                player.processQueues();
                player.processTimers('normal');
                player.processTimers('soft');
                player.processEngineQueue();
                player.processInteraction();

                if ((player.mask & Player.EXACT_MOVE) == 0) {
                    player.validateDistanceWalked();
                }

                if (this.shutdownTick < this.currentTick) {
                    // request logout on socket idle after 15 seconds (this may be 16 *ticks* in osrs!)
                    if (this.currentTick - player.lastResponse >= 25) {
                        player.logoutRequested = true;
                    }
                }

                if (player.logoutRequested) {
                    player.closeModal();
                }
            } catch (err) {
                // todo: remove player safely
                console.error(err);
            }
        }

        // player logout
        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            if (!player) {
                continue;
            }

            if (this.shutdownTick < this.currentTick) {
                if (Environment.LOCAL_DEV && this.currentTick - player.lastResponse >= 100) {
                    // remove after 60 seconds
                    player.queue = [];
                    player.weakQueue = [];
                    player.engineQueue = [];
                    player.clearInteraction();
                    player.closeModal();
                    player.clearWalkingQueue();
                }
            }

            if (!player.logoutRequested) {
                continue;
            }

            if (player.queue.length === 0) {
                const script = ScriptProvider.getByTriggerSpecific(ServerTriggerType.LOGOUT, -1, -1);
                if (!script) {
                    console.error('LOGOUT TRIGGER IS BROKEN!');
                    // todo: remove player safely still?
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

        // player login, good spot for it (before packets so they immediately load but after processing so nothing hits them)
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
            player.uid = ((Number(player.username37 & 0x1FFFFFn) << 11) | player.pid) >>> 0;

            this.getZone(player.x, player.z, player.level).addPlayer(player);

            if (!Environment.CLIRUNNER) {
                // todo: check response from login script?
                player.onLogin();
            }

            this.newPlayers.splice(i--, 1);

            if (player.client) {
                player.client.state = 1;
                player.client.send(Uint8Array.from([2]));
            }
        }

        // loc/obj despawn/respawn
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

        // client output
        // - map update
        // - player info
        // - npc info
        // - zone updates
        // - inv changes
        // - stat changes
        // - flush packets
        for (let i = 0; i < this.players.length; i++) {
            const player = this.players[i];
            if (!player) {
                continue;
            }

            if (!player.client) {
                continue;
            }

            player.updateMap();
            player.updatePlayers();
            player.updateNpcs();
            player.updateZones();
            player.updateInvs();
            player.updateStats();

            if (this.shutdownTick > -1) {
                // todo come back to this and only broadcast once to current/new players
                player.updateRebootTimer(this.shutdownTick - this.currentTick);
            }

            player.encodeOut();
        }

        // reset entity masks
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
        }

        const end = Date.now();
        // console.log(`tick ${this.currentTick} took ${end - start}ms: ${this.getTotalPlayers()} players`);

        this.currentTick++;

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

        if (continueCycle) {
            const nextTick = this.tickRate - (end - start);
            setTimeout(this.cycle.bind(this), nextTick);
        }
    }

    enqueueScript(script: ScriptState, delay: number = 0) {
        this.queue.push({ script, delay: delay + 1 });
    }

    getInventory(inv: number) {
        if (inv === -1) {
            return null;
        }

        let container = this.invs.find(x => x.type == inv);
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
        return this.gameMap.zoneManager.zones[zoneIndex];
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

            zone.updates = updates.filter(event => {
                // filter transient updates
                if ((event.type === ServerProt.LOC_MERGE || event.type === ServerProt.LOC_ANIM || event.type === ServerProt.MAP_ANIM || event.type === ServerProt.MAP_PROJANIM) && event.tick < this.currentTick) {
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
        return this.gameMap.zoneManager.zones[zoneIndex].updates;
    }

    getReceiverUpdates(zoneIndex: number, receiverId: number) {
        const updates = this.getUpdates(zoneIndex);
        return updates.filter(event => {
            if (event.type !== ServerProt.OBJ_ADD && event.type !== ServerProt.OBJ_DEL && event.type !== ServerProt.OBJ_COUNT && event.type !== ServerProt.OBJ_REVEAL) {
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
        zone.addNpc(npc);

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
        zone.removeNpc(npc);

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
        const endTick = this.currentTick;
        let future = this.futureUpdates.get(endTick);
        if (!future) {
            future = [];
        }

        if (!future.includes(zone.index)) {
            future.push(zone.index);
        }

        this.futureUpdates.set(endTick, future);
    }

    // ----

    async readIn(socket: ClientSocket, stream: Packet) {
        while (stream.available > 0) {
            const start = stream.pos;
            let opcode = stream.g1();

            if (socket.decryptor) {
                opcode = (opcode - socket.decryptor.nextInt()) & 0xFF;
                stream.data[start] = opcode;
            }

            let length = ClientProtLengths[opcode];
            if (typeof length === 'undefined') {
                socket.state = -1;
                socket.close();
                return;
            }

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

        this.getZone(player.x, player.z, player.level).removePlayer(player);

        const index = this.playerIds[player.pid];
        this.players[index] = null;
        this.playerIds[player.pid] = -1;

        const sav = player.save();
        player.logout();

        if (player.client) {
            player.client.close();
        }

        if (Environment.LOGIN_KEY) {
            await LoginClient.save(player.username37, sav.data);
        }
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
        const pid = uid & 0x7FF;
        const name37 = (uid >> 11) & 0x1FFFFF;

        const slot = this.playerIds[pid];
        if (slot === -1) {
            return null;
        }
        
        const player = this.players[slot];
        if (!player) {
            return null;
        }

        if (Number(player.username37 & 0x1FFFFFn) !== name37) {
            return null;
        }

        return player;
    }

    getPlayerByUsername(username: string) {
        const username37 = toBase37(username);
        return this.players.find(p => p && p.username37 === username37);
    }

    getTotalPlayers() {
        return this.players.filter(p => p).length;
    }

    getNpc(nid: number) {
        return this.npcs[nid];
    }

    getNpcByUid(uid: number) {
        const slot = uid & 0xFFFF;
        const type = (uid >> 16) & 0xFFFF;

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
