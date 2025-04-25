import 'dotenv/config';

import * as rsbuf from '@2004scape/rsbuf';

import InvType from '#/cache/config/InvType.js';
import { CoordGrid } from '#/engine/CoordGrid.js';
import { ModalState } from '#/engine/entity/ModalState.js';
import Player from '#/engine/entity/Player.js';
import { WealthEventParams } from '#/engine/entity/tracking/WealthEvent.js';
import World from '#/engine/World.js';
import { WorldStat } from '#/engine/WorldStat.js';
import Zone from '#/engine/zone/Zone.js';
import Packet from '#/io/Packet.js';
import { ClientProt, ClientProtRepository } from '#/network/client/prot/ClientProt.js';
import ClientProtCategory from '#/network/client/prot/ClientProtCategory.js';
import MessageEncoder from '#/network/server/codec/MessageEncoder.js';
import CamLookAt from '#/network/server/model/game/CamLookAt.js';
import CamMoveTo from '#/network/server/model/game/CamMoveTo.js';
import IfClose from '#/network/server/model/game/IfClose.js';
import IfOpenChat from '#/network/server/model/game/IfOpenChat.js';
import IfOpenMain from '#/network/server/model/game/IfOpenMain.js';
import IfOpenMainSide from '#/network/server/model/game/IfOpenMainSide.js';
import IfOpenSide from '#/network/server/model/game/IfOpenSide.js';
import Logout from '#/network/server/model/game/Logout.js';
import NpcInfo from '#/network/server/model/game/NpcInfo.js';
import PlayerInfo from '#/network/server/model/game/PlayerInfo.js';
import SetMultiway from '#/network/server/model/game/SetMultiway.js';
import UpdateInvFull from '#/network/server/model/game/UpdateInvFull.js';
import UpdateRunEnergy from '#/network/server/model/game/UpdateRunEnergy.js';
import UpdateRunWeight from '#/network/server/model/game/UpdateRunWeight.js';
import UpdateStat from '#/network/server/model/game/UpdateStat.js';
import OutgoingMessage from '#/network/server/OutgoingMessage.js';
import { ServerProtRepository } from '#/network/server/prot/ServerProt.js';
import ClientSocket from '#/server/ClientSocket.js';
import { LoggerEventType } from '#/server/logger/LoggerEventType.js';
import NullClientSocket from '#/server/NullClientSocket.js';
import { printError } from '#/util/Logger.js';

export class NetworkPlayer extends Player {
    client: ClientSocket;
    userLimit = 0; // user packet limit
    clientLimit = 0; // client packet limit
    restrictedLimit = 0;

    userPath: number[] = [];
    opcalled: boolean = false;

    constructor(username: string, username37: bigint, hash64: bigint, client: ClientSocket) {
        super(username, username37, hash64);

        this.client = client;
        this.client.player = this;
    }

    decodeIn() {
        this.userPath = [];
        this.opcalled = false;

        if (!isClientConnected(this)) {
            return false;
        }

        this.lastConnected = World.currentTick;
        this.userLimit = 0;
        this.clientLimit = 0;
        this.restrictedLimit = 0;

        const bytesStart = this.client.in.pos;
        while (this.userLimit < ClientProtCategory.USER_EVENT.limit && this.clientLimit < ClientProtCategory.CLIENT_EVENT.limit && this.restrictedLimit < ClientProtCategory.RESTRICTED_EVENT.limit && this.read()) {
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
                this.client.opcode = (NetworkPlayer.inBuf.g1() - this.client.decryptor.nextInt()) & 0xff;
            } else {
                this.client.opcode = NetworkPlayer.inBuf.g1();
            }

            const packetType = ClientProt.byId[this.client.opcode];
            if (!packetType) {
                this.client.opcode = -1;
                this.client.close();
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
            if (this.client.waiting > 1600) {
                this.client.close();
                return false;
            }
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
            const success: boolean = ClientProtRepository.getHandler(packetType)?.handle(message, this) ?? false;
            // todo: move out of model
            if (success && message.category === ClientProtCategory.USER_EVENT) {
                this.userLimit++;
            } else if (message.category === ClientProtCategory.RESTRICTED_EVENT) {
                this.restrictedLimit++;
            } else {
                this.clientLimit++;
            }
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
            if ((this.modalState & ModalState.MAIN) !== ModalState.NONE && (this.modalState & ModalState.SIDE) !== ModalState.NONE) {
                this.write(new IfOpenMainSide(this.modalMain, this.modalSide));
            } else if ((this.modalState & ModalState.MAIN) !== ModalState.NONE) {
                this.write(new IfOpenMain(this.modalMain));
            } else if ((this.modalState & ModalState.CHAT) !== ModalState.NONE) {
                this.write(new IfOpenChat(this.modalChat));
            } else if ((this.modalState & ModalState.SIDE) !== ModalState.NONE) {
                this.write(new IfOpenSide(this.modalSide));
            }

            this.refreshModal = false;
        }

        for (const message of this.buffer) {
            this.writeInner(message);
        }

        this.buffer = [];
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

        const prot = encoder.prot;
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

        this.client.send(buf.data.slice(0, buf.pos));
        World.cycleStats[WorldStat.BANDWIDTH_OUT] += buf.pos;
    }

    override logout() {
        this.writeInner(new Logout());
    }

    override terminate() {
        this.client.terminate();
    }

    override addSessionLog(event_type: LoggerEventType, message: string, ...args: string[]): void {
        World.addSessionLog(event_type, this.account_id, isClientConnected(this) ? this.client.uuid : 'disconnected', CoordGrid.packCoord(this.level, this.x, this.z), message, ...args);
    }

    override addWealthLog(change: number, message: string, ...args: string[]) {
        World.addSessionLog(LoggerEventType.WEALTH, this.account_id, isClientConnected(this) ? this.client.uuid : 'disconnected', CoordGrid.packCoord(this.level, this.x, this.z), change + ';' + message, ...args);
    }

    override addWealthEvent(event: WealthEventParams) {
        World.addWealthEvent({
            coord: CoordGrid.packCoord(this.level, this.x, this.z),
            account_id: this.account_id,
            account_session: isClientConnected(this) ? this.client.uuid : 'disconnected',
            ...event
        });
    }

    updateMap() {
        // update the camera after rebuild.
        for (let info = this.cameraPackets.head(); info !== null; info = this.cameraPackets.next()) {
            const localX = info.camX - CoordGrid.zoneOrigin(this.originX);
            const localZ = info.camZ - CoordGrid.zoneOrigin(this.originZ);
            if (info.type === 0) {
                this.write(new CamMoveTo(localX, localZ, info.height, info.rotationSpeed, info.rotationMultiplier));
            } else if (info.type === 1) {
                this.write(new CamLookAt(localX, localZ, info.height, info.rotationSpeed, info.rotationMultiplier));
            }
            info.unlink();
        }

        // map zone changed
        const mapZone = CoordGrid.packCoord(0, (this.x >> 6) << 6, (this.z >> 6) << 6);
        if (this.lastMapZone !== mapZone) {
            // map zone triggers
            if (this.lastMapZone !== -1) {
                const { x, z } = CoordGrid.unpackCoord(this.lastMapZone);
                this.triggerMapzoneExit(x, z);
            }

            this.triggerMapzone((this.x >> 6) << 6, (this.z >> 6) << 6);
            this.lastMapZone = mapZone;
        }

        // zone changed
        const zone = CoordGrid.packCoord(this.level, (this.x >> 3) << 3, (this.z >> 3) << 3);
        if (this.lastZone !== zone) {
            this.buildArea.rebuildZones();

            // zone triggers
            const lastWasMulti = World.gameMap.isMulti(this.lastZone);
            const nowIsMulti = World.gameMap.isMulti(zone);
            if (lastWasMulti != nowIsMulti) {
                this.write(new SetMultiway(nowIsMulti));
            }

            if (this.lastZone !== -1) {
                const { level, x, z } = CoordGrid.unpackCoord(this.lastZone);
                this.triggerZoneExit(level, x, z);
            }

            this.triggerZone(this.level, (this.x >> 3) << 3, (this.z >> 3) << 3);
            this.lastZone = zone;
        }
    }

    updatePlayers() {
        this.write(new PlayerInfo(rsbuf.playerInfo(this.client.out.pos, this.pid, Math.abs(this.lastTickX - this.x), Math.abs(this.lastTickZ - this.z), this.lastLevel !== this.level)));
    }

    updateNpcs() {
        this.write(new NpcInfo(rsbuf.npcInfo(this.client.out.pos, this.pid, Math.abs(this.lastTickX - this.x), Math.abs(this.lastTickZ - this.z), this.lastLevel !== this.level)));
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
            this.write(new UpdateRunWeight(Math.trunc(this.runweight / 1000)));
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

    for (const message of player.buffer) {
        const encoder: MessageEncoder<OutgoingMessage> | undefined = ServerProtRepository.getEncoder(message);
        if (!encoder) {
            return true;
        }

        const prot = encoder.prot;
        total += 1 + (prot.length === -1 ? 1 : prot.length === -2 ? 2 : 0) + encoder.test(message);
    }

    return total >= 5000;
}
