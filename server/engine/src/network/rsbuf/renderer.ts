import {
    NpcInfoAnim,
    NpcInfoChangeType,
    NpcInfoDamage,
    NpcInfoFaceCoord,
    NpcInfoFaceEntity,
    NpcInfoSay,
    NpcInfoSpotanim,
    type InfoMessage,
    PlayerInfoAnim,
    PlayerInfoAppearance,
    PlayerInfoChat,
    PlayerInfoDamage,
    PlayerInfoExactMove,
    PlayerInfoFaceCoord,
    PlayerInfoFaceEntity,
    PlayerInfoSay,
    PlayerInfoSpotanim
} from './messages.js';
import { NpcInfoProt, PlayerInfoProt, npcInfoProtIndex, playerInfoProtIndex } from './prot.js';
import { Packet } from './packet.js';
import { Npc } from './npc.js';
import { Player } from './player.js';

function encodeInfo(messages: Array<Uint8Array | null>, id: number, message: InfoMessage): number {
    const buf = new Packet(message.test());
    message.encode(buf);
    messages[id] = buf.data;
    return buf.len;
}

export class PlayerRenderer {
    private readonly caches: Array<Array<Uint8Array | null>> = Array.from({ length: 9 }, () => Array<Uint8Array | null>(2048).fill(null));
    private readonly highs = new Uint16Array(2048);
    private readonly lows = new Uint16Array(2048);

    computeInfo(player: Player): void {
        const masks = player.masks;
        const pid = player.pid;

        if (pid === -1 || masks === 0) {
            return;
        }

        let highs = 0;
        let lows = 0;

        if ((masks & PlayerInfoProt.APPEARANCE) !== 0) {
            const length = this.cache(pid, new PlayerInfoAppearance(player.appearance.slice()), PlayerInfoProt.APPEARANCE);
            highs += length;
            lows += length;
        }
        if ((masks & PlayerInfoProt.ANIM) !== 0) {
            highs += this.cache(pid, new PlayerInfoAnim(player.animId, player.animDelay), PlayerInfoProt.ANIM);
        }
        if ((masks & PlayerInfoProt.FACE_ENTITY) !== 0) {
            const length = this.cache(pid, new PlayerInfoFaceEntity(player.faceEntity), PlayerInfoProt.FACE_ENTITY);
            highs += length;
            lows += length;
        }
        if ((masks & PlayerInfoProt.SAY) !== 0 && player.say !== null) {
            highs += this.cache(pid, new PlayerInfoSay(player.say), PlayerInfoProt.SAY);
        }
        if ((masks & PlayerInfoProt.DAMAGE) !== 0) {
            highs += this.cache(pid, new PlayerInfoDamage(player.damageTaken, player.damageType, player.currentHitpoints, player.baseHitpoints), PlayerInfoProt.DAMAGE);
        }
        if ((masks & PlayerInfoProt.DAMAGE2) !== 0) {
            highs += this.cache(pid, new PlayerInfoDamage(player.damageTaken2, player.damageType2, player.currentHitpoints, player.baseHitpoints), PlayerInfoProt.DAMAGE2);
        }
        if ((masks & PlayerInfoProt.FACE_COORD) !== 0) {
            const length = this.cache(pid, new PlayerInfoFaceCoord(player.faceX, player.faceZ), PlayerInfoProt.FACE_COORD);
            highs += length;
            lows += length;
        }
        if ((masks & PlayerInfoProt.CHAT) !== 0 && player.chat !== null) {
            highs += this.cache(pid, new PlayerInfoChat(player.chat.bytes.slice(), player.chat.color, player.chat.effect, player.chat.ignored), PlayerInfoProt.CHAT);
        }
        if ((masks & PlayerInfoProt.SPOT_ANIM) !== 0) {
            highs += this.cache(pid, new PlayerInfoSpotanim(player.graphicId, player.graphicHeight, player.graphicDelay), PlayerInfoProt.SPOT_ANIM);
        }
        if ((masks & PlayerInfoProt.EXACT_MOVE) !== 0) {
            highs += 9;
        }

        if (highs > 0) {
            this.highs[pid] = highs + PlayerRenderer.header(masks);
        }

        if (lows > 0) {
            const header = PlayerRenderer.header(PlayerInfoProt.APPEARANCE + PlayerInfoProt.FACE_ENTITY + PlayerInfoProt.FACE_COORD);
            const appearance = this.caches[playerInfoProtIndex(PlayerInfoProt.APPEARANCE)][pid]?.length ?? 0;
            this.lows[pid] = header + appearance + 2 + 4;
        }
    }

    writeExactmove(buf: Packet, startX: number, startZ: number, endX: number, endZ: number, begin: number, finish: number, dir: number): void {
        new PlayerInfoExactMove(startX, startZ, endX, endZ, begin, finish, dir).encode(buf);
    }

    cache(id: number, message: InfoMessage, prot: PlayerInfoProt): number {
        const cache = this.caches[playerInfoProtIndex(prot)];
        if (cache[id] !== null && !message.persists()) {
            return 0;
        }
        return encodeInfo(cache, id, message);
    }

    write(buf: Packet, id: number, prot: PlayerInfoProt): void {
        const bytes = this.caches[playerInfoProtIndex(prot)][id];
        if (!bytes) {
            throw new Error('[PlayerRenderer] Tried to write a buf not cached!');
        }
        buf.pdata(bytes, 0, bytes.length);
    }

    has(id: number, prot: PlayerInfoProt): boolean {
        return this.caches[playerInfoProtIndex(prot)][id] !== null;
    }

    highdefinitions(id: number): number {
        return this.highs[id];
    }

    lowdefinitions(id: number): number {
        return this.lows[id];
    }

    removeTemporary(): void {
        this.highs.fill(0);
        for (const prot of [PlayerInfoProt.ANIM, PlayerInfoProt.FACE_ENTITY, PlayerInfoProt.SAY, PlayerInfoProt.DAMAGE, PlayerInfoProt.DAMAGE2, PlayerInfoProt.FACE_COORD, PlayerInfoProt.CHAT, PlayerInfoProt.SPOT_ANIM]) {
            this.caches[playerInfoProtIndex(prot)].fill(null);
        }
    }

    removePermanent(id: number): void {
        this.highs[id] = 0;
        this.lows[id] = 0;
        this.caches[playerInfoProtIndex(PlayerInfoProt.APPEARANCE)][id] = null;
    }

    private static header(masks: number): number {
        let length = 1;
        if (masks > 0xff) {
            length++;
        }
        return length;
    }
}

export class NpcRenderer {
    private readonly caches: Array<Array<Uint8Array | null>> = Array.from({ length: 8 }, () => Array<Uint8Array | null>(16384).fill(null));
    private readonly highs = new Uint16Array(16384);
    private readonly lows = new Uint16Array(16384);

    computeInfo(npc: Npc): void {
        const masks = npc.masks;
        const nid = npc.nid;

        if (nid === -1 || masks === 0) {
            return;
        }

        let highs = 0;
        let lows = 0;

        if ((masks & NpcInfoProt.ANIM) !== 0) {
            highs += this.cache(nid, new NpcInfoAnim(npc.animId, npc.animDelay), NpcInfoProt.ANIM);
        }
        if ((masks & NpcInfoProt.FACE_ENTITY) !== 0) {
            const length = this.cache(nid, new NpcInfoFaceEntity(npc.faceEntity), NpcInfoProt.FACE_ENTITY);
            highs += length;
            lows += length;
        }
        if ((masks & NpcInfoProt.SAY) !== 0 && npc.say !== null) {
            highs += this.cache(nid, new NpcInfoSay(npc.say), NpcInfoProt.SAY);
        }
        if ((masks & NpcInfoProt.DAMAGE) !== 0) {
            highs += this.cache(nid, new NpcInfoDamage(npc.damageTaken, npc.damageType, npc.currentHitpoints, npc.baseHitpoints), NpcInfoProt.DAMAGE);
        }
        if ((masks & NpcInfoProt.DAMAGE2) !== 0) {
            highs += this.cache(nid, new NpcInfoDamage(npc.damageTaken2, npc.damageType2, npc.currentHitpoints, npc.baseHitpoints), NpcInfoProt.DAMAGE2);
        }
        if ((masks & NpcInfoProt.CHANGE_TYPE) !== 0) {
            highs += this.cache(nid, new NpcInfoChangeType(npc.ntype), NpcInfoProt.CHANGE_TYPE);
        }
        if ((masks & NpcInfoProt.SPOT_ANIM) !== 0) {
            highs += this.cache(nid, new NpcInfoSpotanim(npc.graphicId, npc.graphicHeight, npc.graphicDelay), NpcInfoProt.SPOT_ANIM);
        }
        if ((masks & NpcInfoProt.FACE_COORD) !== 0) {
            const length = this.cache(nid, new NpcInfoFaceCoord(npc.faceX, npc.faceZ), NpcInfoProt.FACE_COORD);
            highs += length;
            lows += length;
        }

        if (highs > 0) {
            this.highs[nid] = highs + NpcRenderer.header(masks);
        }

        if (lows > 0) {
            const header = NpcRenderer.header(NpcInfoProt.FACE_ENTITY + NpcInfoProt.FACE_COORD);
            this.lows[nid] = header + 2 + 4;
        }
    }

    cache(id: number, message: InfoMessage, prot: NpcInfoProt): number {
        const cache = this.caches[npcInfoProtIndex(prot)];
        if (cache[id] !== null && !message.persists()) {
            return 0;
        }
        return encodeInfo(cache, id, message);
    }

    write(buf: Packet, id: number, prot: NpcInfoProt): void {
        const bytes = this.caches[npcInfoProtIndex(prot)][id];
        if (!bytes) {
            throw new Error('[NpcRenderer] Tried to write a buf not cached!');
        }
        buf.pdata(bytes, 0, bytes.length);
    }

    has(id: number, prot: NpcInfoProt): boolean {
        return this.caches[npcInfoProtIndex(prot)][id] !== null;
    }

    highdefinitions(id: number): number {
        return this.highs[id];
    }

    lowdefinitions(id: number): number {
        return this.lows[id];
    }

    removeTemporary(): void {
        this.highs.fill(0);
        for (const prot of [NpcInfoProt.ANIM, NpcInfoProt.FACE_ENTITY, NpcInfoProt.SAY, NpcInfoProt.DAMAGE, NpcInfoProt.DAMAGE2, NpcInfoProt.CHANGE_TYPE, NpcInfoProt.SPOT_ANIM, NpcInfoProt.FACE_COORD]) {
            this.caches[npcInfoProtIndex(prot)].fill(null);
        }
    }

    removePermanent(id: number): void {
        this.highs[id] = 0;
        this.lows[id] = 0;
    }

    private static header(masks: number): number {
        let length = 1;
        if (masks > 0xff) {
            length++;
        }
        return length;
    }
}
