import Player from '#/engine/entity/Player.js';
import InfoProt from '#/network/rs225/server/prot/InfoProt.js';
import PlayerInfoAppearance from '#/network/server/model/PlayerInfoAppearance.js';
import PlayerInfoAnim from '#/network/server/model/PlayerInfoAnim.js';
import PlayerInfoFaceEntity from '#/network/server/model/PlayerInfoFaceEntity.js';
import PlayerInfoSay from '#/network/server/model/PlayerInfoSay.js';
import PlayerInfoFaceCoord from '#/network/server/model/PlayerInfoFaceCoord.js';
import PlayerInfoChat from '#/network/server/model/PlayerInfoChat.js';
import PlayerInfoSpotanim from '#/network/server/model/PlayerInfoSpotanim.js';
import Renderer from '#/engine/renderer/Renderer.js';
import PlayerInfoDamage from '#/network/server/model/PlayerInfoDamage.js';
import {PlayerStat} from '#/engine/entity/PlayerStat.js';
import InfoMessage from '#/network/server/InfoMessage.js';
import Packet from '#/io/Packet.js';
import PlayerInfoExactMove from '#/network/server/model/PlayerInfoExactMove.js';
import InfoMessageEncoder from '#/network/server/codec/InfoMessageEncoder.js';
import ServerProtRepository from '#/network/rs225/server/prot/ServerProtRepository.js';

export default class PlayerRenderer extends Renderer<Player>  {
    constructor() {
        super(new Map([
            [InfoProt.PLAYER_APPEARANCE, new Map()],
            [InfoProt.PLAYER_ANIM, new Map()],
            [InfoProt.PLAYER_FACE_ENTITY, new Map()],
            [InfoProt.PLAYER_SAY, new Map()],
            [InfoProt.PLAYER_DAMAGE, new Map()],
            [InfoProt.PLAYER_FACE_COORD, new Map()],
            [InfoProt.PLAYER_CHAT, new Map()],
            [InfoProt.PLAYER_SPOTANIM, new Map()],
            // exact move does not get cached, that is built on demand.
        ]));
    }

    computeInfo(player: Player): void {
        const masks: number = player.masks;
        const pid: number = player.pid;

        if (pid === -1 || masks === 0) {
            return;
        }

        let lows: number = 0;
        let highs: number = 0;

        if (masks & InfoProt.PLAYER_APPEARANCE.id && player.appearance) {
            const length: number = this.cache(pid, new PlayerInfoAppearance(player.appearance), InfoProt.PLAYER_APPEARANCE);
            highs += length;
            lows += length;
        }
        if (masks & InfoProt.PLAYER_ANIM.id) {
            highs += this.cache(pid, new PlayerInfoAnim(player.animId, player.animDelay), InfoProt.PLAYER_ANIM);
        }
        if (masks & InfoProt.PLAYER_FACE_ENTITY.id) {
            const length: number = this.cache(pid, new PlayerInfoFaceEntity(player.faceEntity), InfoProt.PLAYER_FACE_ENTITY);
            highs += length;
            lows += length;
        }
        if (masks & InfoProt.PLAYER_SAY.id && player.chat) {
            highs += this.cache(pid, new PlayerInfoSay(player.chat), InfoProt.PLAYER_SAY);
        }
        if (masks & InfoProt.PLAYER_DAMAGE.id) {
            highs += this.cache(pid, new PlayerInfoDamage(player.damageTaken, player.damageType, player.levels[PlayerStat.HITPOINTS], player.baseLevels[PlayerStat.HITPOINTS]), InfoProt.PLAYER_DAMAGE);
        }
        if (masks & InfoProt.PLAYER_FACE_COORD.id) {
            const length: number = this.cache(pid, new PlayerInfoFaceCoord(player.faceX, player.faceZ), InfoProt.PLAYER_FACE_COORD);
            highs += length;
            lows += length;
        }
        if (masks & InfoProt.PLAYER_CHAT.id && player.messageColor !== null && player.messageEffect !== null && player.messageType !== null && player.message) {
            highs += this.cache(pid, new PlayerInfoChat(player.messageColor, player.messageEffect, player.messageType, player.message), InfoProt.PLAYER_CHAT);
        }
        if (masks & InfoProt.PLAYER_SPOTANIM.id) {
            highs += this.cache(pid, new PlayerInfoSpotanim(player.graphicId, player.graphicHeight, player.graphicDelay), InfoProt.PLAYER_SPOTANIM);
        }
        if (masks & InfoProt.PLAYER_EXACT_MOVE.id) {
            highs += InfoProt.PLAYER_EXACT_MOVE.length;
        }

        if (highs > 0) {
            this.highs.set(pid, highs + this.header(masks));
        }
        if (lows > 0) {
            const header: number = this.header(InfoProt.PLAYER_APPEARANCE.id + InfoProt.PLAYER_FACE_ENTITY.id + InfoProt.PLAYER_FACE_COORD.id);
            const appearance: number = this.caches.get(InfoProt.PLAYER_APPEARANCE)?.get(pid)?.length ?? 0;
            this.lows.set(pid, header + InfoProt.PLAYER_FACE_ENTITY.length + InfoProt.PLAYER_FACE_COORD.length + appearance);
        }
    }

    writeExactmove(buf: Packet, startX: number, startZ: number, endX: number, endZ: number, start: number, end: number, direction: number): void {
        const message: InfoMessage = new PlayerInfoExactMove(startX, startZ, endX, endZ, start, end, direction);
        const encoder: InfoMessageEncoder<InfoMessage> | undefined = ServerProtRepository.getInfoEncoder(message);
        if (typeof encoder === 'undefined') {
            throw new Error(`Encoder not found for info message! ${message}`);
        }
        encoder.encode(buf, message);
    }

    removeTemporary() {
        super.removeTemporary();
        this.caches.get(InfoProt.PLAYER_ANIM)?.clear();
        this.caches.get(InfoProt.PLAYER_FACE_ENTITY)?.clear();
        this.caches.get(InfoProt.PLAYER_SAY)?.clear();
        this.caches.get(InfoProt.PLAYER_DAMAGE)?.clear();
        this.caches.get(InfoProt.PLAYER_FACE_COORD)?.clear();
        this.caches.get(InfoProt.PLAYER_SPOTANIM)?.clear();
        this.caches.get(InfoProt.PLAYER_CHAT)?.clear();
    }

    removePermanent(pid: number) {
        super.removePermanent(pid);
        this.caches.get(InfoProt.PLAYER_APPEARANCE)?.delete(pid);
    }
}