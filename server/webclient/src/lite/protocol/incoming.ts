// Inbound packet framing + dispatch.
//
// Ported from Client.ts tcpIn(). One deliberate divergence: the browser client
// LOGS OUT on an opcode it has no branch for (the "T1" path), because an
// unhandled packet means its interface state is now a lie. Headless we only care
// about the packets that feed BotWorldState, and ServerProtSizes already told us
// the exact length, so unknown-but-well-sized packets are consumed and ignored.
// That is safe precisely because the size table is authoritative - if a custom
// engine packet is added WITHOUT a ServerProtSizes entry, this desynchronises,
// same as the browser client. See PATCHES.md cross-boundary invariant #1.
//
// The same reasoning covers a KNOWN branch that throws: the body has already been
// consumed by the time dispatch runs, so handlePacket contains the throw and keeps
// reading. Only a stream-level failure ends the session.

import ObjType from '#/config/ObjType.js';

import { ComponentType } from '#/config/IfType.js';
import { BuildArea } from '#/dash3d/CollisionMap.js';
import ClientNpc from '#/dash3d/ClientNpc.js';
import ClientPlayer from '#/dash3d/ClientPlayer.js';

import Packet from '#/io/Packet.js';
import { ServerProt, ServerProtSizes } from '#/io/ServerProt.js';

import WordFilter from '#/wordfilter/WordFilter.js';
import WordPack from '#/wordfilter/WordPack.js';

import { LiteClient, MAX_PLAYER_COUNT } from '../LiteClient.js';
import { buildCollision } from '../world/CollisionBuilder.js';
import { getNpcPos, getPlayerPos, screenNameOf } from './entities.js';
import { zonePacket } from './zone.js';

/**
 * Read and process at most one packet. Returns false when the socket has nothing
 * complete to offer (or we logged out), true when a packet was consumed.
 */
export async function handlePacket(c: LiteClient): Promise<boolean> {
    const stream = c.conn.stream;
    let available = stream.available;
    if (available === 0) {
        return false;
    }

    if (c.ptype === -1) {
        await stream.readBytes(c.conn.in.data, 0, 1);
        c.ptype = (c.conn.in.data[0] & 0xff) - c.conn.randomIn.nextInt & 0xff;
        c.psize = ServerProtSizes[c.ptype];
        available--;
    }

    if (c.psize === -1) {
        if (available <= 0) {
            return false;
        }
        await stream.readBytes(c.conn.in.data, 0, 1);
        c.psize = c.conn.in.data[0] & 0xff;
        available--;
    }

    if (c.psize === -2) {
        if (available <= 1) {
            return false;
        }
        await stream.readBytes(c.conn.in.data, 0, 2);
        c.conn.in.pos = 0;
        c.psize = c.conn.in.g2();
        available -= 2;
    }

    if (available < c.psize) {
        return false;
    }

    const buf = c.conn.in;
    buf.pos = 0;
    await stream.readBytes(buf.data, 0, c.psize);

    c.ptype2 = c.ptype1;
    c.ptype1 = c.ptype0;
    c.ptype0 = c.ptype;

    const opcode = c.ptype;
    const psize = c.psize;
    c.ptype = -1;
    c.packetsReceived++;

    // A handler that throws is a bad packet, not a dead session: the framing above
    // already consumed exactly psize bytes, so the stream is still in sync - the
    // same argument that makes unknown opcodes skippable. Drop this one and carry
    // on; LiteClient ends the session if handlers keep throwing (see
    // recordDispatchError).
    try {
        dispatch(c, opcode, buf, psize);
    } catch (err) {
        c.recordDispatchError(opcode, err);
    }
    return true;
}

/**
 * Exported for tests, which feed synthetic packets in without a socket.
 *
 * Activates the client's interface table first: `handlePacket` awaits the socket,
 * so another client's loop can run between two packets of this one, leaving
 * `IfType.list` pointing somewhere else. Everything below here is synchronous, so
 * one activation at the top holds for the whole dispatch.
 */
export function dispatch(c: LiteClient, opcode: number, buf: Packet, psize: number): void {
    c.activate();

    switch (opcode) {
        // ---------------------------------------------------------- interfaces
        case ServerProt.IF_OPENCHAT: {
            const comId = buf.g2();
            c.sideModalId = -1;
            c.chatModalId = comId;
            c.mainModalId = -1;
            c.resumedPauseButton = false;
            return;
        }
        case ServerProt.IF_OPENMAIN_SIDE: {
            c.mainModalId = buf.g2();
            c.sideModalId = buf.g2();
            c.chatModalId = -1;
            c.dialogInputOpen = false;
            c.resumedPauseButton = false;
            return;
        }
        case ServerProt.IF_CLOSE: {
            c.sideModalId = -1;
            c.chatModalId = -1;
            c.dialogInputOpen = false;
            c.mainModalId = -1;
            c.resumedPauseButton = false;
            return;
        }
        case ServerProt.IF_OPENMAIN: {
            c.mainModalId = buf.g2();
            c.sideModalId = -1;
            c.chatModalId = -1;
            c.dialogInputOpen = false;
            c.resumedPauseButton = false;
            return;
        }
        case ServerProt.IF_OPENSIDE: {
            c.sideModalId = buf.g2();
            c.chatModalId = -1;
            c.dialogInputOpen = false;
            c.mainModalId = -1;
            c.resumedPauseButton = false;
            return;
        }
        case ServerProt.IF_OPENOVERLAY: {
            c.mainOverlayId = buf.g2b();
            return;
        }
        case ServerProt.IF_SETICON: {
            let comId = buf.g2();
            const icon = buf.g1();
            if (comId === 65535) {
                comId = -1;
            }
            c.sideIcon[icon] = comId;
            return;
        }
        case ServerProt.IF_SHOWICON: {
            c.activeIcon = buf.g1();
            return;
        }
        case ServerProt.IF_SETCOLOUR: {
            const comId = buf.g2();
            const colour = buf.g2();
            const r = (colour >> 10) & 0x1f;
            const g = (colour >> 5) & 0x1f;
            const b = colour & 0x1f;
            const colourCom = c.ifMutable(comId);
            if (colourCom) {
                colourCom.colour = (r << 19) + (g << 11) + (b << 3);
            }
            return;
        }
        case ServerProt.IF_SETHIDE: {
            const comId = buf.g2();
            const hidden = buf.g1() === 1;
            const hideCom = c.ifMutable(comId);
            if (hideCom) {
                hideCom.hide = hidden;
            }
            return;
        }
        case ServerProt.IF_SETOBJECT: {
            const comId = buf.g2();
            const objId = buf.g2();
            const zoom = buf.g2();
            const type = ObjType.list(objId);
            const com = c.ifMutable(comId);
            if (!com) {
                return;
            }
            com.model1Type = 4;
            com.model1Id = objId;
            com.modelXAn = type.xan2d;
            com.modelYAn = type.yan2d;
            com.modelZoom = ((type.zoom2d * 100) / zoom) | 0;
            return;
        }
        case ServerProt.IF_SETMODEL: {
            const comId = buf.g2();
            const modelId = buf.g2();
            const com = c.ifMutable(comId);
            if (com) {
                com.model1Type = 1;
                com.model1Id = modelId;
            }
            return;
        }
        case ServerProt.IF_SETANIM: {
            const comId = buf.g2();
            const seqId = buf.g2b();
            const com = c.ifMutable(comId);
            if (!com) {
                return;
            }
            com.modelAnim = seqId;
            if (seqId === -1) {
                com.animFrame = 0;
                com.animCycle = 0;
            }
            return;
        }
        case ServerProt.IF_SETTEXT: {
            const comId = buf.g2();
            const text = buf.gjstr();
            const textCom = c.ifMutable(comId);
            if (textCom) {
                textCom.text = text;
            }
            return;
        }
        case ServerProt.IF_SETNPCHEAD: {
            const comId = buf.g2();
            const headId = buf.g2();
            const com = c.ifMutable(comId);
            if (com) {
                com.model1Type = 2;
                com.model1Id = headId;
            }
            return;
        }
        case ServerProt.IF_SETPLAYERHEAD: {
            const comId = buf.g2();
            const p = c.localPlayer;
            const headCom = p ? c.ifMutable(comId) : undefined;
            if (p && headCom) {
                headCom.model1Type = 3;
                headCom.model1Id = (p.appearance[8] << 6) + (p.appearance[0] << 12) + (p.colour[0] << 24) + (p.colour[4] << 18) + p.appearance[11];
            }
            return;
        }
        case ServerProt.IF_SETPOSITION: {
            const com = c.ifMutable(buf.g2());
            const x = buf.g2b();
            const y = buf.g2b();
            if (com) {
                com.x = x;
                com.y = y;
            }
            return;
        }
        case ServerProt.IF_SETSCROLLPOS: {
            const comId = buf.g2();
            let pos = buf.g2();
            const com = c.ifMutable(comId);
            if (com && com.type === ComponentType.TYPE_LAYER) {
                if (pos < 0) {
                    pos = 0;
                }
                if (pos > com.scrollHeight - com.height) {
                    pos = com.scrollHeight - com.height;
                }
                com.scrollPos = pos;
            }
            return;
        }
        case ServerProt.TUT_OPEN: {
            const comId = buf.g2b();
            c.tutComId = comId;
            return;
        }

        // ----------------------------------------------------------- inventory
        case ServerProt.UPDATE_INV_STOP_TRANSMIT: {
            const inv = c.ifMutable(buf.g2());
            if (inv?.linkObjType) {
                for (let i = 0; i < inv.linkObjType.length; i++) {
                    inv.linkObjType[i] = 0;
                }
            }
            return;
        }
        case ServerProt.UPDATE_INV_FULL: {
            const inv = c.ifMutable(buf.g2());
            if (!inv?.linkObjType || !inv.linkObjNumber) {
                return;
            }
            const size = buf.g2(); // 289: g1 -> g2 (members bank > 255 slots)
            for (let i = 0; i < size; i++) {
                inv.linkObjType[i] = buf.g2();
                let count = buf.g1();
                if (count === 255) {
                    count = buf.g4();
                }
                inv.linkObjNumber[i] = count;
            }
            for (let i = size; i < inv.linkObjType.length; i++) {
                inv.linkObjType[i] = 0;
                inv.linkObjNumber[i] = 0;
            }
            return;
        }
        case ServerProt.UPDATE_INV_PARTIAL: {
            const inv = c.ifMutable(buf.g2());
            if (!inv?.linkObjType || !inv.linkObjNumber) {
                return;
            }
            while (buf.pos < psize) {
                const slot = buf.gsmart(); // 289: g1 -> gsmart
                const id = buf.g2();
                let count = buf.g1();
                if (count === 255) {
                    count = buf.g4();
                }
                if (slot >= 0 && slot < inv.linkObjType.length) {
                    inv.linkObjType[slot] = id;
                    inv.linkObjNumber[slot] = count;
                }
            }
            return;
        }

        // ------------------------------------------------------------ entities
        case ServerProt.NPC_INFO: {
            getNpcPos(c, buf, psize);
            return;
        }
        case ServerProt.PLAYER_INFO: {
            getPlayerPos(c, buf, psize);
            c.awaitingPlayerInfo = false;
            c.sceneState = 2;
            // PLAYER_INFO arrives exactly once per server tick - the bridge hangs
            // its state publication off this, same as the browser client.
            c.notifyGameTick();
            return;
        }

        // ---------------------------------------------------------------- chat
        case ServerProt.MESSAGE_GAME: {
            const message = buf.gjstr();
            if (message.endsWith(':tradereq:')) {
                c.addChat(4, 'wishes to trade with you.', message.substring(0, message.indexOf(':')));
            } else if (message.endsWith(':duelreq:')) {
                c.addChat(8, 'wishes to duel with you.', message.substring(0, message.indexOf(':')));
            } else {
                c.addChat(0, message, '');
            }
            return;
        }
        case ServerProt.MESSAGE_PUBLIC: {
            // rs-sdk custom broadcast (opcode 255) - pairs with the engine's
            // MessagePublicHandler. See PATCHES.md.
            const from = buf.g8();
            try {
                const text = WordFilter.filter(WordPack.unpack(buf, psize - 8));
                c.addChat(2, text, screenNameOf(from));
            } catch {
                // malformed broadcast - drop
            }
            return;
        }
        case ServerProt.MESSAGE_PRIVATE: {
            const from = buf.g8();
            buf.g4(); // message id
            const staffModLevel = buf.g1();
            try {
                const text = WordFilter.filter(WordPack.unpack(buf, psize - 13));
                const name = screenNameOf(from);
                if (staffModLevel === 2 || staffModLevel === 3) {
                    c.addChat(7, text, '@cr2@' + name);
                } else if (staffModLevel === 1) {
                    c.addChat(7, text, '@cr1@' + name);
                } else {
                    c.addChat(3, text, name);
                }
            } catch {
                // malformed pm - drop
            }
            return;
        }
        case ServerProt.UPDATE_IGNORELIST: {
            c.ignoreCount = (psize / 8) | 0;
            for (let i = 0; i < c.ignoreCount; i++) {
                c.ignoreUserhash[i] = buf.g8();
            }
            return;
        }

        // --------------------------------------------------------- player vars
        case ServerProt.UPDATE_STAT: {
            const stat = buf.g1();
            const xp = buf.g4();
            const level = buf.g1();
            c.statXP[stat] = xp;
            c.statEffectiveLevel[stat] = level;
            c.statBaseLevel[stat] = 1;
            for (let i = 0; i < 98; i++) {
                if (xp >= LiteClient.levelExperience[i]) {
                    c.statBaseLevel[stat] = i + 2;
                }
            }
            return;
        }
        case ServerProt.UPDATE_RUNENERGY: {
            c.runenergy = buf.g1();
            return;
        }
        case ServerProt.UPDATE_RUNWEIGHT: {
            c.runweight = buf.g2b();
            return;
        }
        case ServerProt.UPDATE_PID: {
            c.selfSlot = buf.g2();
            c.membersAccount = buf.g1();
            return;
        }
        case ServerProt.SET_MULTIWAY: {
            c.inMultizone = buf.g1();
            return;
        }
        case ServerProt.SET_PLAYER_OP: {
            const index = buf.g1();
            const priority = buf.g1();
            let op: string | null = buf.gjstr();
            if (index >= 1 && index <= 5) {
                if (op.toLowerCase() === 'null') {
                    op = null;
                }
                c.playerOp[index - 1] = op;
                c.playerOpPriority[index - 1] = priority === 0;
            }
            return;
        }
        case ServerProt.P_COUNTDIALOG: {
            c.socialInputOpen = false;
            c.dialogInputOpen = true;
            return;
        }
        case ServerProt.UNSET_MAP_FLAG: {
            c.minimapFlagX = 0;
            c.mapFlagUnsetCount++;
            return;
        }
        case ServerProt.RESET_ANIMS: {
            for (const p of c.players) {
                if (p) {
                    p.primaryAnim = -1;
                }
            }
            for (const n of c.npc) {
                if (n) {
                    n.primaryAnim = -1;
                }
            }
            return;
        }
        case ServerProt.LOGOUT: {
            c.markLoggedOut();
            return;
        }

        // ---------------------------------------------------------------- vars
        case ServerProt.VARP_SMALL: {
            const varpId = buf.g2();
            const value = buf.g1b();
            c.varServ[varpId] = value;
            c.var[varpId] = value;
            return;
        }
        case ServerProt.VARP_LARGE: {
            const varpId = buf.g2();
            const value = buf.g4();
            c.varServ[varpId] = value;
            c.var[varpId] = value;
            return;
        }
        case ServerProt.VARP_SYNC: {
            for (let i = 0; i < c.var.length; i++) {
                c.var[i] = c.varServ[i];
            }
            return;
        }

        // ---------------------------------------------------------------- maps
        case ServerProt.REBUILD_NORMAL: {
            rebuildNormal(c, buf);
            return;
        }

        // --------------------------------------------------------------- zones
        case ServerProt.UPDATE_ZONE_PARTIAL_FOLLOWS: {
            c.zoneUpdateX = buf.g1();
            c.zoneUpdateZ = buf.g1();
            return;
        }
        case ServerProt.UPDATE_ZONE_FULL_FOLLOWS: {
            // The packet carries the zone origin in build-area tiles (0..103);
            // the browser indexes groundObj/locChanges with it directly.
            c.zoneUpdateX = buf.g1();
            c.zoneUpdateZ = buf.g1();
            for (let x = c.zoneUpdateX; x < c.zoneUpdateX + 8; x++) {
                for (let z = c.zoneUpdateZ; z < c.zoneUpdateZ + 8; z++) {
                    if (x >= 0 && z >= 0 && x < BuildArea.SIZE && z < BuildArea.SIZE) {
                        c.groundObj[c.minusedlevel][x][z] = null;
                    }
                }
            }
            // Revert pending loc changes in the zone too - the overlay keys are
            // absolute world tiles, so translate by the build-area base. This is
            // the lite equivalent of the browser's locChanges endTime=0 sweep.
            c.world.clearZoneOverlay(c.minusedlevel, c.mapBuildBaseX + c.zoneUpdateX, c.mapBuildBaseZ + c.zoneUpdateZ);
            return;
        }
        case ServerProt.UPDATE_ZONE_PARTIAL_ENCLOSED: {
            c.zoneUpdateX = buf.g1();
            c.zoneUpdateZ = buf.g1();
            while (buf.pos < psize) {
                zonePacket(c, buf, buf.g1());
            }
            return;
        }
        case ServerProt.OBJ_ADD:
        case ServerProt.OBJ_DEL:
        case ServerProt.OBJ_COUNT:
        case ServerProt.OBJ_REVEAL:
        case ServerProt.LOC_ADD_CHANGE:
        case ServerProt.LOC_DEL:
        case ServerProt.LOC_ANIM:
        case ServerProt.MAP_ANIM:
        case ServerProt.MAP_PROJANIM:
        case ServerProt.P_LOCMERGE: {
            zonePacket(c, buf, opcode);
            return;
        }

        default:
            // Camera, audio, hint arrows, friends list, tutorial flashes, and
            // anything else with no bearing on BotWorldState. The framing already
            // consumed exactly psize bytes, so dropping the body is in-sync.
            return;
    }
}

/**
 * Port of REBUILD_NORMAL, minus the map-file requests. Headless the only things
 * that matter are the new build-area origin and shifting everything that is
 * stored in build-area coordinates (ground items, entity positions) by the delta.
 */
function rebuildNormal(c: LiteClient, buf: Packet): void {
    const zoneX = buf.g2();
    const zoneZ = buf.g2();

    if (c.mapBuildCentreZoneX === zoneX && c.mapBuildCentreZoneZ === zoneZ && c.sceneState === 2) {
        return;
    }

    c.mapBuildCentreZoneX = zoneX;
    c.mapBuildCentreZoneZ = zoneZ;
    c.mapBuildBaseX = (zoneX - 6) * 8;
    c.mapBuildBaseZ = (zoneZ - 6) * 8;

    const dx = c.mapBuildBaseX - c.mapBuildPrevBaseX;
    const dz = c.mapBuildBaseZ - c.mapBuildPrevBaseZ;
    c.mapBuildPrevBaseX = c.mapBuildBaseX;
    c.mapBuildPrevBaseZ = c.mapBuildBaseZ;

    c.world.setBase(c.mapBuildBaseX, c.mapBuildBaseZ);
    buildCollision(c.locIndex, c.mapBuildBaseX, c.mapBuildBaseZ, c.collision, c.world.overlayEntries);
    c.world.collisionDirty = false;

    for (let i = 0; i < 16384; i++) {
        const npc: ClientNpc | null = c.npc[i];
        if (npc) {
            for (let j = 0; j < 10; j++) {
                npc.routeX[j] -= dx;
                npc.routeZ[j] -= dz;
            }
            npc.x -= dx * 128;
            npc.z -= dz * 128;
        }
    }

    for (let i = 0; i < MAX_PLAYER_COUNT; i++) {
        const player: ClientPlayer | null = c.players[i];
        if (player) {
            for (let j = 0; j < 10; j++) {
                player.routeX[j] -= dx;
                player.routeZ[j] -= dz;
            }
            player.x -= dx * 128;
            player.z -= dz * 128;
        }
    }

    c.awaitingPlayerInfo = true;
    c.sceneState = 1;

    // Shift ground-item stacks with the build area, iterating in the direction
    // that avoids clobbering not-yet-copied entries (same as Client.ts).
    const size: number = BuildArea.SIZE;
    let startTileX = 0;
    let endTileX = size;
    let dirX = 1;
    if (dx < 0) {
        startTileX = size - 1;
        endTileX = -1;
        dirX = -1;
    }

    let startTileZ = 0;
    let endTileZ = size;
    let dirZ = 1;
    if (dz < 0) {
        startTileZ = size - 1;
        endTileZ = -1;
        dirZ = -1;
    }

    for (let x = startTileX; x !== endTileX; x += dirX) {
        for (let z = startTileZ; z !== endTileZ; z += dirZ) {
            const lastX = x + dx;
            const lastZ = z + dz;
            for (let level = 0; level < BuildArea.LEVELS; level++) {
                if (lastX >= 0 && lastZ >= 0 && lastX < BuildArea.SIZE && lastZ < BuildArea.SIZE) {
                    c.groundObj[level][x][z] = c.groundObj[level][lastX][lastZ];
                } else {
                    c.groundObj[level][x][z] = null;
                }
            }
        }
    }

    if (c.minimapFlagX !== 0) {
        c.minimapFlagX -= dx;
        c.minimapFlagZ -= dz;
    }

    c.cycle.value++;
}
