import Packet from '#jagex2/io/Packet.js';
import { toBase37 } from '#jagex2/jstring/JString.js';
import CategoryType from '#lostcity/cache/CategoryType.js';
import EnumType from '#lostcity/cache/EnumType.js';
import IfType from '#lostcity/cache/IfType.js';
import InvType from '#lostcity/cache/InvType.js';
import LocType from '#lostcity/cache/LocType.js';
import NpcType from '#lostcity/cache/NpcType.js';
import ObjType from '#lostcity/cache/ObjType.js';
import ParamType from '#lostcity/cache/ParamType.js';
import SeqFrame from '#lostcity/cache/SeqFrame.js';
import SeqType from '#lostcity/cache/SeqType.js';
import StructType from '#lostcity/cache/StructType.js';
import VarPlayerType from '#lostcity/cache/VarPlayerType.js';
import FontType from '#lostcity/cache/FontType.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import Npc from '#lostcity/entity/Npc.js';
import Player from '#lostcity/entity/Player';
import { ClientProtLengths } from '#lostcity/server/ClientProt.js';
import ClientSocket from '#lostcity/server/ClientSocket';
import MesanimType from '#lostcity/cache/MesanimType.js';
import DbTableType from '#lostcity/cache/DbTableType.js';
import DbRowType from '#lostcity/cache/DbRowType.js';
import { Inventory } from './Inventory.js';
import ScriptState from './script/ScriptState.js';
import GameMap from '#lostcity/engine/GameMap.js';
import { ServerProt } from '#lostcity/server/ServerProt.js';
import Loc from '#lostcity/entity/Loc.js';
import Obj from '#lostcity/entity/Obj.js';
import PathFinder from '#rsmod/PathFinder.js';
import LinePathFinder from '#rsmod/LinePathFinder.js';
import { Position } from '#lostcity/entity/Position.js';
import CollisionManager from '#lostcity/engine/collision/CollisionManager.js';
import CollisionFlagMap from '#rsmod/collision/CollisionFlagMap.js';

class World {
    members = process.env.MEMBERS_WORLD === 'true';
    currentTick = 0;
    endTick = -1;

    players: (Player | null)[] = new Array<Player>(2048);
    npcs: (Npc | null)[] = new Array<Npc>(8192);
    gameMap = new GameMap();
    invs: Inventory[] = []; // shared inventories (shops)

    trackedZones: number[] = [];
    buffers: Map<number, Packet> = new Map();
    futureUpdates: Map<number, number[]> = new Map();

    get collisionManager(): CollisionManager {
        return this.gameMap.collisionManager;
    }

    get collisionFlags(): CollisionFlagMap {
        return this.collisionManager.flags;
    }

    get pathFinder(): PathFinder {
        return this.collisionManager.pathFinder;
    }

    get linePathFinder(): LinePathFinder {
        return this.collisionManager.linePathFinder;
    }

    start(skipMaps = false) {
        console.log('Starting world...');
        for (let i = 0; i < this.players.length; i++) {
            this.players[i] = null;
        }

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
        ObjType.load('data/pack/server');
        // console.timeEnd('Loading obj.dat');

        // console.time('Loading loc.dat');
        LocType.load('data/pack/server');
        // console.timeEnd('Loading loc.dat');

        // console.time('Loading npc.dat');
        NpcType.load('data/pack/server');
        // console.timeEnd('Loading npc.dat');

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

        if (!skipMaps) {
            this.gameMap.init();
        }

        // console.time('Loading script.dat');
        ScriptProvider.load('data/pack/server');
        // console.timeEnd('Loading script.dat');

        console.log('World ready!');
        this.cycle();
    }

    cycle() {
        const start = Date.now();

        // world processing
        // - world queue
        // - NPC spawn scripts
        // - NPC aggression

        // client input
        for (let i = 1; i < this.players.length; i++) {
            const player = this.players[i];

            if (!player || !player.client) {
                continue;
            }

            try {
                player.decodeIn();
            } catch (err) {
                console.error(err);
                player.logout();
                this.removePlayer(player);
            }
        }

        // npc scripts
        for (let i = 1; i < this.npcs.length; i++) {
            const npc = this.npcs[i];

            if (!npc) {
                continue;
            }

            try {
                if (npc.delayed()) {
                    npc.delay--;
                }

                // if not busy:
                // - resume paused process

                // - regen timer

                // - timer
                npc.processTimers();

                // - queue
                npc.processQueue();

                // - movement
                // - player/npc ops
                npc.processNpcModes();
            } catch (err) {
                console.error(err);
                // TODO: remove NPC
            }
        }

        // player scripts
        for (let i = 1; i < this.players.length; i++) {
            const player = this.players[i];

            if (!player) {
                continue;
            }

            try {
                player.playtime++;

                if (player.delayed()) {
                    player.delay--;
                }

                // - resume paused process
                if (player.activeScript && !player.delayed() && player.activeScript.execution === ScriptState.SUSPENDED) {
                    player.executeScript(player.activeScript);
                }

                // - close interface if strong process queued
                player.queue = player.queue.filter(s => s);
                if (player.queue.find(s => s.type === 'strong')) {
                    // the presence of a strong script closes modals before anything runs regardless of the order
                    player.closeModal();
                }

                // - primary queue
                // - weak queue
                player.processQueues();

                // - timers
                player.processTimers('soft');
                player.processTimers('normal');

                // - engine queue
                player.onMapEnter();

                // - loc/obj ops
                // - movement
                // - player/npc ops
                player.processInteraction();

                const distanceCheck = Position.distanceTo({ x: player.x, z: player.z }, { x: player.lastX, z: player.lastZ }) > 2;
                if (distanceCheck) {
                    player.placement = true;
                }

                // - close interface if attempting to logout
            } catch (err) {
                console.error(err);
                player.logout();
                this.removePlayer(player);
            }
        }

        // player logout

        // loc/obj despawn/respawn
        const future = this.futureUpdates.get(this.currentTick);
        if (future) {
            // despawn dynamic
            for (let i = 0; i < future.length; i++) {
                const zoneIndex = future[i];
                const zone = this.getZoneIndex(zoneIndex);

                for (let i = 0; i < zone.locs.length; i++) {
                    const loc = zone.locs[i];
                    if (!loc || loc.despawn < this.currentTick) {
                        continue;
                    }

                    this.removeLoc(loc, -1);
                }

                for (let i = 0; i < zone.objs.length; i++) {
                    const obj = zone.objs[i];
                    if (!obj || obj.despawn < this.currentTick) {
                        continue;
                    }

                    this.removeObj(obj, null);
                }
            }

            // respawn static
            for (let i = 0; i < future.length; i++) {
                const zoneIndex = future[i];
                const zone = this.getZoneIndex(zoneIndex);

                for (let i = 0; i < zone.staticLocs.length; i++) {
                    const loc = zone.staticLocs[i];
                    if (!loc || loc.respawn < this.currentTick) {
                        continue;
                    }

                    this.addLoc(loc, -1);
                }

                for (let i = 0; i < zone.staticObjs.length; i++) {
                    const obj = zone.staticObjs[i];
                    if (!obj || obj.respawn < this.currentTick) {
                        continue;
                    }

                    this.addObj(obj, null, -1);
                }
            }

            this.futureUpdates.delete(this.currentTick);
        }

        // client output
        this.computeSharedEvents();

        /// send all shared inventories to players
        for (let i = 0; i < this.invs.length; i++) {
            const inv = this.invs[i];
            if (!inv.listeners.length || !inv.update) {
                continue;
            }

            for (let j = 0; j < inv.listeners.length; j++) {
                const listener = inv.listeners[j];
                if (!listener) {
                    continue;
                }

                this.getPlayer(listener.pid)?.updateInvFull(listener.com, inv);
            }

            inv.update = false;
        }

        /// create update packets for players
        for (let i = 1; i < this.players.length; i++) {
            const player = this.players[i];

            if (!player || !player.client) {
                continue;
            }

            try {
                player.updateBuildArea();
                player.updateInvs();
                player.updatePlayers();
                player.updateNpcs();

                player.encodeOut();
            } catch (err) {
                console.error(err);
                player.logout();
                this.removePlayer(player);
            }
        }

        // cleanup
        for (let i = 1; i < this.players.length; i++) {
            const player = this.players[i];

            if (!player) {
                continue;
            }

            player.resetTransient();
        }

        for (let i = 1; i < this.npcs.length; i++) {
            const npc = this.npcs[i];

            if (!npc) {
                continue;
            }

            npc.resetTransient();
        }

        const end = Date.now();
        // console.log(`tick ${this.currentTick} took ${end - start}ms`);

        this.currentTick++;
        const nextTick = 600 - (end - start);
        setTimeout(this.cycle.bind(this), nextTick);
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
        this.buffers = new Map();

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

            let updates = zone.updates;
            if (!updates.length) {
                continue;
            }

            updates = updates.filter(event => {
                if (event.type === ServerProt.LOC_MERGE && event.tick < this.currentTick) {
                    return false;
                }

                return true;
            });

            const globalUpdates = updates.filter(event => {
                if (event.type === ServerProt.OBJ_ADD || event.type === ServerProt.OBJ_DEL) {
                    return false;
                }

                return true;
            });

            if (!globalUpdates.length) {
                continue;
            }

            const buffer = new Packet();
            for (let i = 0; i < globalUpdates.length; i++) {
                buffer.pdata(globalUpdates[i].buffer);
            }
            this.buffers.set(zoneIndex, buffer);
        }
    }

    getSharedEvents(zoneIndex: number) {
        return this.buffers.get(zoneIndex);
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

    getZoneNpcs(x: number, z: number, level: number) {
        return this.getZone(x, z, level).npcs;
    }

    addNpc(npc: Npc) {
        this.npcs[npc.nid] = npc;
        const zone = this.getZone(npc.x, npc.z, npc.level);
        zone.addNpc(npc);

        this.gameMap.collisionManager.changeEntityCollision(npc.x, npc.z, npc.level, true);
    }

    removeNpc(npc: Npc) {
        const zone = this.getZone(npc.x, npc.z, npc.level);
        zone.removeNpc(npc);

        // todo: respawn npc
        // npc.despawn = this.currentTick;
        // npc.respawn = this.currentTick + 100;
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
        this.gameMap.collisionManager.changeLocCollision(loc.type, loc.shape, loc.rotation, loc.x, loc.z, loc.level, true);

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
        this.gameMap.collisionManager.changeLocCollision(loc.type, loc.shape, loc.rotation, loc.x, loc.z, loc.level, false);

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

        zone.addObj(obj, receiver, duration);

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
        const zone = this.getZone(obj.x, obj.z, obj.level);

        zone.removeObj(obj, receiver, -1);

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

    readIn(socket: ClientSocket, stream: Packet) {
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
            if (socket.inCount[opcode] > 10) {
                continue;
            }

            socket.in.set(stream.gdata(stream.pos - start, start, false), socket.inOffset);
            socket.inOffset += stream.pos - start;
        }
    }

    addPlayer(player: Player) {
        const pid = this.getNextPid();
        if (pid === -1) {
            return false;
        }

        this.players[pid] = player;
        player.pid = pid;
        this.getZone(player.x, player.z, player.level).addPlayer(player);

        if (!process.env.CLIRUNNER) {
            player.onLogin();
        }
    }

    getPlayerBySocket(socket: ClientSocket) {
        return this.players.find(p => p && p.client === socket);
    }

    removePlayer(player: Player) {
        this.getZone(player.x, player.z, player.level).removePlayer(player);
        player.save();
        this.players[player.pid] = null;
    }

    removePlayerBySocket(socket: ClientSocket) {
        const player = this.getPlayerBySocket(socket);
        if (player) {
            this.removePlayer(player);
        }
    }

    getPlayer(pid: number) {
        return this.players[pid];
    }

    getPlayerByUsername(username: string) {
        const username37 = toBase37(username);
        return this.players.find(p => p && p.username37 === username37);
    }

    getTotalPlayers() {
        return this.players.filter(p => p !== null).length;
    }

    getNpc(nid: number) {
        return this.npcs[nid];
    }

    getNextNid() {
        return this.npcs.indexOf(null, 1);
    }

    getNextPid() {
        return this.players.indexOf(null, 1);
    }
}

export default new World();
