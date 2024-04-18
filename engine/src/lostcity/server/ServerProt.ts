import Packet from '#jagex2/io/Packet.js';

import WordPack from '#jagex2/wordenc/WordPack.js';

import Component from '#lostcity/cache/Component.js';
import WordEnc from '#lostcity/cache/WordEnc.js';

import { Inventory } from '#lostcity/engine/Inventory.js';

import { Position } from '#lostcity/entity/Position.js';

export default class ServerProt {
    static readonly all: ServerProt[] = [];
    static readonly byId: ServerProt[] = [];

    // interfaces
    static readonly IF_OPENCHATMODAL = new ServerProt(14, 2);
    static readonly IF_OPENMAINSIDEMODAL = new ServerProt(28, 4);
    static readonly IF_CLOSE = new ServerProt(129, 0); // NXT has "IF_CLOSESUB"
    static readonly IF_OPENSIDEOVERLAY = new ServerProt(167, 3);
    static readonly IF_OPENMAINMODAL = new ServerProt(168, 2);
    static readonly IF_OPENSIDEMODAL = new ServerProt(195, 2);

    // updating interfaces
    static readonly IF_SETCOLOUR = new ServerProt(2, 4); // NXT naming
    static readonly IF_SETHIDE = new ServerProt(26, 3); // NXT naming
    static readonly IF_SETOBJECT = new ServerProt(46, 6); // NXT naming
    static readonly IF_SHOWSIDE = new ServerProt(84, 1);
    static readonly IF_SETMODEL = new ServerProt(87, 4); // NXT naming
    static readonly IF_SETRECOL = new ServerProt(103, 6); // NXT naming
    static readonly IF_SETANIM = new ServerProt(146, 4); // NXT naming
    static readonly IF_SETPLAYERHEAD = new ServerProt(197, 2); // NXT naming
    static readonly IF_SETTEXT = new ServerProt(201, -2); // NXT naming
    static readonly IF_SETNPCHEAD = new ServerProt(204, 4); // NXT naming
    static readonly IF_SETPOSITION = new ServerProt(209, 6); // NXT naming

    // tutorial area
    static readonly TUTORIAL_FLASHSIDE = new ServerProt(126, 1);
    static readonly TUTORIAL_OPENCHAT = new ServerProt(185, 2);

    // inventory
    static readonly UPDATE_INV_STOP_TRANSMIT = new ServerProt(15, 2); // NXT naming
    static readonly UPDATE_INV_FULL = new ServerProt(98, -2); // NXT naming
    static readonly UPDATE_INV_PARTIAL = new ServerProt(213, -2); // NXT naming

    // camera control
    static readonly CAM_LOOKAT = new ServerProt(74, 6); // NXT naming
    static readonly CAM_SHAKE = new ServerProt(13, 4); // NXT naming
    static readonly CAM_MOVETO = new ServerProt(3, 6); // NXT naming
    static readonly CAM_RESET = new ServerProt(239, 0); // NXT naming

    // entity updates
    static readonly NPC_INFO = new ServerProt(1, -2); // NXT naming
    static readonly PLAYER_INFO = new ServerProt(184, -2); // NXT naming

    // input tracking
    static readonly FINISH_TRACKING = new ServerProt(133, 0);
    static readonly ENABLE_TRACKING = new ServerProt(226, 0);

    // social
    static readonly MESSAGE_GAME = new ServerProt(4, -1); // NXT naming
    static readonly UPDATE_IGNORELIST = new ServerProt(21, -2); // NXT naming
    static readonly CHAT_FILTER_SETTINGS = new ServerProt(32, 3); // NXT naming
    static readonly MESSAGE_PRIVATE = new ServerProt(41, -1); // NXT naming
    static readonly UPDATE_FRIENDLIST = new ServerProt(152, 9); // NXT naming

    // misc
    static readonly UNSET_MAP_FLAG = new ServerProt(19, 0); // NXT has "SET_MAP_FLAG" but we cannot control the position
    static readonly UPDATE_RUNWEIGHT = new ServerProt(22, 2); // NXT naming
    static readonly HINT_ARROW = new ServerProt(25, 6); // NXT naming
    static readonly UPDATE_REBOOT_TIMER = new ServerProt(43, 2); // NXT naming
    static readonly UPDATE_STAT = new ServerProt(44, 6); // NXT naming
    static readonly UPDATE_RUNENERGY = new ServerProt(68, 1); // NXT naming
    static readonly RESET_ANIMS = new ServerProt(136, 0); // NXT naming
    static readonly UPDATE_UID192 = new ServerProt(139, 2); // NXT naming (not 100% certain if "uid192" means local player)
    static readonly LAST_LOGIN_INFO = new ServerProt(140, 9); // NXT naming
    static readonly LOGOUT = new ServerProt(142, 0); // NXT naming
    static readonly P_COUNTDIALOG = new ServerProt(243, 0); // named after runescript command + client resume_p_countdialog packet
    static readonly SET_MULTIWAY = new ServerProt(254, 1);

    // maps
    static readonly DATA_LOC_DONE = new ServerProt(20, 2);
    static readonly DATA_LAND_DONE = new ServerProt(80, 2);
    static readonly DATA_LAND = new ServerProt(132, -2);
    static readonly DATA_LOC = new ServerProt(220, -2);
    static readonly REBUILD_NORMAL = new ServerProt(237, -2); // NXT naming (do we really need _normal if there's no region rebuild?)

    // vars
    static readonly VARP_SMALL = new ServerProt(150, 3); // NXT naming
    static readonly VARP_LARGE = new ServerProt(175, 6); // NXT naming
    static readonly RESET_CLIENT_VARCACHE = new ServerProt(193, 0); // NXT naming

    // audio
    static readonly SYNTH_SOUND = new ServerProt(12, 5); // NXT naming
    static readonly MIDI_SONG = new ServerProt(54, -1); // NXT naming
    static readonly MIDI_JINGLE = new ServerProt(212, -2); // NXT naming

    // zones
    static readonly UPDATE_ZONE_PARTIAL_FOLLOWS = new ServerProt(7, 2); // NXT naming
    static readonly UPDATE_ZONE_FULL_FOLLOWS = new ServerProt(135, 2); // NXT naming
    static readonly UPDATE_ZONE_PARTIAL_ENCLOSED = new ServerProt(162, -2); // NXT naming

    // zone protocol
    static readonly LOC_MERGE = new ServerProt(23, 14); // based on runescript command p_locmerge
    static readonly LOC_ANIM = new ServerProt(42, 4); // NXT naming
    static readonly OBJ_DEL = new ServerProt(49, 3); // NXT naming
    static readonly OBJ_REVEAL = new ServerProt(50, 7); // NXT naming
    static readonly LOC_ADD_CHANGE = new ServerProt(59, 4); // NXT naming
    static readonly MAP_PROJANIM = new ServerProt(69, 15); // NXT naming
    static readonly LOC_DEL = new ServerProt(76, 2); // NXT naming
    static readonly OBJ_COUNT = new ServerProt(151, 7); // NXT naming
    static readonly MAP_ANIM = new ServerProt(191, 6); // NXT naming
    static readonly OBJ_ADD = new ServerProt(223, 5); // NXT naming

    constructor(readonly id: number, readonly length: number) {
        ServerProt.all.push(this); // no known index
        ServerProt.byId[id] = this;
    }
}

// TODO: come up with another solution that preserves type-safety?
export const ServerProtEncoders: {
    [key: number]: (buf: Packet, ...args: any[]) => void;
} = {
    [ServerProt.IF_OPENCHATMODAL.id]: (buf: Packet, com: number) => {
        buf.p2(com);
    },
    [ServerProt.IF_OPENMAINSIDEMODAL.id]: (buf: Packet, comMain: number, comSide: number) => {
        buf.p2(comMain);
        buf.p2(comSide);
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [ServerProt.IF_CLOSE.id]: (_buf: Packet) => {},
    [ServerProt.IF_OPENSIDEOVERLAY.id]: (buf: Packet, com: number, tab: number) => {
        buf.p2(com);
        buf.p1(tab);
    },
    [ServerProt.IF_OPENMAINMODAL.id]: (buf: Packet, com: number) => {
        buf.p2(com);
    },
    [ServerProt.IF_OPENSIDEMODAL.id]: (buf: Packet, com: number) => {
        buf.p2(com);
    },

    [ServerProt.IF_SETCOLOUR.id]: (buf: Packet, com: number, colour: number) => {
        buf.p2(com);
        buf.p2(colour);
    },
    [ServerProt.IF_SETHIDE.id]: (buf: Packet, com: number, state: boolean) => {
        buf.p2(com);
        buf.pbool(state);
    },
    [ServerProt.IF_SETOBJECT.id]: (buf: Packet, com: number, obj: number, scale: number) => {
        buf.p2(com);
        buf.p2(obj);
        buf.p2(scale);
    },
    [ServerProt.IF_SHOWSIDE.id]: (buf: Packet, tab: number) => {
        buf.p1(tab);
    },
    [ServerProt.IF_SETMODEL.id]: (buf: Packet, com: number, model: number) => {
        buf.p2(com);
        buf.p2(model);
    },
    [ServerProt.IF_SETRECOL.id]: (buf: Packet, com: number, src: number, dest: number) => {
        buf.p2(com);
        buf.p2(src);
        buf.p2(dest);
    },
    [ServerProt.IF_SETANIM.id]: (buf: Packet, com: number, seq: number) => {
        buf.p2(com);
        buf.p2(seq);
    },
    [ServerProt.IF_SETPLAYERHEAD.id]: (buf: Packet, com: number) => {
        buf.p2(com);
    },
    [ServerProt.IF_SETTEXT.id]: (buf: Packet, com: number, text: string) => {
        buf.p2(com);
        buf.pjstr(text);
    },
    [ServerProt.IF_SETNPCHEAD.id]: (buf: Packet, com: number, npc: number) => {
        buf.p2(com);
        buf.p2(npc);
    },
    [ServerProt.IF_SETPOSITION.id]: (buf: Packet, com: number, x: number, y: number) => {
        buf.p2(com);
        buf.p2(x);
        buf.p2(y);
    },

    [ServerProt.TUTORIAL_FLASHSIDE.id]: (buf: Packet, tab: number) => {
        buf.p1(tab);
    },
    [ServerProt.TUTORIAL_OPENCHAT.id]: (buf: Packet, com: number) => {
        buf.p2(com);
    },

    [ServerProt.UPDATE_INV_STOP_TRANSMIT.id]: (buf: Packet, com: number) => {
        buf.p2(com);
    },
    [ServerProt.UPDATE_INV_FULL.id]: (buf: Packet, com: number, inv: Inventory) => {
        const comType = Component.get(com);
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
    [ServerProt.UPDATE_INV_PARTIAL.id]: (buf: Packet, com: number, inv: Inventory, slots: number[] = []) => {
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

    [ServerProt.CAM_LOOKAT.id]: (buf: Packet, x: number, z: number, height: number, rotationSpeed: number, rotationMultiplier: number) => {
        buf.p1(x);
        buf.p1(z);
        buf.p2(height);
        buf.p1(rotationSpeed);
        buf.p1(rotationMultiplier);
    },
    [ServerProt.CAM_SHAKE.id]: (buf: Packet, type: number, jitter: number, amplitude: number, frequency: number) => {
        buf.p1(type); // direction?
        buf.p1(jitter);
        buf.p1(amplitude);
        buf.p1(frequency);
    },
    [ServerProt.CAM_MOVETO.id]: (buf: Packet, x: number, z: number, height: number, rotationSpeed: number, rotationMultiplier: number) => {
        buf.p1(x);
        buf.p1(z);
        buf.p2(height);
        buf.p1(rotationSpeed);
        buf.p1(rotationMultiplier);
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [ServerProt.CAM_RESET.id]: (_buf: Packet) => {},

    [ServerProt.NPC_INFO.id]: (buf: Packet, bitBlock: Packet, byteBlock: Packet) => {
        buf.pdata(bitBlock);
        buf.pdata(byteBlock);
    },
    [ServerProt.PLAYER_INFO.id]: (buf: Packet, bitBlock: Packet, byteBlock: Packet) => {
        buf.pdata(bitBlock);
        buf.pdata(byteBlock);
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [ServerProt.FINISH_TRACKING.id]: (_buf: Packet) => {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [ServerProt.ENABLE_TRACKING.id]: (_buf: Packet) => {},

    [ServerProt.MESSAGE_GAME.id]: (buf: Packet, msg: string) => {
        buf.pjstr(msg);
    },
    [ServerProt.UPDATE_IGNORELIST.id]: (buf: Packet, names: bigint[]) => {
        for (const name of names) {
            buf.p8(name);
        }
    },
    [ServerProt.CHAT_FILTER_SETTINGS.id]: (buf: Packet, publicChat: number, privateChat: number, tradeDuel: number) => {
        buf.p1(publicChat);
        buf.p1(privateChat);
        buf.p1(tradeDuel);
    },
    [ServerProt.MESSAGE_PRIVATE.id]: (buf: Packet, from: bigint, messageId: number, staffModLevel: number, msg: string) => {
        buf.p8(from);
        buf.p4(messageId);
        buf.p1(staffModLevel);
        WordPack.pack(buf, WordEnc.filter(msg));
    },
    [ServerProt.UPDATE_FRIENDLIST.id]: (buf: Packet, name: bigint, nodeId: number) => {
        buf.p8(name);
        buf.p1(nodeId);
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [ServerProt.UNSET_MAP_FLAG.id]: (_buf: Packet) => {},
    [ServerProt.UPDATE_RUNWEIGHT.id]: (buf: Packet, kg: number) => {
        buf.p2(kg);
    },
    [ServerProt.HINT_ARROW.id]: (buf: Packet, type: number, nid: number, pid: number, x: number, z: number, y: number) => {
        if (type === 1) {
            buf.p1(type);
            buf.p2(nid);
            buf.p2(0);
            buf.p1(0);
        } else if (type >= 2 && type <= 6) {
            // 2 - 64, 64 offset - centered
            // 3 - 0, 64 offset - far left
            // 4 - 128, 64 offset - far right
            // 5 - 64, 0 offset - bottom left
            // 6 - 64, 128 offset - top left

            buf.p1(type);
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
    [ServerProt.UPDATE_REBOOT_TIMER.id]: (buf: Packet, ticks: number) => {
        buf.p2(ticks);
    },
    [ServerProt.UPDATE_STAT.id]: (buf: Packet, stat: number, exp: number, level: number) => {
        buf.p1(stat);
        buf.p4(exp / 10);
        buf.p1(level); // not base level
    },
    [ServerProt.UPDATE_RUNENERGY.id]: (buf: Packet, energy: number) => {
        buf.p1((energy / 100) | 0);
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [ServerProt.RESET_ANIMS.id]: (_buf: Packet) => {},
    [ServerProt.UPDATE_UID192.id]: (buf: Packet, uid: number) => {
        buf.p2(uid);
    },
    [ServerProt.LAST_LOGIN_INFO.id]: (buf: Packet, lastLoginIp: number, daysSinceLogin: number, daysSinceRecoveryChange: number, unreadMessageCount: number) => {
        buf.p4(lastLoginIp);
        buf.p2(daysSinceLogin);
        buf.p1(daysSinceRecoveryChange);
        buf.p2(unreadMessageCount);
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [ServerProt.LOGOUT.id]: (_buf: Packet) => {},
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [ServerProt.P_COUNTDIALOG.id]: (_buf: Packet) => {},
    [ServerProt.SET_MULTIWAY.id]: (buf: Packet, state: boolean) => {
        buf.pbool(state);
    },

    [ServerProt.DATA_LOC_DONE.id]: (buf: Packet, x: number, z: number) => {
        buf.p1(x);
        buf.p1(z);
    },
    [ServerProt.DATA_LAND_DONE.id]: (buf: Packet, x: number, z: number) => {
        buf.p1(x);
        buf.p1(z);
    },
    [ServerProt.DATA_LAND.id]: (buf: Packet, x: number, z: number, offset: number, length: number, data: Uint8Array) => {
        buf.p1(x);
        buf.p1(z);
        buf.p2(offset);
        buf.p2(length);
        buf.pdata(data);
    },
    [ServerProt.DATA_LOC.id]: (buf: Packet, x: number, z: number, offset: number, length: number, data: Uint8Array) => {
        buf.p1(x);
        buf.p1(z);
        buf.p2(offset);
        buf.p2(length);
        buf.pdata(data);
    },
    [ServerProt.REBUILD_NORMAL.id]: (buf: Packet, zoneX: number, zoneZ: number, mapsquareX: number[], mapsquareZ: number[], landCrc: number[], locCrc: number[]) => {
        buf.p2(zoneX);
        buf.p2(zoneZ);

        for (let i = 0; i < mapsquareX.length; i++) {
            buf.p1(mapsquareX[i]);
            buf.p1(mapsquareZ[i]);
            buf.p4(landCrc[i]);
            buf.p4(locCrc[i]);
        }
    },

    [ServerProt.VARP_SMALL.id]: (buf: Packet, varp: number, value: number) => {
        buf.p2(varp);
        buf.p1(value);
    },
    [ServerProt.VARP_LARGE.id]: (buf: Packet, varp: number, value: number) => {
        buf.p2(varp);
        buf.p4(value);
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    [ServerProt.RESET_CLIENT_VARCACHE.id]: (_buf: Packet) => {},

    [ServerProt.SYNTH_SOUND.id]: (buf: Packet, sound: number, loops: number, delay: number) => {
        buf.p2(sound);
        buf.p1(loops);
        buf.p2(delay);
    },
    [ServerProt.MIDI_SONG.id]: (buf: Packet, name: string, crc: number, length: number) => {
        buf.pjstr(name);
        buf.p4(crc);
        buf.p4(length);
    },
    [ServerProt.MIDI_JINGLE.id]: (buf: Packet, delay: number, data: Uint8Array) => {
        buf.p2(delay);
        buf.p4(data.length);
        buf.pdata(data);
    },

    [ServerProt.UPDATE_ZONE_PARTIAL_FOLLOWS.id]: (buf: Packet, zoneX: number, zoneZ: number, originX: number, originZ: number) => {
        buf.p1((zoneX << 3) - Position.zoneOrigin(originX));
        buf.p1((zoneZ << 3) - Position.zoneOrigin(originZ));
    },
    [ServerProt.UPDATE_ZONE_FULL_FOLLOWS.id]: (buf: Packet, zoneX: number, zoneZ: number, originX: number, originZ: number) => {
        buf.p1((zoneX << 3) - Position.zoneOrigin(originX));
        buf.p1((zoneZ << 3) - Position.zoneOrigin(originZ));
    },
    [ServerProt.UPDATE_ZONE_PARTIAL_ENCLOSED.id]: (buf: Packet, zoneX: number, zoneZ: number, originX: number, originZ: number, data: Uint8Array) => {
        buf.p1((zoneX << 3) - Position.zoneOrigin(originX));
        buf.p1((zoneZ << 3) - Position.zoneOrigin(originZ));
        buf.pdata(data);
    },

    // merge player with loc, e.g. agility training through pipes
    // useful for draw prioritizes
    [ServerProt.LOC_MERGE.id]: (buf: Packet, srcX: number, srcZ: number, shape: number, angle: number, loc: number, startCycle: number, endCycle: number, pid: number, east: number, south: number, west: number, north: number) => {
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
    [ServerProt.LOC_ANIM.id]: (buf: Packet, srcX: number, srcZ: number, shape: number, angle: number, loc: number) => {
        buf.p1(((srcX & 0x7) << 4) | (srcZ & 0x7));
        buf.p1((shape << 2) | (angle & 3));
        buf.p2(loc);
    },
    [ServerProt.OBJ_DEL.id]: (buf: Packet, srcX: number, srcZ: number, obj: number) => {
        buf.p1(((srcX & 0x7) << 4) | (srcZ & 0x7));
        buf.p2(obj);
    },
    [ServerProt.OBJ_REVEAL.id]: (buf: Packet, srcX: number, srcZ: number, obj: number, count: number, owner: number) => {
        buf.p1(((srcX & 0x7) << 4) | (srcZ & 0x7));
        buf.p2(obj);
        buf.p2(count);
        buf.p2(owner);
    },
    [ServerProt.LOC_ADD_CHANGE.id]: (buf: Packet, srcX: number, srcZ: number, shape: number, angle: number, loc: number) => {
        buf.p1(((srcX & 0x7) << 4) | (srcZ & 0x7));
        buf.p1((shape << 2) | (angle & 3));
        buf.p2(loc);
    },
    [ServerProt.MAP_PROJANIM.id]: (buf: Packet, srcX: number, srcZ: number, dstX: number, dstZ: number, target: number, spotanim: number, srcHeight: number, dstHeight: number, startDelay: number, endDelay: number, peak: number, arc: number) => {
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
    [ServerProt.LOC_DEL.id]: (buf: Packet, srcX: number, srcZ: number, shape: number, angle: number) => {
        buf.p1(((srcX & 0x7) << 4) | (srcZ & 0x7));
        buf.p1((shape << 2) | (angle & 3));
    },
    [ServerProt.OBJ_COUNT.id]: (buf: Packet, srcX: number, srcZ: number, obj: number, count: number) => {
        buf.p1(((srcX & 0x7) << 4) | (srcZ & 0x7));
        buf.p2(obj);
        buf.p2(Math.min(count, 65536));
    },
    [ServerProt.MAP_ANIM.id]: (buf: Packet, srcX: number, srcZ: number, spotanim: number, height: number, delay: number) => {
        buf.p1(((srcX & 0x7) << 4) | (srcZ & 0x7));
        buf.p2(spotanim);
        buf.p1(height);
        buf.p2(delay);
    },
    [ServerProt.OBJ_ADD.id]: (buf: Packet, srcX: number, srcZ: number, obj: number, count: number) => {
        buf.p1(((srcX & 0x7) << 4) | (srcZ & 0x7));
        buf.p2(obj);
        buf.p2(Math.min(count, 65536));
    }
};
