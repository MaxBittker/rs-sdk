import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import NpcInfo from '#lostcity/network/outgoing/model/NpcInfo.js';
import World from '#lostcity/engine/World.js';
import {Position} from '#lostcity/entity/Position.js';
import Player from '#lostcity/entity/Player.js';
import NpcStat from '#lostcity/entity/NpcStat.js';
import Npc from '#lostcity/entity/Npc.js';

export default class NpcInfoEncoder extends MessageEncoder<NpcInfo> {
    prot = ServerProt.NPC_INFO;

    encode(buf: Packet, message: NpcInfo): void {
        const byteBlock: Packet = Packet.alloc(1);

        this.writeNpcs(buf, byteBlock, message.player);
        this.writeNewNpcs(buf, byteBlock, message.player);

        // const debug = new Packet();
        // debug.pdata(bitBlock);
        // debug.pdata(byteBlock);
        // debug.save('dump/' + World.currentTick + '.' + this.username + '.npc.bin');

        buf.pdata(byteBlock.data, 0, byteBlock.pos);
        byteBlock.release();
    }

    private writeNpcs(bitBlock: Packet, byteBlock: Packet, player: Player): void {
        // update existing npcs (255 max - 8 bits)
        bitBlock.bits();
        bitBlock.pBit(8, player.npcs.size);

        for (const nid of player.npcs) {
            const npc: Npc | null = World.getNpc(nid);
            if (!npc || npc.tele || !Position.isWithinDistance(player, npc, 16)) {
                // npc full teleported, so needs to be removed and re-added
                bitBlock.pBit(1, 1);
                bitBlock.pBit(2, 3);
                player.npcs.delete(nid);
                continue;
            }

            let hasMaskUpdate: boolean = npc.mask > 0;

            const bitBlockBytes: number = ((bitBlock.bitPos + 7) / 8) >>> 0;
            if (bitBlockBytes + byteBlock.pos + this.calculateUpdateSize(npc, false) > 5000) {
                hasMaskUpdate = false;
            }

            const {walkDir, runDir} = npc;
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
                this.writeUpdate(npc, byteBlock, false);
            }
        }
    }

    private writeNewNpcs(bitBlock: Packet, byteBlock: Packet, player: Player): void {
        for (const npc of this.getNearbyNpcs(player)) {
            const hasInitialUpdate: boolean = npc.mask > 0 || npc.orientation !== -1 || npc.faceX !== -1 || npc.faceZ !== -1 || npc.faceEntity !== -1;

            const bitBlockSize: number = bitBlock.bitPos + 13 + 11 + 5 + 5 + 1;
            const bitBlockBytes: number = ((bitBlockSize + 7) / 8) >>> 0;
            if (bitBlockBytes + byteBlock.pos + this.calculateUpdateSize(npc, true) > 5000) {
                // more npcs get added next tick
                break;
            }

            bitBlock.pBit(13, npc.nid);
            bitBlock.pBit(11, npc.type);
            bitBlock.pBit(5, npc.x - player.x);
            bitBlock.pBit(5, npc.z - player.z);
            bitBlock.pBit(1, hasInitialUpdate ? 1 : 0);

            player.npcs.add(npc.nid);

            if (hasInitialUpdate) {
                this.writeUpdate(npc, byteBlock, true);
            }
        }

        if (byteBlock.pos > 0) {
            bitBlock.pBit(13, 8191);
        }
        bitBlock.bytes();
    }

    private *getNearbyNpcs(player: Player): IterableIterator<Npc> {
        const absLeftX: number = player.originX - 48;
        const absRightX: number = player.originX + 48;
        const absTopZ: number = player.originZ + 48;
        const absBottomZ: number = player.originZ - 48;

        for (const zoneIndex of player.activeZones) {
            for (const npc of World.getZoneIndex(zoneIndex).getAllNpcsSafe()) {
                if (player.npcs.size >= 255) {
                    break;
                }
                if (npc.x <= absLeftX || npc.x >= absRightX || npc.z >= absTopZ || npc.z <= absBottomZ) {
                    continue;
                }
                if (!Position.isWithinDistance(player, npc, 16)) {
                    continue;
                }
                if (player.npcs.has(npc.nid)) {
                    continue;
                }
                yield npc;
            }
        }
    }

    private writeUpdate(npc: Npc, out: Packet, newlyObserved: boolean): void {
        let mask: number = npc.mask;
        if (newlyObserved && (npc.orientation !== -1 || npc.faceX !== -1 || npc.faceZ != -1)) {
            mask |= Npc.FACE_COORD;
        }
        if (newlyObserved && npc.faceEntity !== -1) {
            mask |= Npc.FACE_ENTITY;
        }
        out.p1(mask);

        if (mask & Npc.ANIM) {
            out.p2(npc.animId);
            out.p1(npc.animDelay);
        }

        if (mask & Npc.FACE_ENTITY) {
            if (npc.faceEntity !== -1) {
                npc.alreadyFacedEntity = true;
            }

            out.p2(npc.faceEntity);
        }

        if (mask & Npc.SAY) {
            out.pjstr(npc.chat);
        }

        if (mask & Npc.DAMAGE) {
            out.p1(npc.damageTaken);
            out.p1(npc.damageType);
            out.p1(npc.levels[NpcStat.HITPOINTS]);
            out.p1(npc.baseLevels[NpcStat.HITPOINTS]);
        }

        if (mask & Npc.CHANGE_TYPE) {
            out.p2(npc.type);
        }

        if (mask & Npc.SPOTANIM) {
            out.p2(npc.graphicId);
            out.p2(npc.graphicHeight);
            out.p2(npc.graphicDelay);
        }

        if (mask & Npc.FACE_COORD) {
            if (npc.faceX !== -1) {
                npc.alreadyFacedCoord = true;
            }

            if (newlyObserved && npc.faceX != -1) {
                out.p2(npc.faceX);
                out.p2(npc.faceZ);
            } else if (newlyObserved && npc.orientation != -1) {
                const faceX: number = Position.moveX(npc.x, npc.orientation);
                const faceZ: number = Position.moveZ(npc.z, npc.orientation);
                out.p2(faceX * 2 + 1);
                out.p2(faceZ * 2 + 1);
            } else {
                out.p2(npc.faceX);
                out.p2(npc.faceZ);
            }
        }
    }

    private calculateUpdateSize(npc: Npc, newlyObserved: boolean): number {
        let length: number = 0;
        let mask: number = npc.mask;
        if (newlyObserved && (npc.orientation !== -1 || npc.faceX !== -1 || npc.faceZ != -1)) {
            mask |= Npc.FACE_COORD;
        }
        if (newlyObserved && npc.faceEntity !== -1) {
            mask |= Npc.FACE_ENTITY;
        }
        length += 1;

        if (mask & Npc.ANIM) {
            length += 3;
        }

        if (mask & Npc.FACE_ENTITY) {
            length += 2;
        }

        if (mask & Npc.SAY) {
            length += npc.chat?.length ?? 0;
        }

        if (mask & Npc.DAMAGE) {
            length += 4;
        }

        if (mask & Npc.CHANGE_TYPE) {
            length += 2;
        }

        if (mask & Npc.SPOTANIM) {
            length += 6;
        }

        if (mask & Npc.FACE_COORD) {
            length += 4;
        }

        return length;
    }
}