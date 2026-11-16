// PLAYER_INFO / NPC_INFO decoders.
//
// Faithful ports of Client.ts getPlayerPos*/getNpcPos*. These are bit-packed and
// order-dependent - a single misread bit desynchronises the rest of the packet -
// so the structure is kept identical to the original rather than tidied up.
//
// Nothing here touched rendering in the original either: it mutates ClientPlayer
// and ClientNpc, both of which decode fine headless.

import SeqType, { RestartMode } from '#/config/SeqType.js';
import NpcType from '#/config/NpcType.js';

import JString from '#/datastruct/JString.js';

import type ClientEntity from '#/dash3d/ClientEntity.js';
import ClientNpc, { NpcUpdate } from '#/dash3d/ClientNpc.js';
import ClientPlayer, { PlayerUpdate } from '#/dash3d/ClientPlayer.js';

import Packet from '#/io/Packet.js';
import WordPack from '#/wordfilter/WordPack.js';
import WordFilter from '#/wordfilter/WordFilter.js';

import { LOCAL_PLAYER_INDEX, type LiteClient } from '../LiteClient.js';

/**
 * Apply an ANIM update-mask to an entity: priority arbitration, and the
 * RESET/RESETLOOP duplicate behaviours that make a re-triggered animation (a
 * combat swing landing every attack) start its clock over. Client.ts has this
 * block verbatim twice - once for players, once for npcs - so it is extracted
 * here and shared. Exported so tests can start an animation through exactly the
 * rules the packet path uses. Expiry lives in LiteClient.ageEntityAnim.
 */
export function applyAnimMask(e: ClientEntity, seqId: number, delay: number): void {
    if (seqId === e.primaryAnim) {
        e.primaryAnimLoop = 0;
    }

    if (e.primaryAnim === seqId && seqId !== -1) {
        const restartMode = SeqType.list[seqId].duplicatebehaviour;
        if (restartMode === RestartMode.RESET) {
            e.primaryAnimFrame = 0;
            e.primaryAnimCycle = 0;
            e.primaryAnimDelay = delay;
            e.primaryAnimLoop = 0;
        } else if (restartMode === RestartMode.RESETLOOP) {
            e.primaryAnimLoop = 0;
        }
    } else if (seqId === -1 || e.primaryAnim === -1 || SeqType.list[seqId].priority >= SeqType.list[e.primaryAnim].priority) {
        e.primaryAnim = seqId;
        e.primaryAnimFrame = 0;
        e.primaryAnimCycle = 0;
        e.primaryAnimDelay = delay;
        e.primaryAnimLoop = 0;
        e.preanimRouteLength = e.routeLength;
    }
}

// ============================================================== players

export function getPlayerPos(c: LiteClient, buf: Packet, size: number): void {
    c.entityRemovalCount = 0;
    c.entityUpdateCount = 0;

    getPlayerPosLocal(c, buf);
    getPlayerPosOldVis(c, buf);
    getPlayerPosNewVis(c, buf, size);
    getPlayerPosExtended(c, buf);

    for (let i = 0; i < c.entityRemovalCount; i++) {
        const index = c.entityRemovalIds[i];
        const player = c.players[index];
        if (player && player.cycle !== c.cycle.value) {
            c.players[index] = null;
        }
    }

    if (buf.pos !== size) {
        throw new Error(`lite: PLAYER_INFO size mismatch pos:${buf.pos} psize:${size}`);
    }
}

function getPlayerPosLocal(c: LiteClient, buf: Packet): void {
    buf.gBitStart();

    const info = buf.gBit(1);
    if (info === 0) {
        return;
    }

    const op = buf.gBit(2);
    if (op === 0) {
        c.entityUpdateIds[c.entityUpdateCount++] = LOCAL_PLAYER_INDEX;
    } else if (op === 1) {
        c.localPlayer?.moveCode(false, buf.gBit(3));
        if (buf.gBit(1) === 1) {
            c.entityUpdateIds[c.entityUpdateCount++] = LOCAL_PLAYER_INDEX;
        }
    } else if (op === 2) {
        c.localPlayer?.moveCode(true, buf.gBit(3));
        c.localPlayer?.moveCode(true, buf.gBit(3));
        if (buf.gBit(1) === 1) {
            c.entityUpdateIds[c.entityUpdateCount++] = LOCAL_PLAYER_INDEX;
        }
    } else if (op === 3) {
        c.minusedlevel = buf.gBit(2);
        const localX = buf.gBit(7);
        const localZ = buf.gBit(7);
        const jump = buf.gBit(1);
        c.localPlayer?.teleport(jump === 1, localX, localZ);
        if (buf.gBit(1) === 1) {
            c.entityUpdateIds[c.entityUpdateCount++] = LOCAL_PLAYER_INDEX;
        }
    }
}

function getPlayerPosOldVis(c: LiteClient, buf: Packet): void {
    const count = buf.gBit(8);

    if (count < c.playerCount) {
        for (let i = count; i < c.playerCount; i++) {
            c.entityRemovalIds[c.entityRemovalCount++] = c.playerIds[i];
        }
    }
    if (count > c.playerCount) {
        throw new Error('lite: PLAYER_INFO too many players');
    }

    c.playerCount = 0;
    for (let i = 0; i < count; i++) {
        const index = c.playerIds[i];
        const player = c.players[index];

        if (buf.gBit(1) === 0) {
            c.playerIds[c.playerCount++] = index;
            if (player) {
                player.cycle = c.cycle.value;
            }
            continue;
        }

        const op = buf.gBit(2);
        if (op === 0) {
            c.playerIds[c.playerCount++] = index;
            if (player) {
                player.cycle = c.cycle.value;
            }
            c.entityUpdateIds[c.entityUpdateCount++] = index;
        } else if (op === 1) {
            c.playerIds[c.playerCount++] = index;
            if (player) {
                player.cycle = c.cycle.value;
            }
            player?.moveCode(false, buf.gBit(3));
            if (buf.gBit(1) === 1) {
                c.entityUpdateIds[c.entityUpdateCount++] = index;
            }
        } else if (op === 2) {
            c.playerIds[c.playerCount++] = index;
            if (player) {
                player.cycle = c.cycle.value;
            }
            player?.moveCode(true, buf.gBit(3));
            player?.moveCode(true, buf.gBit(3));
            if (buf.gBit(1) === 1) {
                c.entityUpdateIds[c.entityUpdateCount++] = index;
            }
        } else if (op === 3) {
            c.entityRemovalIds[c.entityRemovalCount++] = index;
        }
    }
}

function getPlayerPosNewVis(c: LiteClient, buf: Packet, size: number): void {
    while (buf.bitPos + 10 < size * 8) {
        const index = buf.gBit(11);
        if (index === 2047) {
            break;
        }

        if (!c.players[index]) {
            c.players[index] = new ClientPlayer();
            const appearance = c.playerAppearanceBuffer[index];
            if (appearance) {
                c.players[index]?.setAppearance(appearance);
            }
        }

        c.playerIds[c.playerCount++] = index;
        const player = c.players[index];
        if (player) {
            player.cycle = c.cycle.value;
        }

        let dx = buf.gBit(5);
        if (dx > 15) {
            dx -= 32;
        }
        let dz = buf.gBit(5);
        if (dz > 15) {
            dz -= 32;
        }

        const jump = buf.gBit(1);
        if (c.localPlayer) {
            player?.teleport(jump === 1, c.localPlayer.routeX[0] + dx, c.localPlayer.routeZ[0] + dz);
        }

        if (buf.gBit(1) === 1) {
            c.entityUpdateIds[c.entityUpdateCount++] = index;
        }
    }

    buf.gBitEnd();
}

function getPlayerPosExtended(c: LiteClient, buf: Packet): void {
    for (let i = 0; i < c.entityUpdateCount; i++) {
        const index = c.entityUpdateIds[i];
        const player = c.players[index];
        if (!player) {
            continue;
        }

        let mask = buf.g1();
        if ((mask & PlayerUpdate.BIG_UPDATE) !== 0) {
            mask += buf.g1() << 8;
        }

        decodePlayerExtended(c, player, index, mask, buf);
    }
}

function decodePlayerExtended(c: LiteClient, player: ClientPlayer, index: number, mask: number, buf: Packet): void {
    if ((mask & PlayerUpdate.APPEARANCE) !== 0) {
        const length = buf.g1();
        const data = new Uint8Array(length);
        const appearance = new Packet(data);
        buf.gdata(length, 0, data);
        c.playerAppearanceBuffer[index] = appearance;
        player.setAppearance(appearance);
    }

    if ((mask & PlayerUpdate.ANIM) !== 0) {
        let seqId = buf.g2();
        if (seqId === 65535) {
            seqId = -1;
        }
        const delay = buf.g1();
        applyAnimMask(player, seqId, delay);
    }

    if ((mask & PlayerUpdate.FACEENTITY) !== 0) {
        player.faceEntity = buf.g2();
        if (player.faceEntity === 65535) {
            player.faceEntity = -1;
        }
    }

    if ((mask & PlayerUpdate.SAY) !== 0) {
        player.chatMessage = buf.gjstr();
        // Upstream 289 (Client-TS 1e8d2b8): other players' scripted say stays overhead only,
        // unless the script forces it into the chat log with a leading '~'.
        if (player.chatMessage.charAt(0) === '~') {
            player.chatMessage = player.chatMessage.substring(1);
            c.addChat(2, player.chatMessage, player.name ?? '');
        } else if (player === c.localPlayer) {
            c.addChat(2, player.chatMessage, player.name ?? '');
        }
        player.chatColour = 0;
        player.chatEffect = 0;
        player.chatTimer = 150;
    }

    if ((mask & PlayerUpdate.HITMARK) !== 0) {
        const damage = buf.g1();
        const damageType = buf.g1();
        player.addHitmark(c.cycle.value, damageType, damage);
        player.combatCycle = c.cycle.value + 400;
        player.health = buf.g1();
        player.totalHealth = buf.g1();
    }

    if ((mask & PlayerUpdate.FACESQUARE) !== 0) {
        player.faceSquareX = buf.g2();
        player.faceSquareZ = buf.g2();
    }

    if ((mask & PlayerUpdate.CHAT) !== 0) {
        const colourEffect = buf.g2();
        const type = buf.g1();
        const length = buf.g1();
        const start = buf.pos;

        if (player.name && player.ready) {
            try {
                const uncompressed = WordPack.unpack(buf, length);
                const filtered = WordFilter.filter(uncompressed);
                player.chatMessage = filtered;
                player.chatColour = colourEffect >> 8;
                player.chatEffect = colourEffect & 0xff;
                player.chatTimer = 150;

                if (type === 2 || type === 3) {
                    c.addChat(1, filtered, '@cr2@' + player.name);
                } else if (type === 1) {
                    c.addChat(1, filtered, '@cr1@' + player.name);
                } else {
                    c.addChat(2, filtered, player.name);
                }
            } catch {
                // malformed chat - drop it, the buf.pos reset below keeps us in sync
            }
        }

        buf.pos = start + length;
    }

    if ((mask & PlayerUpdate.SPOTANIM) !== 0) {
        player.spotanimId = buf.g2();
        const heightDelay = buf.g4();
        player.spotanimHeight = heightDelay >> 16;
        player.spotanimLastCycle = c.cycle.value + (heightDelay & 0xffff);
        player.spotanimFrame = 0;
        player.spotanimCycle = 0;
        if (player.spotanimLastCycle > c.cycle.value) {
            player.spotanimFrame = -1;
        }
        if (player.spotanimId === 65535) {
            player.spotanimId = -1;
        }
    }

    if ((mask & PlayerUpdate.EXACTMOVE) !== 0) {
        player.exactStartX = buf.g1();
        player.exactStartZ = buf.g1();
        player.exactEndX = buf.g1();
        player.exactEndZ = buf.g1();
        player.exactMoveEnd = buf.g2() + c.cycle.value;
        player.exactMoveStart = buf.g2() + c.cycle.value;
        player.exactMoveFacing = buf.g1();
        player.abortRoute();
    }

    if ((mask & PlayerUpdate.HITMARK2) !== 0) {
        const damage = buf.g1();
        const damageType = buf.g1();
        player.addHitmark(c.cycle.value, damageType, damage);
        player.combatCycle = c.cycle.value + 400;
        player.health = buf.g1();
        player.totalHealth = buf.g1();
    }
}

// ================================================================= npcs

export function getNpcPos(c: LiteClient, buf: Packet, size: number): void {
    c.entityRemovalCount = 0;
    c.entityUpdateCount = 0;

    getNpcPosOldVis(c, buf);
    getNpcPosNewVis(c, buf, size);
    getNpcPosExtended(c, buf);

    for (let i = 0; i < c.entityRemovalCount; i++) {
        const index = c.entityRemovalIds[i];
        const npc = c.npc[index];
        if (npc && npc.cycle !== c.cycle.value) {
            npc.type = null;
            c.npc[index] = null;
        }
    }

    if (buf.pos !== size) {
        throw new Error(`lite: NPC_INFO size mismatch pos:${buf.pos} psize:${size}`);
    }
}

function getNpcPosOldVis(c: LiteClient, buf: Packet): void {
    buf.gBitStart();

    const count = buf.gBit(8);
    if (count < c.npcCount) {
        for (let i = count; i < c.npcCount; i++) {
            c.entityRemovalIds[c.entityRemovalCount++] = c.npcIds[i];
        }
    }
    if (count > c.npcCount) {
        throw new Error('lite: NPC_INFO too many npcs');
    }

    c.npcCount = 0;
    for (let i = 0; i < count; i++) {
        const index = c.npcIds[i];
        const npc = c.npc[index];

        if (buf.gBit(1) === 0) {
            c.npcIds[c.npcCount++] = index;
            if (npc) {
                npc.cycle = c.cycle.value;
            }
            continue;
        }

        const op = buf.gBit(2);
        if (op === 0) {
            c.npcIds[c.npcCount++] = index;
            if (npc) {
                npc.cycle = c.cycle.value;
            }
            c.entityUpdateIds[c.entityUpdateCount++] = index;
        } else if (op === 1) {
            c.npcIds[c.npcCount++] = index;
            if (npc) {
                npc.cycle = c.cycle.value;
            }
            npc?.moveCode(false, buf.gBit(3));
            if (buf.gBit(1) === 1) {
                c.entityUpdateIds[c.entityUpdateCount++] = index;
            }
        } else if (op === 2) {
            c.npcIds[c.npcCount++] = index;
            if (npc) {
                npc.cycle = c.cycle.value;
            }
            npc?.moveCode(true, buf.gBit(3));
            npc?.moveCode(true, buf.gBit(3));
            if (buf.gBit(1) === 1) {
                c.entityUpdateIds[c.entityUpdateCount++] = index;
            }
        } else if (op === 3) {
            c.entityRemovalIds[c.entityRemovalCount++] = index;
        }
    }
}

function getNpcPosNewVis(c: LiteClient, buf: Packet, size: number): void {
    while (buf.bitPos + 21 < size * 8) {
        const index = buf.gBit(14);
        if (index === 16383) {
            break;
        }

        if (!c.npc[index]) {
            c.npc[index] = new ClientNpc();
        }

        const npc = c.npc[index];
        c.npcIds[c.npcCount++] = index;

        if (npc) {
            npc.cycle = c.cycle.value;
            npc.type = NpcType.list(buf.gBit(11));
            npc.size = npc.type.size;
            npc.turnspeed = npc.type.turnspeed;
            npc.walkanim = npc.type.walkanim;
            npc.walkanim_b = npc.type.walkanim_b;
            // [sic] l/r are crossed over in the original; kept for parity
            npc.walkanim_l = npc.type.walkanim_r;
            npc.walkanim_r = npc.type.walkanim_l;
            npc.readyanim = npc.type.readyanim;
        } else {
            buf.gBit(11);
        }

        let dx = buf.gBit(5);
        if (dx > 15) {
            dx -= 32;
        }
        let dz = buf.gBit(5);
        if (dz > 15) {
            dz -= 32;
        }

        const jump = buf.gBit(1);
        if (c.localPlayer) {
            npc?.teleport(jump === 1, c.localPlayer.routeX[0] + dx, c.localPlayer.routeZ[0] + dz);
        }

        if (buf.gBit(1) === 1) {
            c.entityUpdateIds[c.entityUpdateCount++] = index;
        }
    }

    buf.gBitEnd();
}

function getNpcPosExtended(c: LiteClient, buf: Packet): void {
    for (let i = 0; i < c.entityUpdateCount; i++) {
        const npc = c.npc[c.entityUpdateIds[i]];
        if (!npc) {
            continue;
        }

        const mask = buf.g1();

        if ((mask & NpcUpdate.HITMARK2) !== 0) {
            const damage = buf.g1();
            const damageType = buf.g1();
            npc.addHitmark(c.cycle.value, damageType, damage);
            npc.combatCycle = c.cycle.value + 400;
            npc.health = buf.g1();
            npc.totalHealth = buf.g1();
        }

        if ((mask & NpcUpdate.ANIM) !== 0) {
            let anim = buf.g2();
            if (anim === 65535) {
                anim = -1;
            }
            const delay = buf.g1();
            applyAnimMask(npc, anim, delay);
        }

        if ((mask & NpcUpdate.FACEENTITY) !== 0) {
            npc.faceEntity = buf.g2();
            if (npc.faceEntity === 65535) {
                npc.faceEntity = -1;
            }
        }

        if ((mask & NpcUpdate.SAY) !== 0) {
            npc.chatMessage = buf.gjstr();
            npc.chatTimer = 100;
        }

        if ((mask & NpcUpdate.HITMARK) !== 0) {
            const damage = buf.g1();
            const damageType = buf.g1();
            npc.addHitmark(c.cycle.value, damageType, damage);
            npc.combatCycle = c.cycle.value + 400;
            npc.health = buf.g1();
            npc.totalHealth = buf.g1();
        }

        if ((mask & NpcUpdate.CHANGETYPE) !== 0) {
            npc.type = NpcType.list(buf.g2());
            npc.size = npc.type.size;
            npc.turnspeed = npc.type.turnspeed;
            npc.walkanim = npc.type.walkanim;
            npc.walkanim_b = npc.type.walkanim_b;
            npc.walkanim_l = npc.type.walkanim_r;
            npc.walkanim_r = npc.type.walkanim_l;
            npc.readyanim = npc.type.readyanim;
        }

        if ((mask & NpcUpdate.SPOTANIM) !== 0) {
            npc.spotanimId = buf.g2();
            const info = buf.g4();
            npc.spotanimHeight = info >> 16;
            npc.spotanimLastCycle = c.cycle.value + (info & 0xffff);
            npc.spotanimFrame = 0;
            npc.spotanimCycle = 0;
            if (npc.spotanimLastCycle > c.cycle.value) {
                npc.spotanimFrame = -1;
            }
            if (npc.spotanimId === 65535) {
                npc.spotanimId = -1;
            }
        }

        if ((mask & NpcUpdate.FACESQUARE) !== 0) {
            npc.faceSquareX = buf.g2();
            npc.faceSquareZ = buf.g2();
        }
    }
}

/** Exposed for MESSAGE_PUBLIC/MESSAGE_PRIVATE, which share the WordPack path. */
export function screenNameOf(userhash: bigint): string {
    return JString.toScreenName(JString.toRawUsername(userhash));
}
