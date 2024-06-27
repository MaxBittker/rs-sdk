import MessageEncoder from '#lostcity/network/outgoing/codec/MessageEncoder.js';
import Packet from '#jagex2/io/Packet.js';
import ServerProt from '#lostcity/network/225/outgoing/prot/ServerProt.js';
import PlayerInfo from '#lostcity/network/outgoing/model/PlayerInfo.js';
import World from '#lostcity/engine/World.js';
import {Position} from '#lostcity/entity/Position.js';
import Player from '#lostcity/entity/Player.js';
import PlayerStat from '#lostcity/entity/PlayerStat.js';

export default class PlayerInfoEncoder extends MessageEncoder<PlayerInfo> {
    prot = ServerProt.PLAYER_INFO;

    encode(buf: Packet, message: PlayerInfo): void {
        const byteBlock: Packet = Packet.alloc(1);

        this.writeLocalPlayer(buf, byteBlock, message.player);
        this.writePlayers(buf, byteBlock, message.player);
        this.writeNewPlayers(buf, byteBlock, message.player);

        // const debug = new Packet();
        // debug.pdata(bitBlock);
        // debug.pdata(byteBlock);
        // debug.save('dump/' + World.currentTick + '.' + this.username + '.player.bin');

        buf.pdata(byteBlock.data, 0, byteBlock.pos);
        byteBlock.release();
    }

    private writeLocalPlayer(bitBlock: Packet, byteBlock: Packet, player: Player): void {
        bitBlock.bits();
        bitBlock.pBit(1, player.tele || player.walkDir !== -1 || player.runDir !== -1 || player.mask > 0 ? 1 : 0);
        if (player.tele) {
            bitBlock.pBit(2, 3);
            bitBlock.pBit(2, player.level);
            bitBlock.pBit(7, Position.local(player.x));
            bitBlock.pBit(7, Position.local(player.z));
            bitBlock.pBit(1, player.jump ? 1 : 0);
            bitBlock.pBit(1, player.mask > 0 ? 1 : 0);
        } else if (player.runDir !== -1) {
            bitBlock.pBit(2, 2);
            bitBlock.pBit(3, player.walkDir);
            bitBlock.pBit(3, player.runDir);
            bitBlock.pBit(1, player.mask > 0 ? 1 : 0);
        } else if (player.walkDir !== -1) {
            bitBlock.pBit(2, 1);
            bitBlock.pBit(3, player.walkDir);
            bitBlock.pBit(1, player.mask > 0 ? 1 : 0);
        } else if (player.mask > 0) {
            bitBlock.pBit(2, 0);
        }

        if (player.mask > 0) {
            this.writeUpdate(player, player, byteBlock, true);
        }
    }

    private writePlayers(bitBlock: Packet, byteBlock: Packet, player: Player): void {
        // update other players (255 max - 8 bits)
        bitBlock.pBit(8, player.otherPlayers.size);

        for (const uid of player.otherPlayers) {
            const other: Player | null = World.getPlayerByUid(uid);
            if (!other || other.tele || !Position.isWithinDistance(player, other, 16)) {
                // player full teleported, so needs to be removed and re-added
                bitBlock.pBit(1, 1);
                bitBlock.pBit(2, 3);
                player.otherPlayers.delete(uid);
                continue;
            }

            let hasMaskUpdate: boolean = other.mask > 0;

            const bitBlockBytes = ((bitBlock.bitPos + 7) / 8) >>> 0;
            if (bitBlockBytes + byteBlock.pos + this.calculateUpdateSize(other, false, false) > 5000 - (11 + 5 + 5 + 1 + 1)) {
                hasMaskUpdate = false;
            }

            const {walkDir, runDir} = other;
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
                this.writeUpdate(other, player, byteBlock);
            }
        }
    }

    private writeNewPlayers(bitBlock: Packet, byteBlock: Packet, player: Player): void {
        for (const other of this.getNearbyPlayers(player)) {
            // todo: tele optimization (not re-sending appearance block for recently observed players (they stay in memory))
            const hasInitialUpdate: boolean = true;

            const bitBlockSize: number = bitBlock.bitPos + 11 + 5 + 5 + 1 + 1;
            const bitBlockBytes: number = ((bitBlockSize + 7) / 8) >>> 0;
            if (bitBlockBytes + byteBlock.pos + this.calculateUpdateSize(other, false, true) > 5000 - (11 + 5 + 5 + 1 + 1)) {
                // more players get added next tick
                break;
            }

            bitBlock.pBit(11, other.pid);
            bitBlock.pBit(5, other.x - player.x);
            bitBlock.pBit(5, other.z - player.z);
            bitBlock.pBit(1, other.jump ? 1 : 0);
            bitBlock.pBit(1, hasInitialUpdate ? 1 : 0);

            if (hasInitialUpdate) {
                this.writeUpdate(other, player, byteBlock, false, true);
            }

            player.otherPlayers.add(other.uid);
        }

        if (byteBlock.pos > 0) {
            bitBlock.pBit(11, 2047);
        }
        bitBlock.bytes();
    }

    private *getNearbyPlayers(player: Player): IterableIterator<Player> {
        const absLeftX: number = player.originX - 48;
        const absRightX: number = player.originX + 48;
        const absTopZ: number = player.originZ + 48;
        const absBottomZ: number = player.originZ - 48;

        for (const zoneIndex of player.activeZones) {
            for (const other of World.getZoneIndex(zoneIndex).getAllPlayersSafe()) {
                if (player.otherPlayers.size >= 255) {
                    // todo: add based on distance radius that shrinks if too many players are visible?
                    break;
                }
                if (other.uid === player.uid || other.x <= absLeftX || other.x >= absRightX || other.z >= absTopZ || other.z <= absBottomZ) {
                    continue;
                }
                if (!Position.isWithinDistance(player, other, 16)) {
                    continue;
                }
                if (player.otherPlayers.has(other.uid)) {
                    continue;
                }
                yield other;
            }
        }
    }

    private writeUpdate(player: Player, observer: Player, out: Packet, self: boolean = false, newlyObserved: boolean = false): void {
        let mask: number = player.mask;
        if (newlyObserved) {
            mask |= Player.APPEARANCE;
        }
        if (newlyObserved && (player.orientation !== -1 || player.faceX !== -1 || player.faceZ !== -1)) {
            mask |= Player.FACE_COORD;
        }
        if (newlyObserved && player.faceEntity !== -1) {
            mask |= Player.FACE_ENTITY;
        }

        if (mask > 0xff) {
            mask |= Player.BIG_UPDATE;
        }

        if (self && mask & Player.CHAT) {
            // don't echo back local chat
            mask &= ~Player.CHAT;
        }

        out.p1(mask & 0xff);
        if (mask & Player.BIG_UPDATE) {
            out.p1(mask >> 8);
        }

        if (mask & Player.APPEARANCE) {
            out.p1(player.appearance!.length);
            out.pdata(player.appearance!, 0, player.appearance!.length);
        }

        if (mask & Player.ANIM) {
            out.p2(player.animId);
            out.p1(player.animDelay);
        }

        if (mask & Player.FACE_ENTITY) {
            if (player.faceEntity !== -1) {
                player.alreadyFacedEntity = true;
            }

            out.p2(player.faceEntity);
        }

        if (mask & Player.SAY) {
            out.pjstr(player.chat);
        }

        if (mask & Player.DAMAGE) {
            out.p1(player.damageTaken);
            out.p1(player.damageType);
            out.p1(player.levels[PlayerStat.HITPOINTS]);
            out.p1(player.baseLevels[PlayerStat.HITPOINTS]);
        }

        if (mask & Player.FACE_COORD) {
            if (player.faceX !== -1) {
                player.alreadyFacedCoord = true;
            }

            if (newlyObserved && player.faceX !== -1) {
                out.p2(player.faceX);
                out.p2(player.faceZ);
            } else if (newlyObserved && player.orientation !== -1) {
                const faceX: number = Position.moveX(player.x, player.orientation);
                const faceZ: number = Position.moveZ(player.z, player.orientation);
                out.p2(faceX * 2 + 1);
                out.p2(faceZ * 2 + 1);
            } else {
                out.p2(player.faceX);
                out.p2(player.faceZ);
            }
        }

        if (mask & Player.CHAT) {
            out.p1(player.messageColor!);
            out.p1(player.messageEffect!);
            out.p1(player.messageType!);

            out.p1(player.message!.length);
            out.pdata(player.message!, 0, player.message!.length);
        }

        if (mask & Player.SPOTANIM) {
            out.p2(player.graphicId);
            out.p2(player.graphicHeight);
            out.p2(player.graphicDelay);
        }

        if (mask & Player.EXACT_MOVE) {
            out.p1(player.exactStartX - Position.zoneOrigin(observer.originX));
            out.p1(player.exactStartZ - Position.zoneOrigin(observer.originZ));
            out.p1(player.exactEndX - Position.zoneOrigin(observer.originX));
            out.p1(player.exactEndZ - Position.zoneOrigin(observer.originZ));
            out.p2(player.exactMoveStart);
            out.p2(player.exactMoveEnd);
            out.p1(player.exactMoveDirection);
        }
    }

    private calculateUpdateSize(player: Player, self: boolean = false, newlyObserved: boolean = false): number {
        let length: number = 0;
        let mask: number = player.mask;
        if (newlyObserved) {
            mask |= Player.APPEARANCE;
        }
        if (newlyObserved && (player.orientation !== -1 || player.faceX !== -1 || player.faceZ !== -1)) {
            mask |= Player.FACE_COORD;
        }
        if (newlyObserved && player.faceEntity !== -1) {
            mask |= Player.FACE_ENTITY;
        }

        if (mask > 0xff) {
            mask |= Player.BIG_UPDATE;
        }

        if (self && mask & Player.CHAT) {
            // don't echo back local chat
            mask &= ~Player.CHAT;
        }

        length += 1;
        if (mask & Player.BIG_UPDATE) {
            length += 1;
        }

        if (mask & Player.APPEARANCE) {
            length += 1;
            length += player.appearance?.length ?? 0;
        }

        if (mask & Player.ANIM) {
            length += 3;
        }

        if (mask & Player.FACE_ENTITY) {
            length += 2;
        }

        if (mask & Player.SAY) {
            length += player.chat?.length ?? 0;
        }

        if (mask & Player.DAMAGE) {
            length += 4;
        }

        if (mask & Player.FACE_COORD) {
            length += 4;
        }

        if (mask & Player.CHAT) {
            length += 4;
            length += player.message?.length ?? 0;
        }

        if (mask & Player.SPOTANIM) {
            length += 6;
        }

        if (mask & Player.EXACT_MOVE) {
            length += 9;
        }

        return length;
    }
}