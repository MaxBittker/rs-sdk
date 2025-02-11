import InfoProt from '#/network/rs225/server/prot/InfoProt.js';
import Renderer from '#/engine/renderer/Renderer.js';
import Npc from '#/engine/entity/Npc.js';
import NpcInfoAnim from '#/network/server/model/NpcInfoAnim.js';
import NpcInfoFaceEntity from '#/network/server/model/NpcInfoFaceEntity.js';
import NpcInfoSay from '#/network/server/model/NpcInfoSay.js';
import NpcInfoDamage from '#/network/server/model/NpcInfoDamage.js';
import NpcInfoChangeType from '#/network/server/model/NpcInfoChangeType.js';
import NpcInfoSpotanim from '#/network/server/model/NpcInfoSpotanim.js';
import NpcInfoFaceCoord from '#/network/server/model/NpcInfoFaceCoord.js';
import NpcStat from '#/engine/entity/NpcStat.js';

export default class NpcRenderer extends Renderer<Npc> {
    constructor() {
        super(
            new Map([
                [InfoProt.NPC_ANIM, new Map()],
                [InfoProt.NPC_FACE_ENTITY, new Map()],
                [InfoProt.NPC_SAY, new Map()],
                [InfoProt.NPC_DAMAGE, new Map()],
                [InfoProt.NPC_CHANGE_TYPE, new Map()],
                [InfoProt.NPC_SPOTANIM, new Map()],
                [InfoProt.NPC_FACE_COORD, new Map()]
            ])
        );
    }

    computeInfo(npc: Npc): void {
        const masks: number = npc.masks;
        const nid: number = npc.nid;

        if (nid === -1 || masks === 0) {
            return;
        }

        let lows: number = 0;
        let highs: number = 0;

        if (masks & InfoProt.NPC_ANIM.id) {
            highs += this.cache(nid, new NpcInfoAnim(npc.animId, npc.animDelay), InfoProt.NPC_ANIM);
        }
        if (masks & InfoProt.NPC_FACE_ENTITY.id) {
            const length: number = this.cache(nid, new NpcInfoFaceEntity(npc.faceEntity), InfoProt.NPC_FACE_ENTITY);
            highs += length;
            lows += length;
        }
        if (masks & InfoProt.NPC_SAY.id && npc.chat) {
            highs += this.cache(nid, new NpcInfoSay(npc.chat), InfoProt.NPC_SAY);
        }
        if (masks & InfoProt.NPC_DAMAGE.id) {
            highs += this.cache(nid, new NpcInfoDamage(npc.damageTaken, npc.damageType, npc.levels[NpcStat.HITPOINTS], npc.baseLevels[NpcStat.HITPOINTS]), InfoProt.NPC_DAMAGE);
        }
        if (masks & InfoProt.NPC_CHANGE_TYPE.id) {
            highs += this.cache(nid, new NpcInfoChangeType(npc.type), InfoProt.NPC_CHANGE_TYPE);
        }
        if (masks & InfoProt.NPC_SPOTANIM.id) {
            highs += this.cache(nid, new NpcInfoSpotanim(npc.graphicId, npc.graphicHeight, npc.graphicDelay), InfoProt.NPC_SPOTANIM);
        }
        if (masks & InfoProt.NPC_FACE_COORD.id) {
            const length: number = this.cache(nid, new NpcInfoFaceCoord(npc.faceX, npc.faceZ), InfoProt.NPC_FACE_COORD);
            highs += length;
            lows += length;
        }

        if (highs > 0) {
            this.highs.set(nid, highs + this.header(masks));
        }

        if (lows > 0) {
            const header: number = this.header(InfoProt.NPC_FACE_ENTITY.id + InfoProt.NPC_FACE_COORD.id);
            this.lows.set(nid, header + InfoProt.NPC_FACE_ENTITY.length + InfoProt.NPC_FACE_COORD.length);
        }
    }

    removeTemporary() {
        super.removeTemporary();
        this.caches.get(InfoProt.NPC_ANIM)?.clear();
        this.caches.get(InfoProt.NPC_FACE_ENTITY)?.clear();
        this.caches.get(InfoProt.NPC_SAY)?.clear();
        this.caches.get(InfoProt.NPC_DAMAGE)?.clear();
        this.caches.get(InfoProt.NPC_CHANGE_TYPE)?.clear();
        this.caches.get(InfoProt.NPC_SPOTANIM)?.clear();
        this.caches.get(InfoProt.NPC_FACE_COORD)?.clear();
    }
}