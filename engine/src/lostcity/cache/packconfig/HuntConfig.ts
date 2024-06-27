import {
    ConfigValue,
    ConfigLine,
    PackedData,
    isConfigBoolean,
    getConfigBoolean,
    HuntCheckInv, HuntCheckInvParam
} from '#lostcity/cache/packconfig/PackShared.js';

import {Inventory} from '#lostcity/engine/Inventory.js';

import HuntModeType from '#lostcity/entity/hunt/HuntModeType.js';
import HuntVis from '#lostcity/entity/hunt/HuntVis.js';
import HuntCheckNotTooStrong from '#lostcity/entity/hunt/HuntCheckNotTooStrong.js';
import HuntNobodyNear from '#lostcity/entity/hunt/HuntNobodyNear.js';
import NpcMode from '#lostcity/entity/NpcMode.js';

import {
    CategoryPack,
    HuntPack,
    InvPack,
    LocPack,
    NpcPack,
    ObjPack, ParamPack,
    VarnPack,
    VarpPack
} from '#lostcity/util/PackFile.js';

export function parseHuntConfig(key: string, value: string): ConfigValue | null | undefined {
    const stringKeys: string[] = [];
    // prettier-ignore
    const numberKeys: string[] = [
        'rate'
    ];
    const booleanKeys: string[] = [];

    if (stringKeys.includes(key)) {
        if (value.length > 1000) {
            // arbitrary limit
            return null;
        }

        return value;
    } else if (numberKeys.includes(key)) {
        let number;
        if (value.startsWith('0x')) {
            // check that the string contains only hexadecimal characters, and minus sign if applicable
            if (!/^-?[0-9a-fA-F]+$/.test(value.slice(2))) {
                return null;
            }

            number = parseInt(value, 16);
        } else {
            // check that the string contains only numeric characters, and minus sign if applicable
            if (!/^-?[0-9]+$/.test(value)) {
                return null;
            }

            number = parseInt(value);
        }

        if (Number.isNaN(number)) {
            return null;
        }

        if (key === 'rate' && (number < 1 || number > 255)) {
            // min of 1 tick
            return null;
        }

        return number;
    } else if (booleanKeys.includes(key)) {
        if (!isConfigBoolean(value)) {
            return null;
        }

        return getConfigBoolean(value);
    } else if (key === 'type') {
        switch (value) {
            case 'off':
                return HuntModeType.OFF;
            case 'player':
                return HuntModeType.PLAYER;
            case 'npc':
                return HuntModeType.NPC;
            case 'obj':
                return HuntModeType.OBJ;
            case 'scenery':
                // loc ?
                return HuntModeType.SCENERY;
            default:
                return null;
        }
    } else if (key === 'check_vis') {
        switch (value) {
            case 'off':
                return HuntVis.OFF;
            case 'lineofsight':
                return HuntVis.LINEOFSIGHT;
            case 'lineofwalk':
                return HuntVis.LINEOFWALK;
            default:
                return null;
        }
    } else if (key === 'check_nottoostrong') {
        switch (value) {
            case 'off':
                return HuntCheckNotTooStrong.OFF;
            case 'outside_wilderness':
                return HuntCheckNotTooStrong.OUTSIDE_WILDERNESS;
            default:
                return null;
        }
    } else if (key === 'check_notcombat') {
        if (!value.startsWith('%')) {
            return null;
        }

        value = value.slice(1);

        const index = VarpPack.getByName(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else if (key === 'check_notcombat_self') {
        if (!value.startsWith('%')) {
            return null;
        }

        value = value.slice(1);

        const index = VarnPack.getByName(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else if (key === 'check_notbusy') {
        switch (value) {
            case 'off':
                return false;
            case 'on':
                return true;
            default:
                return null;
        }
    } else if (key === 'find_keephunting') {
        switch (value) {
            case 'off':
                return false;
            case 'on':
                return true;
            default:
                return null;
        }
    } else if (key === 'find_newmode') {
        if (value === 'opplayer1') {
            return NpcMode.OPPLAYER1;
        } else if (value === 'opplayer2') {
            return NpcMode.OPPLAYER2;
        } else if (value === 'opplayer3') {
            return NpcMode.OPPLAYER3;
        } else if (value === 'opplayer4') {
            return NpcMode.OPPLAYER4;
        } else if (value === 'opplayer5') {
            return NpcMode.OPPLAYER5;
        } else if (value === 'applayer1') {
            return NpcMode.APPLAYER1;
        } else if (value === 'applayer2') {
            return NpcMode.APPLAYER2;
        } else if (value === 'applayer3') {
            return NpcMode.APPLAYER3;
        } else if (value === 'applayer4') {
            return NpcMode.APPLAYER4;
        } else if (value === 'applayer5') {
            return NpcMode.APPLAYER5;
        } else if (value === 'queue1') {
            return NpcMode.QUEUE1;
        } else if (value === 'queue2') {
            return NpcMode.QUEUE2;
        } else if (value === 'queue3') {
            return NpcMode.QUEUE3;
        } else if (value === 'queue4') {
            return NpcMode.QUEUE4;
        } else if (value === 'queue5') {
            return NpcMode.QUEUE5;
        } else if (value === 'queue6') {
            return NpcMode.QUEUE6;
        } else if (value === 'queue7') {
            return NpcMode.QUEUE7;
        } else if (value === 'queue8') {
            return NpcMode.QUEUE8;
        } else if (value === 'queue9') {
            return NpcMode.QUEUE9;
        } else if (value === 'queue10') {
            return NpcMode.QUEUE10;
        } else if (value === 'queue11') {
            return NpcMode.QUEUE11;
        } else if (value === 'queue12') {
            return NpcMode.QUEUE12;
        } else if (value === 'queue13') {
            return NpcMode.QUEUE13;
        } else if (value === 'queue14') {
            return NpcMode.QUEUE14;
        } else if (value === 'queue15') {
            return NpcMode.QUEUE15;
        } else if (value === 'queue16') {
            return NpcMode.QUEUE16;
        } else if (value === 'queue17') {
            return NpcMode.QUEUE17;
        } else if (value === 'queue18') {
            return NpcMode.QUEUE18;
        } else if (value === 'queue19') {
            return NpcMode.QUEUE19;
        } else if (value === 'queue20') {
            return NpcMode.QUEUE20;
        } else if (value === 'opobj1') {
            return NpcMode.OPOBJ1;
        } else if (value === 'opobj2') {
            return NpcMode.OPOBJ1;
        } else if (value === 'opobj3') {
            return NpcMode.OPOBJ3;
        } else if (value === 'opobj4') {
            return NpcMode.OPOBJ4;
        } else if (value === 'opobj5') {
            return NpcMode.OPOBJ5;
        } else if (value === 'apobj1') {
            return NpcMode.APOBJ1;
        } else if (value === 'apobj2') {
            return NpcMode.APOBJ2;
        } else if (value === 'apobj3') {
            return NpcMode.APOBJ3;
        } else if (value === 'apobj4') {
            return NpcMode.APOBJ4;
        } else if (value === 'apobj5') {
            return NpcMode.APOBJ5;
        } else if (value === 'opnpc1') {
            return NpcMode.OPNPC1;
        } else if (value === 'opnpc2') {
            return NpcMode.OPNPC2;
        } else if (value === 'opnpc3') {
            return NpcMode.OPNPC3;
        } else if (value === 'opnpc4') {
            return NpcMode.OPNPC4;
        } else if (value === 'opnpc5') {
            return NpcMode.OPNPC5;
        } else if (value === 'apnpc1') {
            return NpcMode.APNPC1;
        } else if (value === 'apnpc2') {
            return NpcMode.APNPC2;
        } else if (value === 'apnpc3') {
            return NpcMode.APNPC3;
        } else if (value === 'apnpc4') {
            return NpcMode.APNPC4;
        } else if (value === 'apnpc5') {
            return NpcMode.APNPC5;
        } else if (value === 'oploc1') {
            return NpcMode.OPLOC1;
        } else if (value === 'oploc2') {
            return NpcMode.OPLOC2;
        } else if (value === 'oploc3') {
            return NpcMode.OPLOC3;
        } else if (value === 'oploc4') {
            return NpcMode.OPLOC4;
        } else if (value === 'oploc5') {
            return NpcMode.OPLOC5;
        } else if (value === 'aploc1') {
            return NpcMode.APLOC1;
        } else if (value === 'aploc2') {
            return NpcMode.APLOC2;
        } else if (value === 'aploc3') {
            return NpcMode.APLOC3;
        } else if (value === 'aploc4') {
            return NpcMode.APLOC4;
        } else if (value === 'aploc5') {
            return NpcMode.APLOC5;
        } else {
            return null;
        }
    } else if (key === 'nobodynear') {
        switch (value) {
            case 'keephunting':
                return HuntNobodyNear.KEEPHUNTING;
            case 'pausehunt':
                return HuntNobodyNear.PAUSEHUNT;
            default:
                return null;
        }
    } else if (key === 'check_afk') {
        switch (value) {
            case 'off':
                return false;
            case 'on':
                return true;
            default:
                return null;
        }
    } else if (key === 'check_category') {
        const index = CategoryPack.getByName(value);
        if (index === -1) {
            return null;
        }
        return index;
    } else if (key === 'check_npc') {
        const index = NpcPack.getByName(value);
        if (index === -1) {
            return null;
        }
        return index;
    } else if (key === 'check_obj') {
        const index = ObjPack.getByName(value);
        if (index === -1) {
            return null;
        }
        return index;
    } else if (key === 'check_loc') {
        const index = LocPack.getByName(value);
        if (index === -1) {
            return null;
        }
        return index;
    } else if (key === 'check_inv') {
        // check_inv=inv,obj,min,max
        const parts: string[] = value.split(',');
        if (parts.length !== 4) {
            return null;
        }

        const inv = InvPack.getByName(parts[0]);
        if (inv === -1) {
            return null;
        }

        const obj = ObjPack.getByName(parts[1]);
        if (obj === -1) {
            return null;
        }

        if (!/^-?[0-9]+$/.test(parts[2])) {
            return null;
        }
        const min = parseInt(parts[2]);

        if (!/^-?[0-9]+$/.test(parts[3])) {
            return null;
        }
        const max = parseInt(parts[3]);

        if (min < 0 || min > Inventory.STACK_LIMIT || min > max) {
            return null;
        }

        if (max < 0 || max > Inventory.STACK_LIMIT || max < min) {
            return null;
        }
        return {inv, obj, min, max};
    } else if (key === 'check_invparam') {
        // check_inv=inv,param,min,max
        const parts: string[] = value.split(',');
        if (parts.length !== 4) {
            return null;
        }

        const inv = InvPack.getByName(parts[0]);
        if (inv === -1) {
            return null;
        }

        const param = ParamPack.getByName(parts[1]);
        if (param === -1) {
            return null;
        }

        if (!/^-?[0-9]+$/.test(parts[2])) {
            return null;
        }
        const min = parseInt(parts[2]);

        if (!/^-?[0-9]+$/.test(parts[3])) {
            return null;
        }
        const max = parseInt(parts[3]);

        if (min < 0 || min > Inventory.STACK_LIMIT || min > max) {
            return null;
        }

        if (max < 0 || max > Inventory.STACK_LIMIT || max < min) {
            return null;
        }
        return {inv, param, min, max};
    } else {
        return undefined;
    }
}

export function packHuntConfigs(configs: Map<string, ConfigLine[]>): { client: PackedData, server: PackedData } {
    const client: PackedData = new PackedData(HuntPack.size);
    const server: PackedData = new PackedData(HuntPack.size);

    for (let i = 0; i < HuntPack.size; i++) {
        const debugname = HuntPack.getById(i);
        const config = configs.get(debugname)!;

        for (let j = 0; j < config.length; j++) {
            const { key, value } = config[j];

            if (key === 'type') {
                if (value !== HuntModeType.OFF) {
                    server.p1(1);
                    server.p1(value as number);
                }
            } else if (key === 'check_vis') {
                if (value !== HuntVis.OFF) {
                    server.p1(2);
                    server.p1(value as number);
                }
            } else if (key === 'check_nottoostrong') {
                if (value !== HuntCheckNotTooStrong.OFF) {
                    server.p1(3);
                    server.p1(value as number);
                }
            } else if (key === 'check_notbusy') {
                if (value !== false) {
                    server.p1(4);
                }
            } else if (key === 'find_keephunting') {
                if (value !== false) {
                    server.p1(5);
                }
            } else if (key === 'find_newmode') {
                if (value !== NpcMode.NONE) {
                    server.p1(6);
                    server.p1(value as number);
                }
            } else if (key === 'nobodynear') {
                if (value !== HuntNobodyNear.PAUSEHUNT) {
                    server.p1(7);
                    server.p1(value as number);
                }
            } else if (key === 'check_notcombat') {
                if (value !== null) {
                    server.p1(8);
                    server.p2(value as number);
                }
            } else if (key === 'check_notcombat_self') {
                if (value !== null) {
                    server.p1(9);
                    server.p2(value as number);
                }
            } else if (key === 'check_afk') {
                if (value !== false) {
                    server.p1(10);
                }
            } else if (key === 'rate') {
                if (value !== 1) {
                    server.p1(11);
                    server.p2(value as number);
                }
            } else if (key === 'check_category') {
                if (config.every(x => x.key !== 'check_npc' && x.key !== 'check_obj' && x.key !== 'check_loc' && x.key !== 'check_inv' && x.key !== 'check_invparam') && config.filter(x => x.key === 'type' && (x.value === HuntModeType.NPC || x.value === HuntModeType.OBJ || x.value === HuntModeType.SCENERY)).length > 0) {
                    server.p1(12);
                    server.p2(value as number);
                } else {
                    throw new Error(`Hunt config: [${debugname}] unable to pack line!!!.\nInvalid property value: ${key}=${value}`);
                }
            } else if (key === 'check_npc') {
                if (config.every(x => x.key !== 'check_category' && x.key !== 'check_obj' && x.key !== 'check_loc' && x.key !== 'check_inv' && x.key !== 'check_invparam') && config.filter(x => x.key === 'type' && x.value === HuntModeType.NPC).length > 0) {
                    server.p1(13);
                    server.p2(value as number);
                } else {
                    throw new Error(`Hunt config: [${debugname}] unable to pack line!!!.\nInvalid property value: ${key}=${value}`);
                }
            } else if (key === 'check_obj') {
                if (config.every(x => x.key !== 'check_category' && x.key !== 'check_npc' && x.key !== 'check_loc' && x.key !== 'check_inv' && x.key !== 'check_invparam') && config.filter(x => x.key === 'type' && x.value === HuntModeType.OBJ).length > 0) {
                    server.p1(14);
                    server.p2(value as number);
                } else {
                    throw new Error(`Hunt config: [${debugname}] unable to pack line!!!.\nInvalid property value: ${key}=${value}`);
                }
            } else if (key === 'check_loc') {
                if (config.every(x => x.key !== 'check_category' && x.key !== 'check_npc' && x.key !== 'check_obj' && x.key !== 'check_inv' && x.key !== 'check_invparam') && config.filter(x => x.key === 'type' && x.value === HuntModeType.SCENERY).length > 0) {
                    server.p1(15);
                    server.p2(value as number);
                } else {
                    throw new Error(`Hunt config: [${debugname}] unable to pack line!!!.\nInvalid property value: ${key}=${value}`);
                }
            } else if (key === 'check_inv') {
                if (config.every(x => x.key !== 'check_category' && x.key !== 'check_npc' && x.key !== 'check_obj' && x.key !== 'check_loc' && x.key !== 'check_invparam') && config.filter(x => x.key === 'type' && x.value === HuntModeType.PLAYER).length > 0) {
                    const checkInv: HuntCheckInv = value as HuntCheckInv;
                    server.p1(16);
                    server.p2(checkInv.inv);
                    server.p2(checkInv.obj);
                    server.p4(checkInv.min);
                    server.p4(checkInv.max);
                } else {
                    throw new Error(`Hunt config: [${debugname}] unable to pack line!!!.\nInvalid property value: ${key}=${value}`);
                }
            } else if (key === 'check_invparam') {
                if (config.every(x => x.key !== 'check_category' && x.key !== 'check_npc' && x.key !== 'check_obj' && x.key !== 'check_loc' && x.key !== 'check_inv') && config.filter(x => x.key === 'type' && x.value === HuntModeType.PLAYER).length > 0) {
                    const checkInv: HuntCheckInvParam = value as HuntCheckInvParam;
                    server.p1(17);
                    server.p2(checkInv.inv);
                    server.p2(checkInv.param);
                    server.p4(checkInv.min);
                    server.p4(checkInv.max);
                } else {
                    throw new Error(`Hunt config: [${debugname}] unable to pack line!!!.\nInvalid property value: ${key}=${value}`);
                }
            }
        }

        server.p1(250);
        server.pjstr(debugname);

        client.next();
        server.next();
    }

    return { client, server };
}
