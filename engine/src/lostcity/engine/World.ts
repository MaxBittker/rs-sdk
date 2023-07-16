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
import CollisionFlagMap from '#rsmod/collision/CollisionFlagMap.js';
import CollisionFlag from '#rsmod/flag/CollisionFlag.js';
import fs from 'fs';
import MesanimType from '#lostcity/cache/MesanimType.js';
import DbTableType from '#lostcity/cache/DbTableType.js';
import DbRowType from '#lostcity/cache/DbRowType.js';
import { Inventory } from './Inventory.js';
import ScriptState from './script/ScriptState.js';

class World {
    members = typeof process.env.MEMBERS_WORLD !== 'undefined' ? true : false;
    currentTick = 0;
    endTick = -1;

    players: (Player | null)[] = new Array<Player>(2048);
    npcs: (Npc | null)[] = new Array<Npc>(8192);
    // zones = [];
    gameMap = new CollisionFlagMap();
    invs: Inventory[] = []; // shared inventories (shops)

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

    start(skipMaps = false) {
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
            let inv = InvType.get(i);

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
            // console.time('Loading maps');
            let maps = fs.readdirSync('data/pack/server/maps').filter(x => x[0] === 'm');
            for (let i = 0; i < maps.length; i++) {
                let [mapsquareX, mapsquareZ] = maps[i].substring(1).split('_').map(x => parseInt(x));

                let landMap = Packet.load(`data/pack/server/maps/m${mapsquareX}_${mapsquareZ}`);
                for (let level = 0; level < 4; level++) {
                    for (let localX = 0; localX < 64; localX++) {
                        for (let localZ = 0; localZ < 64; localZ++) {
                            this.gameMap.set(mapsquareX * 64 + localX, mapsquareZ * 64 + localZ, level, 0);

                            while (true) {
                                let code = landMap.g1();
                                if (code === 0) {
                                    // perlin height
                                    break;
                                } else if (code === 1) {
                                    let height = landMap.g1();
                                    break;
                                }

                                if (code <= 49) {
                                    let overlay = landMap.g1();
                                } else if (code <= 81) {
                                    // flags = code - 49
                                } else {
                                    // underlay
                                }
                            }
                        }
                    }
                }

                let locMap = Packet.load(`data/pack/server/maps/l${mapsquareX}_${mapsquareZ}`);
                let locId = -1;
                while (locMap.available > 0) {
                    let deltaId = locMap.gsmart();
                    if (deltaId === 0) {
                        break;
                    }

                    locId += deltaId;

                    let locData = 0;
                    while (locMap.available > 0) {
                        let deltaData = locMap.gsmart();
                        if (deltaData === 0) {
                            break;
                        }

                        locData += deltaData - 1;

                        let locLevel = (locData >> 12) & 0x3;
                        let locX = (locData >> 6) & 0x3F;
                        let locZ = locData & 0x3F;

                        let locInfo = locMap.g1();
                        let locShape = locInfo >> 2;
                        let locRotation = locInfo & 0x3;

                        let loc = LocType.get(locId);
                        if (!loc) {
                            // means we're loading newer data, expect a client crash here!
                            // console.log(`Missing loc: ${locId}`);
                            continue;
                        }

                        let flags = CollisionFlag.OBJECT;
                        if (loc.blockrange) {
                            flags += CollisionFlag.OBJECT_PROJECTILE_BLOCKER;
                        }

                        let sizeX = loc.width;
                        let sizeZ = loc.length;
                        if (locRotation == 1 || locRotation == 3) {
                            let tmp = sizeX;
                            sizeX = sizeZ;
                            sizeZ = tmp;
                        }

                        for (let tx = locX; tx < locX + sizeX; tx++) {
                            for (let tz = locZ; tz < locZ + sizeZ; tz++) {
                                this.gameMap.set(tx, tz, locLevel, flags);
                            }
                        }
                    }
                }

                let npcMap = Packet.load(`data/pack/server/maps/n${mapsquareX}_${mapsquareZ}`);
                while (npcMap.available > 0) {
                    let pos = npcMap.g2();
                    let level = (pos >> 12) & 0x3;
                    let localX = (pos >> 6) & 0x3F;
                    let localZ = (pos & 0x3F);

                    let count = npcMap.g1();
                    for (let j = 0; j < count; j++) {
                        let id = npcMap.g2();

                        let npc = new Npc();
                        npc.nid = this.getNextNid();
                        npc.type = id;
                        npc.startX = (mapsquareX << 6) + localX;
                        npc.startZ = (mapsquareZ << 6) + localZ;
                        npc.x = npc.startX;
                        npc.z = npc.startZ;
                        npc.level = level;

                        this.npcs[npc.nid] = npc;
                    }
                }

                let objMap = Packet.load(`data/pack/server/maps/o${mapsquareX}_${mapsquareZ}`);
                while (objMap.available > 0) {
                    let pos = objMap.g2();
                    let level = (pos >> 12) & 0x3;
                    let localX = (pos >> 6) & 0x3F;
                    let localZ = (pos & 0x3F);

                    let count = objMap.g1();
                    for (let j = 0; j < count; j++) {
                        let id = objMap.g1();
                    }
                }
            }
            // console.timeEnd('Loading maps');
        }

        // console.time('Loading script.dat');
        ScriptProvider.load('data/pack/server');
        // console.timeEnd('Loading script.dat');

        this.cycle();
    }

    cycle() {
        let start = Date.now();

        // world processing
        // - world queue
        // - NPC spawn scripts
        // - NPC aggression

        // client input
        for (let i = 1; i < this.players.length; i++) {
            let player = this.players[i];

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
            let npc = this.npcs[i];

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

                // - queue
                npc.processQueue();

                // - movement

                // - player/npc ops
            } catch (err) {
                console.error(err);
                // TODO: remove NPC
            }
        }

        // player scripts
        for (let i = 1; i < this.players.length; i++) {
            let player = this.players[i];

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
                player.processQueue();

                // - weak queue
                player.processWeakQueue();

                // - timers

                // - engine queue
                player.onMapEnter();

                // - loc/obj ops

                // - movement

                // - player/npc ops
                player.processInteractions();

                // - close interface if attempting to logout
            } catch (err) {
                console.error(err);
                player.logout();
                this.removePlayer(player);
            }
        }

        // player logout

        // loc/obj despawn/respawn

        // client output
        for (let i = 0; i < this.invs.length; i++) {
            let inv = this.invs[i];
            if (!inv.listeners.length || !inv.update) {
                continue;
            }

            for (let j = 0; j < inv.listeners.length; j++) {
                let listener = inv.listeners[j];
                if (!listener) {
                    continue;
                }

                this.getPlayer(listener.pid)?.updateInvFull(listener.com, inv);
            }

            inv.update = false;
        }

        for (let i = 1; i < this.players.length; i++) {
            let player = this.players[i];

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
            let player = this.players[i];

            if (!player) {
                continue;
            }

            player.resetMasks();
        }

        for (let i = 1; i < this.npcs.length; i++) {
            let npc = this.npcs[i];

            if (!npc) {
                continue;
            }

            npc.resetMasks();
        }

        let end = Date.now();

        this.currentTick++;
        const nextTick = 600 - (end - start);
        setTimeout(this.cycle.bind(this), nextTick);
    }

    // ----

    readIn(socket: ClientSocket, stream: Packet) {
        while (stream.available > 0) {
            let start = stream.pos;
            let opcode = stream.g1();

            if (socket.decryptor) {
                opcode = (opcode - socket.decryptor.nextInt()) & 0xFF;
                stream.data[start] = opcode;
            }

            let length = ClientProtLengths[opcode];
            if (typeof length === 'undefined') {
                socket.state = -1;
                socket.kill();
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
        let pid = this.getNextPid();
        if (pid === -1) {
            return false;
        }

        this.players[pid] = player;
        player.pid = pid;

        if (!process.env.CLIRUNNER) {
            player.onLogin();
        }
    }

    getPlayerBySocket(socket: ClientSocket) {
        return this.players.find(p => p && p.client === socket);
    }

    removePlayer(player: Player) {
        player.save();
        this.players[player.pid] = null;
    }

    removePlayerBySocket(socket: ClientSocket) {
        let player = this.getPlayerBySocket(socket);
        if (player) {
            this.removePlayer(player);
        }
    }

    getPlayer(pid: number) {
        return this.players[pid];
    }

    getPlayerByUsername(username: string) {
        let username37 = toBase37(username);
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
