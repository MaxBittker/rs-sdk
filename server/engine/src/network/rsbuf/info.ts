import { BuildArea } from './build.js';
import { CoordGrid } from './coord.js';
import { ZoneMap } from './grid.js';
import { NpcInfoFaceCoord, NpcInfoFaceEntity, PlayerInfoFaceCoord, PlayerInfoFaceEntity } from './messages.js';
import { Npc } from './npc.js';
import { Packet } from './packet.js';
import { NpcInfoProt, PlayerInfoProt } from './prot.js';
import { Player } from './player.js';
import { NpcRenderer, PlayerRenderer } from './renderer.js';
import { Visibility } from './visibility.js';

export class PlayerInfoEncoder {
    private static readonly BITS_ADD = 11 + 5 + 5 + 1 + 1;
    private static readonly BITS_RUN = 1 + 2 + 3 + 3 + 1;
    private static readonly BITS_WALK = 1 + 2 + 3 + 1;
    private static readonly BITS_EXTEND = 1 + 2;

    private readonly buf = new Packet(5000);
    private readonly updates = new Packet(5000);

    encode(pos: number, renderer: PlayerRenderer, players: Array<Player | null>, map: ZoneMap, grid: Map<number, number[]>, player: Player, dx: number, dz: number, rebuild: boolean): Uint8Array {
        const build = player.build;

        if (rebuild || dx > build.viewDistance || dz > build.viewDistance) {
            build.rebuildPlayers(players, grid, player.pid, player.coord.x(), player.coord.y(), player.coord.z());
        } else {
            build.resize();
        }

        this.buf.pos = 0;
        this.buf.bitPos = 0;
        this.updates.pos = 0;
        this.updates.bitPos = 0;

        this.buf.bits();
        const bytes1 = this.writeLocalPlayer(renderer, player);
        const bytes2 = this.writePlayers(players, renderer, player, bytes1 + pos);
        this.writeNewPlayers(map, players, renderer, grid, player, bytes2);

        if (this.updates.pos > 0) {
            this.buf.pbit(11, 2047);
            this.buf.bytes();
            this.buf.pdata(this.updates.data, 0, this.updates.pos);
        } else {
            this.buf.bytes();
        }

        return this.buf.data.slice(0, this.buf.pos);
    }

    private writeLocalPlayer(renderer: PlayerRenderer, player: Player): number {
        const length = renderer.highdefinitions(player.pid);
        if (player.tele) {
            this.teleport(renderer, player, player, player.coord.x() - (((player.origin.x() >> 3) - 6) << 3), player.coord.y(), player.coord.z() - (((player.origin.z() >> 3) - 6) << 3), player.jump, length > 0);
        } else if (player.runDir !== -1) {
            this.run(renderer, player, player, length > 0);
        } else if (player.walkDir !== -1) {
            this.walk(renderer, player, player, length > 0);
        } else if (length > 0) {
            this.extend(renderer, player, player);
        } else {
            this.idle();
        }
        return length;
    }

    private writePlayers(players: Array<Player | null>, renderer: PlayerRenderer, player: Player, bytesStart: number): number {
        let bytes = bytesStart;
        this.buf.pbit(8, player.build.players.len());

        for (const pid of player.build.players.iter()) {
            const other = players[pid];
            if (!other || other.pid === -1 || other.tele || other.coord.y() !== player.coord.y() || !CoordGrid.withinDistanceSw(player.coord, other.coord, player.build.viewDistance) || !other.active || other.visibility === Visibility.HARD) {
                this.remove(player, pid);
                continue;
            }

            const length = renderer.highdefinitions(pid);
            if (other.runDir !== -1) {
                this.run(renderer, player, other, length > 0 && this.fits(bytes + 2, PlayerInfoEncoder.BITS_RUN, length));
            } else if (other.walkDir !== -1) {
                this.walk(renderer, player, other, length > 0 && this.fits(bytes + 2, PlayerInfoEncoder.BITS_WALK, length));
            } else if (length > 0 && this.fits(bytes + 2, PlayerInfoEncoder.BITS_EXTEND, length)) {
                this.extend(renderer, player, other);
            } else {
                this.idle();
            }
            bytes += length + 2;
        }

        return bytes;
    }

    private writeNewPlayers(map: ZoneMap, players: Array<Player | null>, renderer: PlayerRenderer, grid: Map<number, number[]>, player: Player, bytesStart: number): void {
        let bytes = bytesStart;
        for (const pid of player.build.getNearbyPlayers(players, grid, map, player.pid, player.coord.x(), player.coord.y(), player.coord.z())) {
            if (player.build.players.contains(pid)) {
                continue;
            }
            if (player.build.players.len() >= BuildArea.PREFERRED_PLAYERS) {
                return;
            }

            const other = players[pid];
            if (!other || other.visibility === Visibility.HARD) {
                continue;
            }

            const length = renderer.lowdefinitions(pid) + renderer.highdefinitions(pid);
            if (!this.fits(bytes + 2, PlayerInfoEncoder.BITS_ADD, length)) {
                return;
            }

            this.add(renderer, player, other, other.pid, other.coord.x() - player.coord.x(), other.coord.z() - player.coord.z(), other.jump);
            bytes += length + 2;
        }
    }

    private add(renderer: PlayerRenderer, player: Player, other: Player, pid: number, x: number, z: number, jump: boolean): void {
        this.buf.pbit(11, pid);
        this.buf.pbit(5, x);
        this.buf.pbit(5, z);
        this.buf.pbit(1, jump ? 1 : 0);
        this.buf.pbit(1, 1);
        this.lowdefinition(renderer, player, other);
        player.build.players.insert(other.pid);
    }

    private remove(player: Player, other: number): void {
        this.buf.pbit(1, 1);
        this.buf.pbit(2, 3);
        player.build.players.remove(other);
    }

    private teleport(renderer: PlayerRenderer, player: Player, other: Player, x: number, y: number, z: number, jump: boolean, extend: boolean): void {
        this.buf.pbit(1, 1);
        this.buf.pbit(2, 3);
        this.buf.pbit(2, y);
        this.buf.pbit(7, x);
        this.buf.pbit(7, z);
        this.buf.pbit(1, jump ? 1 : 0);
        if (extend) {
            this.buf.pbit(1, 1);
            this.highdefinition(renderer, player, other);
        } else {
            this.buf.pbit(1, 0);
        }
    }

    private run(renderer: PlayerRenderer, player: Player, other: Player, extend: boolean): void {
        this.buf.pbit(1, 1);
        this.buf.pbit(2, 2);
        this.buf.pbit(3, other.walkDir);
        this.buf.pbit(3, other.runDir);
        if (extend) {
            this.buf.pbit(1, 1);
            this.highdefinition(renderer, player, other);
        } else {
            this.buf.pbit(1, 0);
        }
    }

    private walk(renderer: PlayerRenderer, player: Player, other: Player, extend: boolean): void {
        this.buf.pbit(1, 1);
        this.buf.pbit(2, 1);
        this.buf.pbit(3, other.walkDir);
        if (extend) {
            this.buf.pbit(1, 1);
            this.highdefinition(renderer, player, other);
        } else {
            this.buf.pbit(1, 0);
        }
    }

    private extend(renderer: PlayerRenderer, player: Player, other: Player): void {
        this.buf.pbit(1, 1);
        this.buf.pbit(2, 0);
        this.highdefinition(renderer, player, other);
    }

    private idle(): void {
        this.buf.pbit(1, 0);
    }

    private highdefinition(renderer: PlayerRenderer, player: Player, other: Player): void {
        let masks = other.masks;
        if (player.pid === other.pid) {
            masks &= ~PlayerInfoProt.CHAT;
        }
        this.writeBlocks(renderer, player, other, masks);
    }

    private lowdefinition(renderer: PlayerRenderer, player: Player, other: Player): void {
        const pid = other.pid;
        let masks = other.masks;

        if (other.lastAppearance !== -1 && !player.build.hasAppearance(pid, other.lastAppearance >>> 0)) {
            player.build.saveAppearance(pid, other.lastAppearance >>> 0);
            masks |= PlayerInfoProt.APPEARANCE;
        } else {
            masks &= ~PlayerInfoProt.APPEARANCE;
        }

        if (other.faceEntity !== -1 && !renderer.has(pid, PlayerInfoProt.FACE_ENTITY)) {
            renderer.cache(pid, new PlayerInfoFaceEntity(other.faceEntity), PlayerInfoProt.FACE_ENTITY);
            masks |= PlayerInfoProt.FACE_ENTITY;
        }

        if (!renderer.has(pid, PlayerInfoProt.FACE_COORD)) {
            if (other.faceX !== -1) {
                renderer.cache(pid, new PlayerInfoFaceCoord(other.faceX, other.faceZ), PlayerInfoProt.FACE_COORD);
            } else if (other.orientationX !== -1) {
                renderer.cache(pid, new PlayerInfoFaceCoord(other.orientationX, other.orientationZ), PlayerInfoProt.FACE_COORD);
            } else {
                renderer.cache(pid, new PlayerInfoFaceCoord(CoordGrid.fine(other.coord.x(), 1), CoordGrid.fine(other.coord.z(), 1)), PlayerInfoProt.FACE_COORD);
            }
        }

        masks |= PlayerInfoProt.FACE_COORD;
        this.writeBlocks(renderer, player, other, masks);
    }

    private writeBlocks(renderer: PlayerRenderer, player: Player, other: Player, masks: number): void {
        if (masks > 0xff) {
            this.updates.ip2(masks | PlayerInfoProt.BIG);
        } else {
            this.updates.p1(masks);
        }

        if ((masks & PlayerInfoProt.APPEARANCE) !== 0) {
            renderer.write(this.updates, other.pid, PlayerInfoProt.APPEARANCE);
        }
        if ((masks & PlayerInfoProt.ANIM) !== 0) {
            renderer.write(this.updates, other.pid, PlayerInfoProt.ANIM);
        }
        if ((masks & PlayerInfoProt.FACE_ENTITY) !== 0) {
            renderer.write(this.updates, other.pid, PlayerInfoProt.FACE_ENTITY);
        }
        if ((masks & PlayerInfoProt.SAY) !== 0) {
            renderer.write(this.updates, other.pid, PlayerInfoProt.SAY);
        }
        if ((masks & PlayerInfoProt.DAMAGE) !== 0) {
            renderer.write(this.updates, other.pid, PlayerInfoProt.DAMAGE);
        }
        if ((masks & PlayerInfoProt.FACE_COORD) !== 0) {
            renderer.write(this.updates, other.pid, PlayerInfoProt.FACE_COORD);
        }
        if ((masks & PlayerInfoProt.CHAT) !== 0) {
            renderer.write(this.updates, other.pid, PlayerInfoProt.CHAT);
        }
        if ((masks & PlayerInfoProt.SPOT_ANIM) !== 0) {
            renderer.write(this.updates, other.pid, PlayerInfoProt.SPOT_ANIM);
        }
        if ((masks & PlayerInfoProt.EXACT_MOVE) !== 0 && other.exactMove !== null) {
            const x = ((player.origin.x() >> 3) - 6) << 3;
            const z = ((player.origin.z() >> 3) - 6) << 3;
            renderer.writeExactmove(this.updates, other.exactMove.startX - x, other.exactMove.startZ - z, other.exactMove.endX - x, other.exactMove.endZ - z, other.exactMove.begin, other.exactMove.finish, other.exactMove.dir);
        }
        if ((masks & PlayerInfoProt.DAMAGE2) !== 0) {
            renderer.write(this.updates, other.pid, PlayerInfoProt.DAMAGE2);
        }
    }

    private fits(bytes: number, bitsToAdd: number, bytesToAdd: number): boolean {
        return ((this.buf.bitPos + bitsToAdd + 7) >> 3) + bytes + bytesToAdd <= 4997;
    }
}

export class NpcInfoEncoder {
    private static readonly BITS_ADD = 14 + 11 + 5 + 5 + 1;
    private static readonly BITS_RUN = 1 + 2 + 3 + 3 + 1;
    private static readonly BITS_WALK = 1 + 2 + 3 + 1;
    private static readonly BITS_EXTEND = 1 + 2;

    private readonly buf = new Packet(5000);
    private readonly updates = new Packet(5000);

    encode(pos: number, renderer: NpcRenderer, npcs: Array<Npc | null>, map: ZoneMap, player: Player, dx: number, dz: number, rebuild: boolean): Uint8Array {
        const build = player.build;
        if (rebuild || dx > BuildArea.PREFERRED_VIEW_DISTANCE || dz > BuildArea.PREFERRED_VIEW_DISTANCE) {
            build.rebuildNpcs();
        }

        this.buf.pos = 0;
        this.buf.bitPos = 0;
        this.updates.pos = 0;
        this.updates.bitPos = 0;

        this.buf.bits();
        const bytes = this.writeNpcs(npcs, renderer, player, pos);
        this.writeNewNpcs(map, npcs, renderer, player, bytes);

        if (this.updates.pos > 0) {
            this.buf.pbit(14, 16383);
            this.buf.bytes();
            this.buf.pdata(this.updates.data, 0, this.updates.pos);
        } else {
            this.buf.bytes();
        }

        return this.buf.data.slice(0, this.buf.pos);
    }

    private writeNpcs(npcs: Array<Npc | null>, renderer: NpcRenderer, player: Player, bytesStart: number): number {
        let bytes = bytesStart;
        this.buf.pbit(8, player.build.npcs.len());

        for (const nid of player.build.npcs.iter()) {
            const other = npcs[nid];
            if (!other || other.nid === -1 || other.tele || other.coord.y() !== player.coord.y() || !CoordGrid.withinDistanceSw(player.coord, other.coord, BuildArea.PREFERRED_VIEW_DISTANCE) || !other.active) {
                this.remove(player, nid);
                if (other) {
                    other.observers = Math.max(other.observers - 1, 0);
                }
                continue;
            }

            const length = renderer.highdefinitions(nid);
            if (other.runDir !== -1) {
                this.run(renderer, other, length > 0 && this.fits(bytes + 1, NpcInfoEncoder.BITS_RUN, length));
            } else if (other.walkDir !== -1) {
                this.walk(renderer, other, length > 0 && this.fits(bytes + 1, NpcInfoEncoder.BITS_WALK, length));
            } else if (length > 0 && this.fits(bytes + 1, NpcInfoEncoder.BITS_EXTEND, length)) {
                this.extend(renderer, other);
            } else {
                this.idle();
            }
            bytes += length + 1;
        }

        return bytes;
    }

    private writeNewNpcs(map: ZoneMap, npcs: Array<Npc | null>, renderer: NpcRenderer, player: Player, bytesStart: number): void {
        let bytes = bytesStart;
        for (const nid of player.build.getNearbyNpcs(npcs, map, player.coord.x(), player.coord.y(), player.coord.z())) {
            if (player.build.npcs.contains(nid)) {
                continue;
            }
            if (player.build.npcs.len() >= BuildArea.PREFERRED_NPCS) {
                return;
            }

            const other = npcs[nid];
            if (!other) {
                continue;
            }

            const length = renderer.lowdefinitions(nid) + renderer.highdefinitions(nid);
            if (!this.fits(bytes + 1, NpcInfoEncoder.BITS_ADD, length)) {
                return;
            }

            this.add(renderer, player, other, other.nid, other.ntype, other.coord.x() - player.coord.x(), other.coord.z() - player.coord.z(), other.jump);
            other.observers += 1;
            bytes += length + 1;
        }
    }

    private add(renderer: NpcRenderer, player: Player, other: Npc, nid: number, ntype: number, x: number, z: number, jump: boolean): void {
        this.buf.pbit(14, nid);
        this.buf.pbit(11, ntype);
        this.buf.pbit(5, x);
        this.buf.pbit(5, z);
        this.buf.pbit(1, jump ? 1 : 0);
        this.buf.pbit(1, 1);
        this.lowdefinition(renderer, other);
        player.build.npcs.insert(other.nid);
    }

    private remove(player: Player, other: number): void {
        this.buf.pbit(1, 1);
        this.buf.pbit(2, 3);
        player.build.npcs.remove(other);
    }

    private run(renderer: NpcRenderer, other: Npc, extend: boolean): void {
        this.buf.pbit(1, 1);
        this.buf.pbit(2, 2);
        this.buf.pbit(3, other.walkDir);
        this.buf.pbit(3, other.runDir);
        if (extend) {
            this.buf.pbit(1, 1);
            this.highdefinition(renderer, other);
        } else {
            this.buf.pbit(1, 0);
        }
    }

    private walk(renderer: NpcRenderer, other: Npc, extend: boolean): void {
        this.buf.pbit(1, 1);
        this.buf.pbit(2, 1);
        this.buf.pbit(3, other.walkDir);
        if (extend) {
            this.buf.pbit(1, 1);
            this.highdefinition(renderer, other);
        } else {
            this.buf.pbit(1, 0);
        }
    }

    private extend(renderer: NpcRenderer, other: Npc): void {
        this.buf.pbit(1, 1);
        this.buf.pbit(2, 0);
        this.highdefinition(renderer, other);
    }

    private idle(): void {
        this.buf.pbit(1, 0);
    }

    private highdefinition(renderer: NpcRenderer, other: Npc): void {
        this.writeBlocks(renderer, other.nid, other.masks);
    }

    private lowdefinition(renderer: NpcRenderer, other: Npc): void {
        const nid = other.nid;
        let masks = other.masks;

        if (other.faceEntity !== -1 && !renderer.has(nid, NpcInfoProt.FACE_ENTITY)) {
            renderer.cache(nid, new NpcInfoFaceEntity(other.faceEntity), NpcInfoProt.FACE_ENTITY);
            masks |= NpcInfoProt.FACE_ENTITY;
        }

        if (!renderer.has(nid, NpcInfoProt.FACE_COORD)) {
            if (other.faceX !== -1) {
                renderer.cache(nid, new NpcInfoFaceCoord(other.faceX, other.faceZ), NpcInfoProt.FACE_COORD);
            } else if (other.orientationX !== -1) {
                renderer.cache(nid, new NpcInfoFaceCoord(other.orientationX, other.orientationZ), NpcInfoProt.FACE_COORD);
            } else {
                renderer.cache(nid, new NpcInfoFaceCoord(CoordGrid.fine(other.coord.x(), 1), CoordGrid.fine(other.coord.z(), 1)), NpcInfoProt.FACE_COORD);
            }
        }

        masks |= NpcInfoProt.FACE_COORD;
        this.writeBlocks(renderer, nid, masks);
    }

    private writeBlocks(renderer: NpcRenderer, nid: number, masks: number): void {
        this.updates.p1(masks & 0xff);

        if ((masks & NpcInfoProt.DAMAGE2) !== 0) {
            renderer.write(this.updates, nid, NpcInfoProt.DAMAGE2);
        }
        if ((masks & NpcInfoProt.ANIM) !== 0) {
            renderer.write(this.updates, nid, NpcInfoProt.ANIM);
        }
        if ((masks & NpcInfoProt.FACE_ENTITY) !== 0) {
            renderer.write(this.updates, nid, NpcInfoProt.FACE_ENTITY);
        }
        if ((masks & NpcInfoProt.SAY) !== 0) {
            renderer.write(this.updates, nid, NpcInfoProt.SAY);
        }
        if ((masks & NpcInfoProt.DAMAGE) !== 0) {
            renderer.write(this.updates, nid, NpcInfoProt.DAMAGE);
        }
        if ((masks & NpcInfoProt.CHANGE_TYPE) !== 0) {
            renderer.write(this.updates, nid, NpcInfoProt.CHANGE_TYPE);
        }
        if ((masks & NpcInfoProt.SPOT_ANIM) !== 0) {
            renderer.write(this.updates, nid, NpcInfoProt.SPOT_ANIM);
        }
        if ((masks & NpcInfoProt.FACE_COORD) !== 0) {
            renderer.write(this.updates, nid, NpcInfoProt.FACE_COORD);
        }
    }

    private fits(bytes: number, bitsToAdd: number, bytesToAdd: number): boolean {
        return ((this.buf.bitPos + bitsToAdd + 7) >> 3) + bytes + bytesToAdd <= 4997;
    }
}
