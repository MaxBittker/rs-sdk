import 'dotenv/config';
import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import ServerProt from '#lostcity/server/ServerProt.js';

import World from '#lostcity/engine/World.js';

import Player from '#lostcity/entity/Player.js';
import ClientSocket from '#lostcity/server/ClientSocket.js';

import ClientProtRepository from '#lostcity/network/225/incoming/prot/ClientProtRepository.js';
import ClientProt from '#lostcity/network/225/incoming/prot/ClientProt.js';
import { Position } from './Position.js';
import MoveSpeed from './MoveSpeed.js';
import ZoneManager from '#lostcity/engine/zone/ZoneManager.js';
import Zone from '#lostcity/engine/zone/Zone.js';
import Entity from './Entity.js';
import InvType from '#lostcity/cache/config/InvType.js';

export class NetworkPlayer extends Player {
    client: ClientSocket | null = null;
    userPath: number[] = [];
    opcalled: boolean = false;

    // build area
    loadedZones: Set<number> = new Set();
    activeZones: Set<number> = new Set();

    constructor(username: string, username37: bigint, client: ClientSocket) {
        super(username, username37);

        this.client = client;
        this.client.player = this;
    }

    decodeIn() {
        // this.lastResponse = World.currentTick; // use to keep headless players in the world
        if (this.client === null || this.client.inOffset < 1) {
            return;
        }

        let offset = 0;
        this.lastResponse = World.currentTick;

        this.userPath = [];
        this.opcalled = false;

        while (this.client.inOffset > offset) {
            const packetType = ClientProt.byId[this.client.in[offset++]];
            let length = packetType.length;
            if (length == -1) {
                length = this.client.in[offset++];
            } else if (length == -2) {
                length = (this.client.in[offset++] << 8) | this.client.in[offset++];
            }
            const data = new Packet(this.client.in.slice(offset, offset + length));
            offset += length;

            const decoder = ClientProtRepository.getDecoder(packetType);
            if (decoder) {
                const message = decoder.decode(data);
                const handler = ClientProtRepository.getHandler(packetType);

                if (handler) {
                    handler.handle(message, this);
                }
            }
        }

        this.client?.reset();
    }

    encodeOut() {
        if (!this.client) {
            return;
        }

        if (this.modalTop !== this.lastModalTop || this.modalBottom !== this.lastModalBottom || this.modalSidebar !== this.lastModalSidebar || this.refreshModalClose) {
            if (this.refreshModalClose) {
                this.writeLowPriority(ServerProt.IF_CLOSE);
            }
            this.refreshModalClose = false;

            this.lastModalTop = this.modalTop;
            this.lastModalBottom = this.modalBottom;
            this.lastModalSidebar = this.modalSidebar;
        }

        if (this.refreshModal) {
            if ((this.modalState & 1) === 1 && (this.modalState & 4) === 4) {
                this.writeLowPriority(ServerProt.IF_OPENMAINSIDEMODAL, this.modalTop, this.modalSidebar);
            } else if ((this.modalState & 1) === 1) {
                this.writeLowPriority(ServerProt.IF_OPENMAINMODAL, this.modalTop);
            } else if ((this.modalState & 2) === 2) {
                this.writeLowPriority(ServerProt.IF_OPENCHATMODAL, this.modalBottom);
            } else if ((this.modalState & 4) === 4) {
                this.writeLowPriority(ServerProt.IF_OPENSIDEMODAL, this.modalSidebar);
            }

            this.refreshModal = false;
        }

        for (let packet: Packet | null = this.highPriorityOut.head(); packet !== null; packet = this.highPriorityOut.next()) {
            if (this.client.encryptor) {
                packet.data[0] = (packet.data[0] + this.client.encryptor.nextInt()) & 0xff;
            }
            World.lastCycleBandwidth[1] += packet.pos;

            this.client.write(packet);
            packet.release();
            packet.uncache();
        }

        for (let packet: Packet | null = this.lowPriorityOut.head(); packet !== null; packet = this.lowPriorityOut.next()) {
            if (this.client.encryptor) {
                packet.data[0] = (packet.data[0] + this.client.encryptor.nextInt()) & 0xff;
            }
            World.lastCycleBandwidth[1] += packet.pos;

            this.client.write(packet);
            packet.release();
            packet.uncache();
        }

        this.client.flush();
    }

    writeImmediately(packet: Packet) {
        if (!this.client) {
            return;
        }

        if (this.client.encryptor) {
            packet.data[0] = (packet.data[0] + this.client.encryptor.nextInt()) & 0xff;
        }

        this.client.write(packet);
        this.client.flush();
    }

    override logout() {
        const out = new Packet(new Uint8Array(1));
        out.p1(ServerProt.LOGOUT.id);

        this.writeImmediately(out);
    }

    override terminate() {
        this.client?.terminate();
        this.client = null;
    }

    override playerLog(message: string, ...args: string[]): void {
        if (args.length > 0) {
            fs.appendFileSync(`data/players/${this.username}.log`, `[${new Date().toISOString().split('T')[0]} ${this.client?.remoteAddress}]: ${message} ${args.join(' ')}\n`);
        } else {
            fs.appendFileSync(`data/players/${this.username}.log`, `[${new Date().toISOString().split('T')[0]} ${this.client?.remoteAddress}]: ${message}\n`);
        }
    }

    updateMap() {
        const reloadLeftX = (Position.zone(this.loadedX) - 4) << 3;
        const reloadRightX = (Position.zone(this.loadedX) + 5) << 3;
        const reloadTopZ = (Position.zone(this.loadedZ) + 5) << 3;
        const reloadBottomZ = (Position.zone(this.loadedZ) - 4) << 3;

        // if the build area should be regenerated, do so now
        if (this.x < reloadLeftX || this.z < reloadBottomZ || this.x > reloadRightX - 1 || this.z > reloadTopZ - 1 || (this.tele && (Position.zone(this.x) !== Position.zone(this.loadedX) || Position.zone(this.z) !== Position.zone(this.loadedZ)))) {
            this.rebuildNormal(Position.zone(this.x), Position.zone(this.z));

            this.loadedX = this.x;
            this.loadedZ = this.z;
            this.loadedZones.clear();
        }

        for (let info = this.cameraPackets.head(); info !== null; info = this.cameraPackets.next()) {
            const localX = info.camX - Position.zoneOrigin(this.loadedX);
            const localZ = info.camZ - Position.zoneOrigin(this.loadedZ);
            this.writeLowPriority(info.type, localX, localZ, info.height, info.rotationSpeed, info.rotationMultiplier);
            info.unlink();
        }

        if (this.moveSpeed === MoveSpeed.INSTANT && this.jump) {
            this.loadedZones.clear();
        }

        // update any newly tracked zones
        this.activeZones.clear();

        const centerX = Position.zone(this.x);
        const centerZ = Position.zone(this.z);

        const leftX = Position.zone(this.loadedX) - 6;
        const rightX = Position.zone(this.loadedX) + 6;
        const topZ = Position.zone(this.loadedZ) + 6;
        const bottomZ = Position.zone(this.loadedZ) - 6;

        for (let x = centerX - 3; x <= centerX + 3; x++) {
            for (let z = centerZ - 3; z <= centerZ + 3; z++) {
                // check if the zone is within the build area
                if (x < leftX || x > rightX || z > topZ || z < bottomZ) {
                    continue;
                }

                this.activeZones.add(ZoneManager.zoneIndex(x << 3, z << 3, this.level));
            }
        }
    }

    updateZones() {
        for (const zoneIndex of this.activeZones) {
            const zone: Zone | undefined = World.getZoneIndex(zoneIndex);
            if (!zone) {
                continue;
            }
            if (!this.loadedZones.has(zone.index)) {
                zone.writeFullFollows(this);
            } else {
                zone.writePartialEncloses(this);
                zone.writePartialFollows(this);
            }
            this.loadedZones.add(zone.index);
        }
    }

    isWithinDistance(other: Entity) {
        const dx = Math.abs(this.x - other.x);
        const dz = Math.abs(this.z - other.z);

        return dz < 16 && dx < 16 && this.level == other.level;
    }

    getNearbyPlayers(): Set<number> {
        const absLeftX = this.loadedX - 48;
        const absRightX = this.loadedX + 48;
        const absTopZ = this.loadedZ + 48;
        const absBottomZ = this.loadedZ - 48;

        const nearby: Set<number> = new Set();

        for (const zoneIndex of this.activeZones) {
            const zone = World.getZoneIndex(zoneIndex);
            if (!zone) {
                continue;
            }

            for (const player of zone.getAllPlayersSafe()) {
                if (player.uid === this.uid || player.x <= absLeftX || player.x >= absRightX || player.z >= absTopZ || player.z <= absBottomZ) {
                    continue;
                }
                if (this.isWithinDistance(player)) {
                    nearby.add(player.uid);
                }
            }
        }

        return nearby;
    }

    updatePlayers() {
        const nearby = this.getNearbyPlayers();

        const bitBlock = Packet.alloc(1);
        const byteBlock = Packet.alloc(1);

        // update local player
        bitBlock.bits();
        bitBlock.pBit(1, this.tele || this.walkDir !== -1 || this.runDir !== -1 || this.mask > 0 ? 1 : 0);
        if (this.tele) {
            bitBlock.pBit(2, 3);
            bitBlock.pBit(2, this.level);
            bitBlock.pBit(7, Position.local(this.x));
            bitBlock.pBit(7, Position.local(this.z));
            bitBlock.pBit(1, this.jump ? 1 : 0);
            bitBlock.pBit(1, this.mask > 0 ? 1 : 0);
        } else if (this.runDir !== -1) {
            bitBlock.pBit(2, 2);
            bitBlock.pBit(3, this.walkDir);
            bitBlock.pBit(3, this.runDir);
            bitBlock.pBit(1, this.mask > 0 ? 1 : 0);
        } else if (this.walkDir !== -1) {
            bitBlock.pBit(2, 1);
            bitBlock.pBit(3, this.walkDir);
            bitBlock.pBit(1, this.mask > 0 ? 1 : 0);
        } else if (this.mask > 0) {
            bitBlock.pBit(2, 0);
        }

        if (this.mask > 0) {
            this.writeUpdate(this, byteBlock, true);
        }

        // update other players (255 max - 8 bits)
        bitBlock.pBit(8, this.otherPlayers.size);

        for (const uid of this.otherPlayers) {
            const player = World.getPlayerByUid(uid);

            const loggedOut = !player;
            const notNearby = !nearby.has(uid);

            if (loggedOut || notNearby) {
                bitBlock.pBit(1, 1);
                bitBlock.pBit(2, 3);
                this.otherPlayers.delete(uid);
                continue;
            }

            const { walkDir, runDir, tele } = player;
            if (tele) {
                // player full teleported, so needs to be removed and re-added
                bitBlock.pBit(1, 1);
                bitBlock.pBit(2, 3);
                this.otherPlayers.delete(uid);
                continue;
            }

            let hasMaskUpdate = player.mask > 0;

            const bitBlockBytes = ((bitBlock.bitPos + 7) / 8) >>> 0;
            if (bitBlockBytes + byteBlock.pos + player.calculateUpdateSize(false, false) > 5000) {
                hasMaskUpdate = false;
            }

            bitBlock.pBit(1, walkDir !== -1 || runDir !== -1 || hasMaskUpdate ? 1 : 0);
            if (runDir !== -1) {
                bitBlock.pBit(2, 2);
                bitBlock.pBit(3, walkDir);
                bitBlock.pBit(3, runDir);
                bitBlock.pBit(1, hasMaskUpdate ? 1 : 0);
            } else if (walkDir !== -1) {
                bitBlock.pBit(2, 1);
                bitBlock.pBit(3, walkDir);
                bitBlock.pBit(1, hasMaskUpdate ? 1 : 0);
            } else if (hasMaskUpdate) {
                bitBlock.pBit(2, 0);
            }

            if (hasMaskUpdate) {
                player.writeUpdate(this, byteBlock);
            }
        }

        // add new players
        for (const uid of nearby) {
            if (this.otherPlayers.size >= 255 || this.otherPlayers.has(uid)) {
                // todo: add based on distance radius that shrinks if too many players are visible?
                continue;
            }

            const player = World.getPlayerByUid(uid);
            if (player === null) {
                continue;
            }

            // todo: tele optimization (not re-sending appearance block for recently observed players (they stay in memory))
            const hasInitialUpdate = true;

            const bitBlockSize = bitBlock.bitPos + 11 + 5 + 5 + 1 + 1;
            const bitBlockBytes = ((bitBlockSize + 7) / 8) >>> 0;
            if (bitBlockBytes + byteBlock.pos + player.calculateUpdateSize(false, true) > 5000) {
                // more players get added next tick
                break;
            }

            bitBlock.pBit(11, player.pid);
            bitBlock.pBit(5, player.x - this.x);
            bitBlock.pBit(5, player.z - this.z);
            bitBlock.pBit(1, player.jump ? 1 : 0);
            bitBlock.pBit(1, hasInitialUpdate ? 1 : 0);

            if (hasInitialUpdate) {
                player.writeUpdate(this, byteBlock, false, true);
            }

            this.otherPlayers.add(player.uid);
        }

        if (byteBlock.pos > 0) {
            bitBlock.pBit(11, 2047);
        }

        bitBlock.bytes();

        // const debug = new Packet();
        // debug.pdata(bitBlock);
        // debug.pdata(byteBlock);
        // debug.save('dump/' + World.currentTick + '.' + this.username + '.player.bin');
        this.writeHighPriority(ServerProt.PLAYER_INFO, bitBlock, byteBlock);
    }

    getNearbyNpcs(): Set<number> {
        const absLeftX = this.loadedX - 48;
        const absRightX = this.loadedX + 48;
        const absTopZ = this.loadedZ + 48;
        const absBottomZ = this.loadedZ - 48;

        const nearby: Set<number> = new Set();

        for (const zoneIndex of this.activeZones) {
            const zone = World.getZoneIndex(zoneIndex);
            if (!zone) {
                continue;
            }

            for (const npc of zone.getAllNpcsSafe()) {
                if (npc.x <= absLeftX || npc.x >= absRightX || npc.z >= absTopZ || npc.z <= absBottomZ) {
                    continue;
                }
                if (this.isWithinDistance(npc)) {
                    nearby.add(npc.nid);
                }
            }
        }

        return nearby;
    }

    updateNpcs() {
        const nearby = this.getNearbyNpcs();

        const bitBlock = Packet.alloc(1);
        const byteBlock = Packet.alloc(1);

        // update existing npcs (255 max - 8 bits)
        bitBlock.bits();
        bitBlock.pBit(8, this.npcs.size);

        for (const nid of this.npcs) {
            const npc = World.getNpc(nid);

            const despawned = !npc;
            const notNearby = !nearby.has(nid);

            if (despawned || notNearby) {
                bitBlock.pBit(1, 1);
                bitBlock.pBit(2, 3);
                this.npcs.delete(nid);
                continue;
            }

            const { walkDir, runDir, tele } = npc;
            if (tele) {
                // npc full teleported, so needs to be removed and re-added
                bitBlock.pBit(1, 1);
                bitBlock.pBit(2, 3);
                this.npcs.delete(nid);
                continue;
            }

            let hasMaskUpdate = npc.mask > 0;

            const bitBlockBytes = ((bitBlock.bitPos + 7) / 8) >>> 0;
            if (bitBlockBytes + byteBlock.pos + npc.calculateUpdateSize(false) > 5000) {
                hasMaskUpdate = false;
            }

            bitBlock.pBit(1, runDir !== -1 || walkDir !== -1 || hasMaskUpdate ? 1 : 0);
            if (runDir !== -1) {
                bitBlock.pBit(2, 2);
                bitBlock.pBit(3, walkDir);
                bitBlock.pBit(3, runDir);
                bitBlock.pBit(1, hasMaskUpdate ? 1 : 0);
            } else if (walkDir !== -1) {
                bitBlock.pBit(2, 1);
                bitBlock.pBit(3, walkDir);
                bitBlock.pBit(1, hasMaskUpdate ? 1 : 0);
            } else if (hasMaskUpdate) {
                bitBlock.pBit(2, 0);
            }

            if (hasMaskUpdate) {
                npc.writeUpdate(byteBlock, false);
            }
        }

        // add new npcs
        for (const nid of nearby) {
            if (this.npcs.size >= 255 || this.npcs.has(nid)) {
                continue;
            }

            const npc = World.getNpc(nid);
            if (npc === null) {
                continue;
            }

            const hasInitialUpdate = npc.mask > 0 || npc.orientation !== -1 || npc.faceX !== -1 || npc.faceZ !== -1 || npc.faceEntity !== -1;

            const bitBlockSize = bitBlock.bitPos + 13 + 11 + 5 + 5 + 1;
            const bitBlockBytes = ((bitBlockSize + 7) / 8) >>> 0;
            if (bitBlockBytes + byteBlock.pos + npc.calculateUpdateSize(true) > 5000) {
                // more npcs get added next tick
                break;
            }

            bitBlock.pBit(13, npc.nid);
            bitBlock.pBit(11, npc.type);
            bitBlock.pBit(5, npc.x - this.x);
            bitBlock.pBit(5, npc.z - this.z);
            bitBlock.pBit(1, hasInitialUpdate ? 1 : 0);

            this.npcs.add(npc.nid);

            if (hasInitialUpdate) {
                npc.writeUpdate(byteBlock, true);
            }
        }

        if (byteBlock.pos > 0) {
            bitBlock.pBit(13, 8191);
        }

        bitBlock.bytes();

        // const debug = new Packet();
        // debug.pdata(bitBlock);
        // debug.pdata(byteBlock);
        // debug.save('dump/' + World.currentTick + '.' + this.username + '.npc.bin');
        this.writeHighPriority(ServerProt.NPC_INFO, bitBlock, byteBlock);
    }

    updateStats() {
        for (let i = 0; i < this.stats.length; i++) {
            if (this.stats[i] !== this.lastStats[i] || this.levels[i] !== this.lastLevels[i]) {
                this.writeLowPriority(ServerProt.UPDATE_STAT, i, this.stats[i], this.levels[i]);
                this.lastStats[i] = this.stats[i];
                this.lastLevels[i] = this.levels[i];
            }
        }

        if (Math.floor(this.runenergy) / 100 !== Math.floor(this.lastRunEnergy) / 100) {
            this.writeLowPriority(ServerProt.UPDATE_RUNENERGY, this.runenergy);
            this.lastRunEnergy = this.runenergy;
        }
    }

    // todo: partial updates
    updateInvs() {
        let runWeightChanged = false;

        for (let i = 0; i < this.invListeners.length; i++) {
            const listener = this.invListeners[i];
            if (!listener) {
                continue;
            }

            if (listener.source === -1) {
                // world inventory
                const inv = World.getInventory(listener.type);
                if (!inv) {
                    continue;
                }

                if (inv.update || listener.firstSeen) {
                    this.writeHighPriority(ServerProt.UPDATE_INV_FULL, listener.com, inv);
                    listener.firstSeen = false;
                }
            } else {
                // player inventory
                const player = World.getPlayerByUid(listener.source);
                if (!player) {
                    continue;
                }

                const inv = player.getInventory(listener.type);
                if (!inv) {
                    continue;
                }

                if (inv.update || listener.firstSeen) {
                    this.writeHighPriority(ServerProt.UPDATE_INV_FULL, listener.com, inv);
                    listener.firstSeen = false;

                    const invType = InvType.get(listener.type);
                    if (invType.runweight) {
                        runWeightChanged = true;
                    }
                }
            }
        }

        if (runWeightChanged) {
            const current = this.runweight;
            this.calculateRunWeight();
            runWeightChanged = current !== this.runweight;
        }

        if (runWeightChanged) {
            this.writeLowPriority(ServerProt.UPDATE_RUNWEIGHT, Math.ceil(this.runweight / 1000));
        }
    }
}

export function isNetworkPlayer(player: Player): player is NetworkPlayer {
    return (player as NetworkPlayer).client !== null && (player as NetworkPlayer).client !== undefined;
}
