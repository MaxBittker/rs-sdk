import * as rsbuf from '#/network/rsbuf/index.js';

import InvType from '#/cache/config/InvType.js';
import { CoordGrid } from '#/engine/CoordGrid.js';
import { ModalState } from '#/engine/entity/ModalState.js';
import Player from '#/engine/entity/Player.js';
import World from '#/engine/World.js';
import { WorldStat } from '#/engine/WorldStat.js';
import Zone from '#/engine/zone/Zone.js';
import Packet from '#/io/Packet.js';
import ClientGameProtCategory from '#/network/game/client/ClientGameProtCategory.js';
import ServerGameMessageEncoder from '#/network/game/server/ServerGameMessageEncoder.js';
import CamLookAt from '#/network/game/server/model/CamLookAt.js';
import CamMoveTo from '#/network/game/server/model/CamMoveTo.js';
import IfClose from '#/network/game/server/model/IfClose.js';
import IfOpenChat from '#/network/game/server/model/IfOpenChat.js';
import IfOpenMain from '#/network/game/server/model/IfOpenMain.js';
import IfOpenMainSide from '#/network/game/server/model/IfOpenMainSide.js';
import IfOpenOverlay from '#/network/game/server/model/IfOpenOverlay.js';
import IfOpenSide from '#/network/game/server/model/IfOpenSide.js';
import Logout from '#/network/game/server/model/Logout.js';
import NpcInfo from '#/network/game/server/model/NpcInfo.js';
import PlayerInfo from '#/network/game/server/model/PlayerInfo.js';
import SetMultiway from '#/network/game/server/model/SetMultiway.js';
import UpdateInvFull from '#/network/game/server/model/UpdateInvFull.js';
import UpdateInvPartial from '#/network/game/server/model/UpdateInvPartial.js';
import UpdateRunEnergy from '#/network/game/server/model/UpdateRunEnergy.js';
import UpdateRunWeight from '#/network/game/server/model/UpdateRunWeight.js';
import UpdateStat from '#/network/game/server/model/UpdateStat.js';
import ServerGameMessage from '#/network/game/server/ServerGameMessage.js';
import ClientSocket from '#/server/ClientSocket.js';
import NullClientSocket from '#/server/NullClientSocket.js';
import { printError } from '#/util/Logger.js';
import ClientGameProt from '#/network/game/client/ClientGameProt.js';
import ClientGameProtRepository from '#/network/game/client/ClientGameProtRepository.js';
import ServerGameProtRepository from '#/network/game/server/ServerGameProtRepository.js';

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
        this.session = client.uuid;
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
        while (this.userLimit < ClientGameProtCategory.USER_EVENT.limit && this.clientLimit < ClientGameProtCategory.CLIENT_EVENT.limit && this.restrictedLimit < ClientGameProtCategory.RESTRICTED_EVENT.limit && this.read()) {
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

            const packetType = ClientGameProt.byId[this.client.opcode];
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

        const packetType = ClientGameProt.byId[this.client.opcode];
        if (packetType) {
            const decoder = ClientGameProtRepository.getDecoder(packetType);

            if (decoder) {
                const message = decoder.decode(NetworkPlayer.inBuf, this.client.waiting);
                const success: boolean = ClientGameProtRepository.getHandler(packetType)?.handle(message, this) ?? false;

                // todo: move out of model
                if (success && message.category === ClientGameProtCategory.USER_EVENT) {
                    this.userLimit++;
                } else if (message.category === ClientGameProtCategory.RESTRICTED_EVENT) {
                    this.restrictedLimit++;
                } else {
                    this.clientLimit++;
                }
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

        if (this.overlay !== this.lastOverlay) {
            this.write(new IfOpenOverlay(this.overlay));
            this.lastOverlay = this.overlay;
        }
    }

    writeInner(message: ServerGameMessage): void {
        const client = this.client;

        const encoder: ServerGameMessageEncoder<ServerGameMessage> | undefined = ServerGameProtRepository.getEncoder(message);
        if (!encoder) {
            printError(`No encoder for ${message.constructor.name}`);
            return;
        }

        const prot = encoder.prot;
        const buf = client.out;

        buf.pos = 0;

        if (client.encryptor) {
            buf.p1(prot.id + client.encryptor.nextInt());
        } else {
            buf.p1(prot.id);
        }

        if (prot.length === -1) {
            buf.pos += 1;
        } else if (prot.length === -2) {
            buf.pos += 2;
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
        console.warn(`[LOGOUT DEBUG] NetworkPlayer.logout() sending LOGOUT packet for ${this.username}`);
        this.writeInner(new Logout());
    }

    override terminate() {
        this.client.terminate();
    }

    updateMap() {
        // update the camera after rebuild.
        for (const info of this.cameraPackets.all()) {
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
        this.write(new PlayerInfo(rsbuf.playerInfo(this.client.out.pos, this.slot, Math.abs(this.lastTickX - this.x), Math.abs(this.lastTickZ - this.z), this.lastLevel !== this.level)));
    }

    updateNpcs() {
        this.write(new NpcInfo(rsbuf.npcInfo(this.client.out.pos, this.slot, Math.abs(this.lastTickX - this.x), Math.abs(this.lastTickZ - this.z), this.lastLevel !== this.level)));
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

    updateInvs() {
        let runWeightChanged = false;
        let firstSeen = false;

        for (let i = 0; i < this.invListeners.length; i++) {
            const listener = this.invListeners[i];
            if (!listener) {
                continue;
            }

            const needsFullUpdate = listener.firstSeen;

            if (listener.source === -1) {
                // world inventory
                const inv = World.getInventory(listener.type);
                if (!inv) {
                    continue;
                }

                if (needsFullUpdate) {
                    this.write(new UpdateInvFull(listener.com, inv));
                    listener.firstSeen = false;
                } else if (inv.update) {
                    this.write(new UpdateInvPartial(listener.com, inv, ...inv.getDirtySlots()));
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

                if (needsFullUpdate) {
                    this.write(new UpdateInvFull(listener.com, inv));
                    firstSeen = true; // ensure weight is sent between logins
                    listener.firstSeen = false;
                } else if (inv.update) {
                    this.write(new UpdateInvPartial(listener.com, inv, ...inv.getDirtySlots()));
                }

                if (inv.update || needsFullUpdate) {
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
