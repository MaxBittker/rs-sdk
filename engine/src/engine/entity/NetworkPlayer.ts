import 'dotenv/config';
import fs from 'fs';

import ServerProt from '#/network/rs225/server/prot/ServerProt.js';

import World from '#/engine/World.js';

import Player from '#/engine/entity/Player.js';
import ClientSocket from '#/server/ClientSocket.js';

import { CoordGrid } from '#/engine/CoordGrid.js';
import ZoneMap from '#/engine/zone/ZoneMap.js';
import Zone from '#/engine/zone/Zone.js';
import InvType from '#/cache/config/InvType.js';
import IfClose from '#/network/server/model/IfClose.js';
import IfOpenMainSide from '#/network/server/model/IfOpenMainSide.js';
import IfOpenMain from '#/network/server/model/IfOpenMain.js';
import IfOpenChat from '#/network/server/model/IfOpenChat.js';
import IfOpenSide from '#/network/server/model/IfOpenSide.js';
import RebuildNormal from '#/network/server/model/RebuildNormal.js';
import UpdateStat from '#/network/server/model/UpdateStat.js';
import UpdateRunEnergy from '#/network/server/model/UpdateRunEnergy.js';
import UpdateInvFull from '#/network/server/model/UpdateInvFull.js';
import UpdateRunWeight from '#/network/server/model/UpdateRunWeight.js';
import CamMoveTo from '#/network/server/model/CamMoveTo.js';
import CamLookAt from '#/network/server/model/CamLookAt.js';
import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import ServerProtRepository from '#/network/rs225/server/prot/ServerProtRepository.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import Logout from '#/network/server/model/Logout.js';
import PlayerInfo from '#/network/server/model/PlayerInfo.js';
import NpcInfo from '#/network/server/model/NpcInfo.js';
import WorldStat from '#/engine/WorldStat.js';
import SetMultiway from '#/network/server/model/SetMultiway.js';
import { printError } from '#/util/Logger.js';
import NpcRenderer from '#/engine/renderer/NpcRenderer.js';
import PlayerRenderer from '#/engine/renderer/PlayerRenderer.js';
import NullClientSocket from '#/server/NullClientSocket.js';
import Packet from '#/io/Packet.js';
import ClientProt from '#/network/rs225/client/prot/ClientProt.js';
import ClientProtRepository from '#/network/rs225/client/prot/ClientProtRepository.js';
import ClientProtCategory from '#/network/client/prot/ClientProtCategory.js';

export class NetworkPlayer extends Player {
    client: ClientSocket;
    userLimit = 0; // user packet limit
    clientLimit = 0; // client packet limit

    userPath: number[] = [];
    opcalled: boolean = false;
    opucalled: boolean = false;

    constructor(username: string, username37: bigint, client: ClientSocket) {
        super(username, username37);

        this.client = client;
        this.client.player = this;
    }

    decodeIn() {
        this.userPath = [];
        this.opcalled = false;
        this.opucalled = false;

        if (!isClientConnected(this)) {
            return false;
        }

        this.userLimit = 0;
        this.clientLimit = 0;

        const bytesStart = this.client.in.pos;
        while (this.userLimit < 5 && this.clientLimit < 50 && this.read()) {
            // empty
        }
        const bytesRead = bytesStart - this.client.in.pos;

        if (bytesRead > 0) {
            this.lastResponse = World.currentTick;
            World.cycleStats[WorldStat.BANDWIDTH_IN] += bytesRead;
        }

        return true;
    }

    static inBuf = Packet.alloc(1);

    read(): boolean {
        if (this.client.available < 1) {
            return false;
        }

        if (this.client.opcode === -1) {
            NetworkPlayer.inBuf.pos = 0;
            this.client.read(NetworkPlayer.inBuf.data, 0, 1);

            if (this.client.decryptor) {
                this.client.opcode = (NetworkPlayer.inBuf.g1() - this.client.decryptor.nextInt()) & 0xFF;
            } else {
                this.client.opcode = NetworkPlayer.inBuf.g1();
            }

            const packetType = ClientProt.byId[this.client.opcode];
            if (!packetType) {
                this.client.opcode = -1;
                return false;
            }

            this.client.waiting = packetType.length;
        }

        if (this.client.waiting === -1) {
            NetworkPlayer.inBuf.pos = 0;
            this.client.read(NetworkPlayer.inBuf.data, 0, 1);

            this.client.waiting = NetworkPlayer.inBuf.g1();
        } else if (this.client.waiting === -2) {
            NetworkPlayer.inBuf.pos = 0;
            this.client.read(NetworkPlayer.inBuf.data, 0, 2);

            this.client.waiting = NetworkPlayer.inBuf.g2();
        }

        if (this.client.available < this.client.waiting) {
            return false;
        }

        NetworkPlayer.inBuf.pos = 0;
        this.client.read(NetworkPlayer.inBuf.data, 0, this.client.waiting);

        const packetType = ClientProt.byId[this.client.opcode];
        const decoder = ClientProtRepository.getDecoder(packetType);

        if (decoder) {
            const message = decoder.decode(NetworkPlayer.inBuf, this.client.waiting);

            // todo: move out of model
            if (message.category === ClientProtCategory.USER_EVENT) {
                this.userLimit++;
            } else if (message.category === ClientProtCategory.CLIENT_EVENT) {
                this.clientLimit++;
            }

            const handler = ClientProtRepository.getHandler(packetType)!;
            handler.handle(message, this);
        }

        this.client.opcode = -1;
        return true;
    }

    encodeOut() {
        if (!isClientConnected(this)) {
            return;
        }

        if (this.modalMain !== this.lastModalMain || this.modalChat !== this.lastModalChat || this.modalSide !== this.lastModalSide || this.refreshModalClose) {
            if (this.refreshModalClose) {
                this.write(new IfClose());
            }
            this.refreshModalClose = false;

            this.lastModalMain = this.modalMain;
            this.lastModalChat = this.modalChat;
            this.lastModalSide = this.modalSide;
        }

        if (this.refreshModal) {
            if ((this.modalState & 1) !== 0 && (this.modalState & 4) !== 0) {
                this.write(new IfOpenMainSide(this.modalMain, this.modalSide));
            } else if ((this.modalState & 1) !== 0) {
                this.write(new IfOpenMain(this.modalMain));
            } else if ((this.modalState & 2) !== 0) {
                this.write(new IfOpenChat(this.modalChat));
            } else if ((this.modalState & 4) !== 0) {
                this.write(new IfOpenSide(this.modalSide));
            }

            this.refreshModal = false;
        }

        for (let message: OutgoingMessage | null = this.buffer.head(); message; message = this.buffer.next()) {
            this.writeInner(message);
            message.unlink2();
        }
    }

    writeInner(message: OutgoingMessage): void {
        const client = this.client;
        if (!client) {
            return;
        }

        const encoder: MessageEncoder<OutgoingMessage> | undefined = ServerProtRepository.getEncoder(message);
        if (!encoder) {
            printError(`No encoder for message ${message.constructor.name}`);
            return;
        }

        const prot: ServerProt = encoder.prot;
        const buf = client.out;
        // const test = (1 + (prot.length === -1 ? 1 : prot.length === -2 ? 2 : 0)) + encoder.test(message);
        // if (buf.pos + test >= buf.length) {
        //     client.flush();
        // }

        buf.pos = 0;

        if (client.encryptor) {
            buf.p1(prot.id + client.encryptor.nextInt());
        } else {
            buf.p1(prot.id);
        }

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

        this.client.send(buf.data.subarray(0, buf.pos));
        World.cycleStats[WorldStat.BANDWIDTH_OUT] += buf.pos;
    }

    override logout() {
        this.writeInner(new Logout());
    }

    override terminate() {
        this.client.terminate();
    }

    override addSessionLog(type: number, message: string, ...args: string[]): void {
        World.addSessionLog(this.username, isClientConnected(this) ? this.client.uuid : 'disconnected', CoordGrid.packCoord(this.level, this.x, this.z), type, message, ...args);
    }

    updateMap() {
        const loadedZones: Set<number> = this.buildArea.loadedZones;
        const activeZones: Set<number> = this.buildArea.activeZones;

        const reloadLeftX = (CoordGrid.zone(this.originX) - 4) << 3;
        const reloadRightX = (CoordGrid.zone(this.originX) + 5) << 3;
        const reloadTopZ = (CoordGrid.zone(this.originZ) + 5) << 3;
        const reloadBottomZ = (CoordGrid.zone(this.originZ) - 4) << 3;

        // if the build area should be regenerated, do so now
        if (this.x < reloadLeftX || this.z < reloadBottomZ || this.x > reloadRightX - 1 || this.z > reloadTopZ - 1) {
            this.write(new RebuildNormal(CoordGrid.zone(this.x), CoordGrid.zone(this.z)));

            this.originX = this.x;
            this.originZ = this.z;
            loadedZones.clear();
        }

        for (let info = this.cameraPackets.head(); info !== null; info = this.cameraPackets.next()) {
            const localX = info.camX - CoordGrid.zoneOrigin(this.originX);
            const localZ = info.camZ - CoordGrid.zoneOrigin(this.originZ);
            if (info.type === ServerProt.CAM_MOVETO) {
                this.write(new CamMoveTo(localX, localZ, info.height, info.rotationSpeed, info.rotationMultiplier));
            } else if (info.type === ServerProt.CAM_LOOKAT) {
                this.write(new CamLookAt(localX, localZ, info.height, info.rotationSpeed, info.rotationMultiplier));
            }
            info.unlink();
        }

        // update any newly tracked zones
        activeZones.clear();

        const centerX = CoordGrid.zone(this.x);
        const centerZ = CoordGrid.zone(this.z);

        const leftX = CoordGrid.zone(this.originX) - 6;
        const rightX = CoordGrid.zone(this.originX) + 6;
        const topZ = CoordGrid.zone(this.originZ) + 6;
        const bottomZ = CoordGrid.zone(this.originZ) - 6;

        for (let x = centerX - 3; x <= centerX + 3; x++) {
            for (let z = centerZ - 3; z <= centerZ + 3; z++) {
                // check if the zone is within the build area
                if (x < leftX || x > rightX || z > topZ || z < bottomZ) {
                    continue;
                }

                activeZones.add(ZoneMap.zoneIndex(x << 3, z << 3, this.level));
            }
        }

        const mapZone = CoordGrid.packCoord(0, this.x >> 6 << 6, this.z >> 6 << 6);
        if (this.lastMapZone !== mapZone) {
            if (this.lastMapZone !== -1) {
                const { x, z } = CoordGrid.unpackCoord(this.lastMapZone);
                this.triggerMapzoneExit(x, z);
            }

            this.triggerMapzone(this.x >> 6 << 6, this.z >> 6 << 6);
            this.lastMapZone = mapZone;
        }

        const zone = CoordGrid.packCoord(this.level, this.x >> 3 << 3, this.z >> 3 << 3);
        if (this.lastZone !== zone) {
            const lastWasMulti = World.gameMap.isMulti(this.lastZone);
            const nowIsMulti = World.gameMap.isMulti(zone);
            if (lastWasMulti != nowIsMulti) {
                this.write(new SetMultiway(nowIsMulti));
            }

            if (this.lastZone !== -1) {
                const { level, x, z } = CoordGrid.unpackCoord(this.lastZone);
                this.triggerZoneExit(level, x, z);
            }

            this.triggerZone(this.level, this.x >> 3 << 3, this.z >> 3 << 3);
            this.lastZone = zone;
        }
    }

    updatePlayers(renderer: PlayerRenderer) {
        this.write(new PlayerInfo(
            World.currentTick,
            renderer,
            this,
            Math.abs(this.lastTickX - this.x),
            Math.abs(this.lastTickZ - this.z),
            this.lastLevel !== this.level
        ));
    }

    updateNpcs(renderer: NpcRenderer) {
        this.write(new NpcInfo(
            World.currentTick,
            renderer,
            this,
            Math.abs(this.lastTickX - this.x),
            Math.abs(this.lastTickZ - this.z),
            this.lastLevel !== this.level)
        );
    }

    updateZones() {
        const loadedZones: Set<number> = this.buildArea.loadedZones;
        const activeZones: Set<number> = this.buildArea.activeZones;
        // unload any zones that are no longer active
        for (const zoneIndex of loadedZones) {
            if (!activeZones.has(zoneIndex)) {
                loadedZones.delete(zoneIndex);
            }
        }

        // update active zones
        for (const zoneIndex of activeZones) {
            const zone: Zone = World.gameMap.getZoneIndex(zoneIndex);
            if (!loadedZones.has(zone.index)) {
                zone.writeFullFollows(this);
            }
            zone.writePartialEncloses(this);
            zone.writePartialFollows(this);
            loadedZones.add(zone.index);
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
        let firstSeen = false;

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
                    if (listener.firstSeen) {
                        firstSeen = true;
                    }
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

        if (runWeightChanged || firstSeen) {
            this.write(new UpdateRunWeight(Math.ceil(this.runweight / 1000)));
        }
    }
}

export function isClientConnected(player: Player): player is NetworkPlayer {
    return player instanceof NetworkPlayer && !(player.client instanceof NullClientSocket);
}

export function isBufferFull(player: Player): boolean {
    if (!isClientConnected(player)) {
        return false;
    }

    let total = 0;

    for (let message: OutgoingMessage | null = player.buffer.head(); message; message = player.buffer.next()) {
        const encoder: MessageEncoder<OutgoingMessage> | undefined = ServerProtRepository.getEncoder(message);
        if (!encoder) {
            return true;
        }

        const prot: ServerProt = encoder.prot;
        total += (1 + (prot.length === -1 ? 1 : prot.length === -2 ? 2 : 0)) + encoder.test(message);
    }

    return total >= 5000;
}
