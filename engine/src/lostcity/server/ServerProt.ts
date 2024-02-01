import Packet from '#jagex2/io/Packet.js';

import TextEncoder from '#jagex2/jstring/TextEncoder.js';

import IfType from '#lostcity/cache/IfType.js';
import WordEnc from '#lostcity/cache/WordEnc.js';

import { Inventory } from '#lostcity/engine/Inventory.js';

import { Position } from '#lostcity/entity/Position.js';

export enum ServerProt {
    // interfaces
    IF_OPENCHATMODAL = 14,
    IF_OPENMAINSIDEMODAL = 28,
    IF_CLOSE = 129, // NXT has "IF_CLOSESUB"
    IF_OPENSIDEOVERLAY = 167,
    IF_OPENMAINMODAL = 168,
    IF_OPENSIDEMODAL = 195,

    // updating interfaces
    IF_SETCOLOUR = 2, // NXT naming
    IF_SETHIDE = 26, // NXT naming
    IF_SETOBJECT = 46, // NXT naming
    IF_SHOWSIDE = 84,
    IF_SETMODEL = 87, // NXT naming
    IF_SETRECOL = 103, // NXT naming
    IF_SETANIM = 146, // NXT naming
    IF_SETPLAYERHEAD = 197, // NXT naming
    IF_SETTEXT = 201, // NXT naming
    IF_SETNPCHEAD = 204, // NXT naming
    IF_SETPOSITION = 209, // NXT naming

    // tutorial area
    TUTORIAL_FLASHSIDE = 126,
    TUTORIAL_OPENCHAT = 185,

    // inventory
    UPDATE_INV_STOP_TRANSMIT = 15, // NXT naming
    UPDATE_INV_FULL = 98, // NXT naming
    UPDATE_INV_PARTIAL = 213, // NXT naming

    // camera control
    CAM_LOOKAT = 3, // NXT naming
    CAM_SHAKE = 13, // NXT naming
    CAM_MOVETO = 74, // NXT naming
    CAM_RESET = 239, // NXT naming

    // entity updates
    NPC_INFO = 1, // NXT naming
    PLAYER_INFO = 184, // NXT naming

    // input tracking
    FINISH_TRACKING = 133,
    ENABLE_TRACKING = 226,

    // social
    MESSAGE_GAME = 4, // NXT naming
    UPDATE_IGNORELIST = 21, // NXT naming
    CHAT_FILTER_SETTINGS = 32, // NXT naming
    MESSAGE_PRIVATE = 41, // NXT naming
    UPDATE_FRIENDLIST = 152, // NXT naming

    // misc
    UNSET_MAP_FLAG = 19, // NXT has "SET_MAP_FLAG" but we cannot control the position
    UPDATE_RUNWEIGHT = 22, // NXT naming
    HINT_ARROW = 25, // NXT naming
    UPDATE_REBOOT_TIMER = 43, // NXT naming
    UPDATE_STAT = 44, // NXT naming
    UPDATE_RUNENERGY = 68, // NXT naming
    RESET_ANIMS = 136, // NXT naming
    UPDATE_UID192 = 139, // NXT naming (not 100% certain if "uid192" means local player)
    LAST_LOGIN_INFO = 140, // NXT naming
    LOGOUT = 142, // NXT naming
    P_COUNTDIALOG = 243, // named after runescript command + client resume_p_countdialog packet
    SET_MULTIWAY = 254,

    // maps
    DATA_LOC_DONE = 20,
    DATA_LAND_DONE = 80,
    DATA_LAND = 132,
    DATA_LOC = 220,
    REBUILD_NORMAL = 237, // NXT naming (do we really need _normal if there's no region rebuild?)

    // vars
    VARP_SMALL = 150, // NXT naming
    VARP_LARGE = 175, // NXT naming
    RESET_CLIENT_VARCACHE = 193, // NXT naming

    // audio
    SYNTH_SOUND = 12, // NXT naming
    MIDI_SONG = 54, // NXT naming
    MIDI_JINGLE = 212, // NXT naming

    // zones
    UPDATE_ZONE_PARTIAL_FOLLOWS = 7, // NXT naming
    UPDATE_ZONE_FULL_FOLLOWS = 135, // NXT naming
    UPDATE_ZONE_PARTIAL_ENCLOSED = 162, // NXT naming

    // zone protocol
    LOC_MERGE = 23, // based on runescript command p_locmerge
    LOC_ANIM = 42, // NXT naming
    OBJ_DEL = 49, // NXT naming
    OBJ_REVEAL = 50, // NXT naming
    LOC_ADD_CHANGE = 59, // NXT naming
    MAP_PROJANIM = 69, // NXT naming
    LOC_DEL = 76, // NXT naming
    OBJ_COUNT = 151, // NXT naming
    MAP_ANIM = 191, // NXT naming
    OBJ_ADD = 223 // NXT naming
}

// TODO: do this packet-by-packet instead of all at once
export const ServerProtLengths: number[] = [
    0, -2, 4, 6, -1, 0, 0, 2, 0, 0, 0, 0, 5, 4, 2, 2, 0, 0, 0, 0, 2, -2, 2, 14, 0, 6, 3, 0, 4, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, -1, 4, 2, 6, 0, 6, 0, 0, 3, 7, 0, 0, 0, -1, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 1, 15, 0, 0, 0, 0, 6, 0, 2, 0, 0, 0,
    2, 0, 0, 0, 1, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -2, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, -2, 0, 0, 2, 0, 0, 0, 2, 9, 0, 0, 0, 0, 0, 4, 0, 0, 0, 3, 7, 9, 0, 0, 0, 0, 0, 0, 0, 0,
    0, -2, 0, 0, 0, 0, 3, 2, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, -2, 2, 0, 0, 0, 0, 0, 6, 0, 0, 0, 2, 0, 2, 0, 0, 0, -2, 0, 0, 4, 0, 0, 0, 0, 6, 0, 0, -2, -2, 0, 0, 0, 0, 0, 0, -2, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -2, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0
];

// TODO: come up with another solution that preserves type-safety?
export const ServerProtEncoders: {
    [key: number]: (buf: Packet, ...args: any[]) => void;
} = {
    [ServerProt.IF_OPENCHATMODAL]: (buf: Packet, com: number) => {
        buf.p2(com);
    },
    [ServerProt.IF_OPENMAINSIDEMODAL]: (buf: Packet, comMain: number, comSide: number) => {
        buf.p2(comMain);
        buf.p2(comSide);
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [ServerProt.IF_CLOSE]: (_buf: Packet) => {},
    [ServerProt.IF_OPENSIDEOVERLAY]: (buf: Packet, com: number, tab: number) => {
        buf.p2(com);
        buf.p1(tab);
    },
    [ServerProt.IF_OPENMAINMODAL]: (buf: Packet, com: number) => {
        buf.p2(com);
    },
    [ServerProt.IF_OPENSIDEMODAL]: (buf: Packet, com: number) => {
        buf.p2(com);
    },

    [ServerProt.IF_SETCOLOUR]: (buf: Packet, com: number, colour: number) => {
        buf.p2(com);
        buf.p2(colour);
    },
    [ServerProt.IF_SETHIDE]: (buf: Packet, com: number, state: boolean) => {
        buf.p2(com);
        buf.pbool(state);
    },
    [ServerProt.IF_SETOBJECT]: (buf: Packet, com: number, obj: number, scale: number) => {
        buf.p2(com);
        buf.p2(obj);
        buf.p2(scale);
    },
    [ServerProt.IF_SHOWSIDE]: (buf: Packet, tab: number) => {
        buf.p1(tab);
    },
    [ServerProt.IF_SETMODEL]: (buf: Packet, com: number, model: number) => {
        buf.p2(com);
        buf.p2(model);
    },
    [ServerProt.IF_SETRECOL]: (buf: Packet, com: number, src: number, dest: number) => {
        buf.p2(com);
        buf.p2(src);
        buf.p2(dest);
    },
    [ServerProt.IF_SETANIM]: (buf: Packet, com: number, seq: number) => {
        buf.p2(com);
        buf.p2(seq);
    },
    [ServerProt.IF_SETPLAYERHEAD]: (buf: Packet, com: number) => {
        buf.p2(com);
    },
    [ServerProt.IF_SETTEXT]: (buf: Packet, com: number, text: string) => {
        buf.p2(com);
        buf.pjstr(text);
    },
    [ServerProt.IF_SETNPCHEAD]: (buf: Packet, com: number, npc: number) => {
        buf.p2(com);
        buf.p2(npc);
    },
    [ServerProt.IF_SETPOSITION]: (buf: Packet, com: number, x: number, y: number) => {
        buf.p2(com);
        buf.p2(x);
        buf.p2(y);
    },

    [ServerProt.TUTORIAL_FLASHSIDE]: (buf: Packet, tab: number) => {
        buf.p1(tab);
    },
    [ServerProt.TUTORIAL_OPENCHAT]: (buf: Packet, com: number) => {
        buf.p2(com);
    },

    [ServerProt.UPDATE_INV_STOP_TRANSMIT]: (buf: Packet, com: number) => {
        buf.p2(com);
    },
    [ServerProt.UPDATE_INV_FULL]: (buf: Packet, com: number, inv: Inventory) => {
        const comType = IfType.get(com);
        const size = Math.min(inv.capacity, comType.width * comType.height);

        // todo: size should be the index of the last non-empty slot
        buf.p2(com);
        buf.p1(size);
        for (let slot = 0; slot < size; slot++) {
            const obj = inv.get(slot);

            if (obj) {
                buf.p2(obj.id + 1);

                if (obj.count >= 255) {
                    buf.p1(255);
                    buf.p4(obj.count);
                } else {
                    buf.p1(obj.count);
                }
            } else {
                buf.p2(0);
                buf.p1(0);
            }
        }
    },
    [ServerProt.UPDATE_INV_PARTIAL]: (buf: Packet, com: number, inv: Inventory, slots: number[] = []) => {
        buf.p2(com);

        for (const slot of slots) {
            const obj = inv.get(slot);

            buf.p1(slot);
            if (obj) {
                buf.p2(obj.id + 1);

                if (obj.count >= 255) {
                    buf.p1(255);
                    buf.p4(obj.count);
                } else {
                    buf.p1(obj.count);
                }
            } else {
                buf.p2(0);
                buf.p1(0);
            }
        }
    },

    [ServerProt.CAM_LOOKAT]: (buf: Packet, x: number, z: number, y: number, stepBase: number, stepScale: number) => {
        buf.p1(x);
        buf.p1(z);
        buf.p2(y);
        buf.p1(stepBase);
        buf.p1(stepScale);
    },
    [ServerProt.CAM_SHAKE]: (buf: Packet, type: number, jitter: number, amplitude: number, frequency: number) => {
        buf.p1(type); // direction?
        buf.p1(jitter);
        buf.p1(amplitude);
        buf.p1(frequency);
    },
    [ServerProt.CAM_MOVETO]: (buf: Packet, x: number, z: number, y: number, stepBase: number, stepScale: number) => {
        buf.p1(x);
        buf.p1(z);
        buf.p2(y);
        buf.p1(stepBase);
        buf.p1(stepScale);
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [ServerProt.CAM_RESET]: (_buf: Packet) => {},

    [ServerProt.NPC_INFO]: (buf: Packet, bitBlock: Packet, byteBlock: Packet) => {
        buf.pdata(bitBlock);
        buf.pdata(byteBlock);
    },
    [ServerProt.PLAYER_INFO]: (buf: Packet, bitBlock: Packet, byteBlock: Packet) => {
        buf.pdata(bitBlock);
        buf.pdata(byteBlock);
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [ServerProt.FINISH_TRACKING]: (_buf: Packet) => {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [ServerProt.ENABLE_TRACKING]: (_buf: Packet) => {},

    [ServerProt.MESSAGE_GAME]: (buf: Packet, msg: string) => {
        buf.pjstr(msg);
    },
    [ServerProt.UPDATE_IGNORELIST]: (buf: Packet, names: bigint[]) => {
        for (const name of names) {
            buf.p8(name);
        }
    },
    [ServerProt.CHAT_FILTER_SETTINGS]: (buf: Packet, publicChat: number, privateChat: number, tradeDuel: number) => {
        buf.p1(publicChat);
        buf.p1(privateChat);
        buf.p1(tradeDuel);
    },
    [ServerProt.MESSAGE_PRIVATE]: (buf: Packet, from: bigint, messageId: number, staffModLevel: number, msg: string) => {
        buf.p8(from);
        buf.p4(messageId);
        buf.p1(staffModLevel);
        TextEncoder.encode(buf, WordEnc.filter(msg));
    },
    [ServerProt.UPDATE_FRIENDLIST]: (buf: Packet, name: bigint, nodeId: number) => {
        buf.p8(name);
        buf.p1(nodeId);
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [ServerProt.UNSET_MAP_FLAG]: (_buf: Packet) => {},
    [ServerProt.UPDATE_RUNWEIGHT]: (buf: Packet, kg: number) => {
        buf.p2(kg);
    },
    [ServerProt.HINT_ARROW]: (buf: Packet, type: number, nid: number, pid: number, x: number, z: number, y: number) => {
        if (type === 1) {
            buf.p1(type);
            buf.p2(nid);
            buf.p2(0);
            buf.p1(0);
        } else if (type > 2 && type < 10) {
            // 2 - 64, 64 offset - centered
            // 3 - 0, 64 offset - far left
            // 4 - 128, 64 offset - far right
            // 5 - 64, 0 offset - bottom left
            // 6 - 64, 128 offset - top left

            buf.p1(type + 2);
            buf.p2(x);
            buf.p2(z);
            buf.p1(y);
        } else if (type === 10) {
            buf.p1(type);
            buf.p2(pid);
            buf.p2(0);
            buf.p1(0);
        } else if (type === -1) {
            buf.p1(-1);
            buf.p2(0);
            buf.p2(0);
            buf.p1(0);
        }
    },
    [ServerProt.UPDATE_REBOOT_TIMER]: (buf: Packet, ticks: number) => {
        buf.p2(ticks);
    },
    [ServerProt.UPDATE_STAT]: (buf: Packet, stat: number, exp: number, level: number) => {
        buf.p1(stat);
        buf.p4(exp / 10);
        buf.p1(level); // not base level
    },
    [ServerProt.UPDATE_RUNENERGY]: (buf: Packet, energy: number) => {
        buf.p1((energy / 100) | 0);
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [ServerProt.RESET_ANIMS]: (_buf: Packet) => {},
    [ServerProt.UPDATE_UID192]: (buf: Packet, uid: number) => {
        buf.p2(uid);
    },
    [ServerProt.LAST_LOGIN_INFO]: (buf: Packet, lastLoginIp: number, daysSinceLogin: number, daysSinceRecoveryChange: number, unreadMessageCount: number) => {
        buf.p4(lastLoginIp);
        buf.p2(daysSinceLogin);
        buf.p1(daysSinceRecoveryChange);
        buf.p2(unreadMessageCount);
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [ServerProt.LOGOUT]: (_buf: Packet) => {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [ServerProt.P_COUNTDIALOG]: (_buf: Packet) => {},
    [ServerProt.SET_MULTIWAY]: (buf: Packet, state: boolean) => {
        buf.pbool(state);
    },

    [ServerProt.DATA_LOC_DONE]: (buf: Packet, x: number, z: number) => {
        buf.p1(x);
        buf.p1(z);
    },
    [ServerProt.DATA_LAND_DONE]: (buf: Packet, x: number, z: number) => {
        buf.p1(x);
        buf.p1(z);
    },
    [ServerProt.DATA_LAND]: (buf: Packet, x: number, z: number, offset: number, length: number, data: Uint8Array) => {
        buf.p1(x);
        buf.p1(z);
        buf.p2(offset);
        buf.p2(length);
        buf.pdata(data);
    },
    [ServerProt.DATA_LOC]: (buf: Packet, x: number, z: number, offset: number, length: number, data: Uint8Array) => {
        buf.p1(x);
        buf.p1(z);
        buf.p2(offset);
        buf.p2(length);
        buf.pdata(data);
    },
    [ServerProt.REBUILD_NORMAL]: (buf: Packet, zoneX: number, zoneZ: number, mapsquareX: number[], mapsquareZ: number[], landCrc: number[], locCrc: number[]) => {
        buf.p2(zoneX);
        buf.p2(zoneZ);

        for (let i = 0; i < mapsquareX.length; i++) {
            buf.p1(mapsquareX[i]);
            buf.p1(mapsquareZ[i]);
            buf.p4(landCrc[i]);
            buf.p4(locCrc[i]);
        }
    },

    [ServerProt.VARP_SMALL]: (buf: Packet, varp: number, value: number) => {
        buf.p2(varp);
        buf.p1(value);
    },
    [ServerProt.VARP_LARGE]: (buf: Packet, varp: number, value: number) => {
        buf.p2(varp);
        buf.p4(value);
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [ServerProt.RESET_CLIENT_VARCACHE]: (_buf: Packet) => {},

    [ServerProt.SYNTH_SOUND]: (buf: Packet, sound: number, loops: number, delay: number) => {
        buf.p2(sound);
        buf.p1(loops);
        buf.p2(delay);
    },
    [ServerProt.MIDI_SONG]: (buf: Packet, name: string, crc: number, length: number) => {
        buf.pjstr(name);
        buf.p4(crc);
        buf.p4(length);
    },
    [ServerProt.MIDI_JINGLE]: (buf: Packet, delay: number, data: Uint8Array) => {
        buf.p2(delay);
        buf.p4(data.length);
        buf.pdata(data);
    },

    [ServerProt.UPDATE_ZONE_PARTIAL_FOLLOWS]: (buf: Packet, zoneX: number, zoneZ: number, originX: number, originZ: number) => {
        buf.p1((zoneX << 3) - Position.zoneOrigin(originX));
        buf.p1((zoneZ << 3) - Position.zoneOrigin(originZ));
    },
    [ServerProt.UPDATE_ZONE_FULL_FOLLOWS]: (buf: Packet, zoneX: number, zoneZ: number, originX: number, originZ: number) => {
        buf.p1((zoneX << 3) - Position.zoneOrigin(originX));
        buf.p1((zoneZ << 3) - Position.zoneOrigin(originZ));
    },
    [ServerProt.UPDATE_ZONE_PARTIAL_ENCLOSED]: (buf: Packet, zoneX: number, zoneZ: number, originX: number, originZ: number, data: Uint8Array) => {
        buf.p1((zoneX << 3) - Position.zoneOrigin(originX));
        buf.p1((zoneZ << 3) - Position.zoneOrigin(originZ));
        buf.pdata(data);
    },

    // merge player with loc, e.g. agility training through pipes
    // useful for draw prioritizes
    [ServerProt.LOC_MERGE]: (buf: Packet, srcX: number, srcZ: number, shape: number, angle: number, loc: number, startCycle: number, endCycle: number, pid: number, east: number, south: number, west: number, north: number) => {
        buf.p1(((srcX & 0x7) << 4) | (srcZ & 0x7));
        buf.p1((shape << 2) | (angle & 3));
        buf.p2(loc);
        buf.p2(startCycle);
        buf.p2(endCycle);
        buf.p2(pid);
        buf.p1(east - srcX);
        buf.p1(south - srcZ);
        buf.p1(west - srcX);
        buf.p1(north - srcZ);
    },
    [ServerProt.LOC_ANIM]: (buf: Packet, srcX: number, srcZ: number, shape: number, angle: number, loc: number) => {
        buf.p1(((srcX & 0x7) << 4) | (srcZ & 0x7));
        buf.p1((shape << 2) | (angle & 3));
        buf.p2(loc);
    },
    [ServerProt.OBJ_DEL]: (buf: Packet, srcX: number, srcZ: number, obj: number) => {
        buf.p1(((srcX & 0x7) << 4) | (srcZ & 0x7));
        buf.p2(obj);
    },
    [ServerProt.OBJ_REVEAL]: (buf: Packet, srcX: number, srcZ: number, obj: number, count: number, owner: number) => {
        buf.p1(((srcX & 0x7) << 4) | (srcZ & 0x7));
        buf.p2(obj);
        buf.p2(count);
        buf.p2(owner);
    },
    [ServerProt.LOC_ADD_CHANGE]: (buf: Packet, srcX: number, srcZ: number, shape: number, angle: number, loc: number) => {
        buf.p1(((srcX & 0x7) << 4) | (srcZ & 0x7));
        buf.p1((shape << 2) | (angle & 3));
        buf.p2(loc);
    },
    [ServerProt.MAP_PROJANIM]: (buf: Packet, srcX: number, srcZ: number, dstX: number, dstZ: number, target: number, spotanim: number, srcHeight: number, dstHeight: number, startDelay: number, endDelay: number, peak: number, arc: number) => {
        buf.p1(((srcX & 0x7) << 4) | (srcZ & 0x7));
        buf.p1(dstX - srcX);
        buf.p1(dstZ - srcZ);
        buf.p2(target); // 0: coord, > 0: npc, < 0: player
        buf.p2(spotanim);
        buf.p1(srcHeight);
        buf.p1(dstHeight);
        buf.p2(startDelay);
        buf.p2(endDelay);
        buf.p1(peak);
        buf.p1(arc);
    },
    [ServerProt.LOC_DEL]: (buf: Packet, srcX: number, srcZ: number, shape: number, angle: number) => {
        buf.p1(((srcX & 0x7) << 4) | (srcZ & 0x7));
        buf.p1((shape << 2) | (angle & 3));
    },
    [ServerProt.OBJ_COUNT]: (buf: Packet, srcX: number, srcZ: number, obj: number, count: number) => {
        buf.p1(((srcX & 0x7) << 4) | (srcZ & 0x7));
        buf.p2(obj);
        buf.p2(Math.min(count, 65536));
    },
    [ServerProt.MAP_ANIM]: (buf: Packet, srcX: number, srcZ: number, spotanim: number, height: number, delay: number) => {
        buf.p1(((srcX & 0x7) << 4) | (srcZ & 0x7));
        buf.p2(spotanim);
        buf.p1(height);
        buf.p2(delay);
    },
    [ServerProt.OBJ_ADD]: (buf: Packet, srcX: number, srcZ: number, obj: number, count: number) => {
        buf.p1(((srcX & 0x7) << 4) | (srcZ & 0x7));
        buf.p2(obj);
        buf.p2(Math.min(count, 65536));
    }
};
