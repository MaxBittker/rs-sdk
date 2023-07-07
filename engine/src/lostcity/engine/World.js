import { toBase37 } from '#jagex2/jstring/JString.js';
import LocType from '#lostcity/cache/LocType.js';
import Npc from '#lostcity/entity/Npc.js';
import { ClientProtLengths } from '#lostcity/server/ClientProt.js';
import { loadDir } from '#lostcity/tools/pack/NameMap.js';
import CollisionFlagMap from '#rsmod/collision/CollisionFlagMap.js';
import CollisionFlag from '#rsmod/flag/CollisionFlag.js';

class World {
    members = typeof process.env.MEMBERS_WORLD !== 'undefined' ? true : false;
    currentTick = 0;
    endTick = -1;

    players = new Array(2048);
    npcs = new Array(8192);
    // zones = [];
    gameMap = new CollisionFlagMap();

    start() {
        for (let i = 0; i < this.players.length; i++) {
            this.players[i] = null;
        }

        for (let i = 0; i < this.npcs.length; i++) {
            this.npcs[i] = null;
        }

        console.time('Loading maps');
        loadDir('data/src/maps', 'jm2', (map, file) => {
            let [mapsquareX, mapsquareZ] = file.substring(1, file.length - 4).split('_');
            mapsquareX = parseInt(mapsquareX);
            mapsquareZ = parseInt(mapsquareZ);

            let section = null;
            for (let i = 0; i < map.length; i++) {
                let line = map[i];

                if (line.startsWith('====')) {
                    section = line.slice(4, -4).slice(1, 4);
                    continue;
                }

                if (section === 'MAP') {
                    let parts = line.split(':');
                    let [level, x, z] = parts[0].split(' ');
                    let data = parts[1].slice(1).split(' ');

                    level = parseInt(level);
                    x = parseInt(x);
                    z = parseInt(z);
                    x += mapsquareX << 6;
                    z += mapsquareZ << 6;

                    this.gameMap.set(x, z, level, 0);
                } else if (section === 'LOC') {
                    let parts = line.split(':');
                    let [level, x, z] = parts[0].split(' ');
                    let [id, shape, rotation] = parts[1].slice(1).split(' ');

                    level = parseInt(level);
                    x = parseInt(x);
                    z = parseInt(z);
                    x += mapsquareX << 6;
                    z += mapsquareZ << 6;

                    id = parseInt(id);
                    shape = parseInt(shape);
                    rotation = parseInt(rotation);

                    let loc = LocType.get(id);
                    if (!loc) {
                        // means we're loading newer data, oops!
                        // console.log(`Missing loc: ${id}`);
                        continue;
                    }

                    let flags = CollisionFlag.OBJECT;
                    if (loc.blockrange) {
                        flags += CollisionFlag.OBJECT_PROJECTILE_BLOCKER;
                    }

                    let sizeX = loc.width;
                    let sizeZ = loc.length;
                    if (rotation == 1 || rotation == 3) {
                        let tmp = sizeX;
                        sizeX = sizeZ;
                        sizeZ = tmp;
                    }

                    for (let tx = x; tx < x + sizeX; tx++) {
                        for (let tz = z; tz < z + sizeZ; tz++) {
                            this.gameMap.set(tx, tz, level, flags);
                        }
                    }
                } else if (section === 'NPC') {
                    let parts = line.split(':');
                    let [level, localX, localZ] = parts[0].split(' ');
                    let id = parts[1];

                    id = parseInt(id);
                    level = parseInt(level);
                    localX = parseInt(localX);
                    localZ = parseInt(localZ);

                    let npc = new Npc();
                    npc.nid = this.getNextNid();
                    npc.type = id;
                    npc.startX = (mapsquareX << 6) + localX;
                    npc.startZ = (mapsquareZ << 6) + localZ;
                    npc.x = npc.startX;
                    npc.z = npc.startZ;
                    npc.level = level;

                    this.npcs[npc.nid] = npc;
                } else if (section === 'OBJ') {
                    // let parts = line.split(':');
                    // let [level, x, z] = parts[0].split(' ');
                    // let [id, count] = parts[1].split(' ');
                }
            }
        });
        console.timeEnd('Loading maps');

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
            if (!this.players[i]) {
                continue;
            }

            let player = this.players[i];
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
            if (!this.npcs[i]) {
                continue;
            }

            let npc = this.npcs[i];

            try {
                if (npc.delayed()) {
                    npc.delay--;
                }

                // if not busy:
                // - resume paused process

                // - regen timer

                // - timer

                // - queue
                if (!npc.delayed()) {
                    while (npc.queue.length) {
                        let processedQueueCount = npc.processQueue();

                        if (processedQueueCount == 0) {
                            break;
                        }
                    }
                }

                // - movement

                // - player/npc ops
            } catch (err) {
                console.error(err);
                // TODO: remove NPC
            }
        }

        // player scripts
        for (let i = 1; i < this.players.length; i++) {
            if (!this.players[i]) {
                continue;
            }

            let player = this.players[i];

            try {
                player.playtime++;

                if (player.delayed()) {
                    player.delay--;
                }

                // - resume paused process

                // - close interface if strong process queued
                player.queue = player.queue.filter(s => s);
                if (player.queue.find(s => s.type === 'strong')) {
                    // the presence of a strong script closes modals before anything runs regardless of the order
                    player.closeModal();
                }

                // - primary queue
                if (!player.delayed()) {
                    if (player.queue.find(s => s.type == 'strong')) {
                        // remove weak scripts from the queue if a strong script is present
                        player.weakQueue = [];
                    }

                    while (player.queue.length) {
                        let processedQueueCount = player.processQueue();

                        if (processedQueueCount == 0) {
                            break;
                        }
                    }
                }

                // - weak queue
                if (!player.delayed()) {
                    while (player.weakQueue.length) {
                        let processedQueueCount = player.processWeakQueue();

                        if (processedQueueCount == 0) {
                            break;
                        }
                    }
                }

                // - timers

                // - engine queue

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
        for (let i = 1; i < this.players.length; i++) {
            if (!this.players[i]) {
                continue;
            }

            let player = this.players[i];

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
            if (!this.players[i]) {
                continue;
            }

            let player = this.players[i];
            player.resetMasks();
        }

        for (let i = 1; i < this.npcs.length; i++) {
            if (!this.npcs[i]) {
                continue;
            }

            let npc = this.npcs[i];
            npc.resetMasks();
        }

        let end = Date.now();

        this.currentTick++;
        const nextTick = 600 - (end - start);
        setTimeout(this.cycle.bind(this), nextTick);
    }

    // ----

    readIn(socket, stream) {
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

    addPlayer(player) {
        let pid = this.getNextPid();
        if (pid === -1) {
            return false;
        }

        this.players[pid] = player;
        player.pid = pid;
        player.onLogin();
    }

    getPlayerBySocket(socket) {
        return this.players.find(p => p && p.client === socket);
    }

    removePlayer(player) {
        player.save();
        this.players[player.pid] = null;
    }

    removePlayerBySocket(socket) {
        let player = this.getPlayerBySocket(socket);
        if (player) {
            this.removePlayer(player);
        }
    }

    getPlayer(pid) {
        return this.players[pid];
    }

    getPlayerByUsername(username) {
        let username37 = toBase37(username);
        return this.players.find(p => p && p.username37 === username37);
    }

    getTotalPlayers() {
        return this.players.filter(p => p !== null).length;
    }

    getNpc(nid) {
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
