import 'dotenv/config';
import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';

import World from '#lostcity/engine/World.js';

import Player from '#lostcity/entity/Player.js';
import ClientSocket from '#lostcity/server/ClientSocket.js';

import ClientProtRepository from '#lostcity/network/225/incoming/prot/ClientProtRepository.js';
import ClientProt from '#lostcity/network/225/incoming/prot/ClientProt.js';
import { Position } from './Position.js';
import MoveSpeed from './MoveSpeed.js';
import ZoneMap from '#lostcity/engine/zone/ZoneMap.js';
import Zone from '#lostcity/engine/zone/Zone.js';
import InvType from '#lostcity/cache/config/InvType.js';
import IfClose from '#lostcity/network/outgoing/model/IfClose.js';
import IfOpenMainSideModal from '#lostcity/network/outgoing/model/IfOpenMainSideModal.js';
import IfOpenMainModal from '#lostcity/network/outgoing/model/IfOpenMainModal.js';
import IfOpenChatModal from '#lostcity/network/outgoing/model/IfOpenChatModal.js';
import IfOpenSideModal from '#lostcity/network/outgoing/model/IfOpenSideModal.js';
import RebuildNormal from '#lostcity/network/outgoing/model/RebuildNormal.js';
import UpdateStat from '#lostcity/network/outgoing/model/UpdateStat.js';
import UpdateRunEnergy from '#lostcity/network/outgoing/model/UpdateRunEnergy.js';
import UpdateInvFull from '#lostcity/network/outgoing/model/UpdateInvFull.js';
import UpdateRunWeight from '#lostcity/network/outgoing/model/UpdateRunWeight.js';
import CamMoveTo from '#lostcity/network/outgoing/model/CamMoveTo.js';
import CamLookAt from '#lostcity/network/outgoing/model/CamLookAt.js';
import OutgoingMessage from '#lostcity/network/outgoing/OutgoingMessage.js';
import ServerProtRepository from '#lostcity/network/225/outgoing/prot/ServerProtRepository.js';
import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';

export class NetworkPlayer extends Player {
    client: ClientSocket | null = null;
    userPath: number[] = [];
    opcalled: boolean = false;

    // build area
    // loadedZones: Set<number> = new Set();
    // activeZones: Set<number> = new Set();

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
                this.write(new IfClose());
            }
            this.refreshModalClose = false;

            this.lastModalTop = this.modalTop;
            this.lastModalBottom = this.modalBottom;
            this.lastModalSidebar = this.modalSidebar;
        }

        if (this.refreshModal) {
            if ((this.modalState & 1) === 1 && (this.modalState & 4) === 4) {
                this.write(new IfOpenMainSideModal(this.modalTop, this.modalSidebar));
            } else if ((this.modalState & 1) === 1) {
                this.write(new IfOpenMainModal(this.modalTop));
            } else if ((this.modalState & 2) === 2) {
                this.write(new IfOpenChatModal(this.modalBottom));
            } else if ((this.modalState & 4) === 4) {
                this.write(new IfOpenSideModal(this.modalSidebar));
            }

            this.refreshModal = false;
        }

        for (let message: OutgoingMessage | null = this.highPriorityOut.head(); message; message = this.highPriorityOut.next()) {
            this.writeInner(message);
            message.uncache();
        }

        for (let message: OutgoingMessage | null = this.lowPriorityOut.head(); message; message = this.lowPriorityOut.next()) {
            this.writeInner(message);
            message.uncache();
        }

        this.client.flush();
    }

    writeInner(message: OutgoingMessage): void {
        if (!this.client) {
            return;
        }
        const encoder: MessageEncoder<OutgoingMessage> | undefined = ServerProtRepository.getEncoder(message);
        if (!encoder) {
            return;
        }
        const prot: ServerProt = encoder.prot;
        let buf: Packet;
        if (prot.length === -1) {
            buf = Packet.alloc(0);
        } else if (prot.length === -2) {
            buf = Packet.alloc(2); // maybe this can be a type 1.
        } else {
            buf = new Packet(new Uint8Array(1 + encoder.prot.length));
        }
        buf.p1(prot.id);
        if (prot.length === -1) {
            buf.p1(0);
        } else if (prot.length === -2) {
            buf.p2(0);
        }
        const start: number = buf.pos;
        encoder.encode(buf, message);
        if (prot.length === -1) {
            buf.psize1(buf.pos - start);
        } else if (prot.length === -2) {
            buf.psize2(buf.pos - start);
        }
        if (this.client.encryptor) {
            buf.data[0] = (buf.data[0] + this.client.encryptor.nextInt()) & 0xff;
        }
        World.lastCycleBandwidth[1] += buf.pos;
        this.client.write(buf);
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
        const reloadLeftX = (Position.zone(this.originX) - 4) << 3;
        const reloadRightX = (Position.zone(this.originX) + 5) << 3;
        const reloadTopZ = (Position.zone(this.originZ) + 5) << 3;
        const reloadBottomZ = (Position.zone(this.originZ) - 4) << 3;

        // if the build area should be regenerated, do so now
        if (this.x < reloadLeftX || this.z < reloadBottomZ || this.x > reloadRightX - 1 || this.z > reloadTopZ - 1 || (this.tele && (Position.zone(this.x) !== Position.zone(this.originX) || Position.zone(this.z) !== Position.zone(this.originZ)))) {
            this.write(new RebuildNormal(Position.zone(this.x), Position.zone(this.z)));

            this.originX = this.x;
            this.originZ = this.z;
            this.loadedZones.clear();
        }

        for (let info = this.cameraPackets.head(); info !== null; info = this.cameraPackets.next()) {
            const localX = info.camX - Position.zoneOrigin(this.originX);
            const localZ = info.camZ - Position.zoneOrigin(this.originZ);
            if (info.type === ServerProt.CAM_MOVETO) {
                this.write(new CamMoveTo(localX, localZ, info.height, info.rotationSpeed, info.rotationMultiplier));
            } else if (info.type === ServerProt.CAM_LOOKAT) {
                this.write(new CamLookAt(localX, localZ, info.height, info.rotationSpeed, info.rotationMultiplier));
            }
            info.unlink();
        }

        if (this.moveSpeed === MoveSpeed.INSTANT && this.jump) {
            this.loadedZones.clear();
        }

        // update any newly tracked zones
        this.activeZones.clear();

        const centerX = Position.zone(this.x);
        const centerZ = Position.zone(this.z);

        const leftX = Position.zone(this.originX) - 6;
        const rightX = Position.zone(this.originX) + 6;
        const topZ = Position.zone(this.originZ) + 6;
        const bottomZ = Position.zone(this.originZ) - 6;

        for (let x = centerX - 3; x <= centerX + 3; x++) {
            for (let z = centerZ - 3; z <= centerZ + 3; z++) {
                // check if the zone is within the build area
                if (x < leftX || x > rightX || z > topZ || z < bottomZ) {
                    continue;
                }

                this.activeZones.add(ZoneMap.zoneIndex(x << 3, z << 3, this.level));
            }
        }
    }

    updateZones() {
        // unload any zones that are no longer active
        for (const zoneIndex of this.loadedZones) {
            if (!this.activeZones.has(zoneIndex)) {
                this.loadedZones.delete(zoneIndex);
            }
        }

        // update active zones
        for (const zoneIndex of this.activeZones) {
            const zone: Zone = World.getZoneIndex(zoneIndex);
            if (!this.loadedZones.has(zone.index)) {
                zone.writeFullFollows(this);
            } else {
                zone.writePartialEncloses(this);
                zone.writePartialFollows(this);
            }
            this.loadedZones.add(zone.index);
        }
    }

    updateStats() {
        for (let i = 0; i < this.stats.length; i++) {
            if (this.stats[i] !== this.lastStats[i] || this.levels[i] !== this.lastLevels[i]) {
                this.write(new UpdateStat(i, this.stats[i], this.levels[i]));
                this.lastStats[i] = this.stats[i];
                this.lastLevels[i] = this.levels[i];
            }
        }

        if (Math.floor(this.runenergy) / 100 !== Math.floor(this.lastRunEnergy) / 100) {
            this.write(new UpdateRunEnergy(this.runenergy));
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
                    this.write(new UpdateInvFull(listener.com, inv));
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
                    this.write(new UpdateInvFull(listener.com, inv));
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
            this.write(new UpdateRunWeight(Math.ceil(this.runweight / 1000)));
        }
    }
}

export function isNetworkPlayer(player: Player): player is NetworkPlayer {
    return (player as NetworkPlayer).client !== null && (player as NetworkPlayer).client !== undefined;
}
