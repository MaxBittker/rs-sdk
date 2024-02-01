import Packet from '#jagex2/io/Packet.js';

import ParamType from '#lostcity/cache/ParamType.js';
import ScriptVarType from '#lostcity/cache/ScriptVarType.js';

import MoveRestrict from '#lostcity/entity/MoveRestrict.js';
import NpcMode from '#lostcity/entity/NpcMode.js';

import { PACKFILE, ParamValue, ConfigValue, ConfigLine } from '#lostcity/tools/packconfig/PackShared.js';
import { lookupParamValue } from '#lostcity/tools/packconfig/ParamConfig.js';
import BlockWalk from '#lostcity/entity/BlockWalk.js';

export function parseNpcConfig(key: string, value: string): ConfigValue | null | undefined {
    // prettier-ignore
    const stringKeys = [
        'name', 'desc',
        'op1', 'op2', 'op3', 'op4', 'op5'
    ];
    // prettier-ignore
    const numberKeys = [
        'size',
        'recol1s', 'recol1d', 'recol2s', 'recol2d', 'recol3s', 'recol3d', 'recol4s', 'recol4d', 'recol5s', 'recol5d', 'recol6s', 'recol6d',
        'resizex', 'resizey', 'resizez', // not actually used in client
        'resizeh', 'resizev',
        'wanderrange', 'maxrange', 'huntrange', 'attackrange',
        'hitpoints', 'attack', 'strength', 'defence', 'magic', 'ranged',
        'timer', 'respawnrate'
    ];
    // prettier-ignore
    const booleanKeys = [
        'hasalpha', 'visonmap', 'members'
    ];

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

        if (key === 'size' && (number < 0 || number > 5)) {
            return null;
        }

        if (key.startsWith('recol') && (number < 0 || number > 65535)) {
            return null;
        }

        if ((key === 'resizex' || key === 'resizey' || key === 'resizez') && (number < 0 || number > 512)) {
            return null;
        }

        if ((key === 'resizeh' || key === 'resizev') && (number < 0 || number > 512)) {
            return null;
        }

        if ((key === 'wanderrange' || key === 'maxrange' || key === 'huntrange' || key === 'attackrange') && (number < 0 || number > 100)) {
            return null;
        }

        if ((key === 'hitpoints' || key === 'attack' || key === 'strength' || key === 'defence' || key === 'magic' || key === 'ranged') && (number < 0 || number > 5000)) {
            return null;
        }

        if (key === 'timer' && (number < 0 || number > 12000)) {
            return null;
        }

        if (key === 'respawnrate' && (number < 0 || number > 12000)) {
            return null;
        }

        return number;
    } else if (booleanKeys.includes(key)) {
        if (value !== 'yes' && value !== 'no') {
            return null;
        }

        return value === 'yes';
    } else if (key.startsWith('model')) {
        const index = PACKFILE.get('model')!.indexOf(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else if (key.startsWith('head')) {
        const index = PACKFILE.get('model')!.indexOf(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else if (key === 'readyanim') {
        const index = PACKFILE.get('seq')!.indexOf(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else if (key === 'walkanim') {
        const index = PACKFILE.get('seq')!.indexOf(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else if (key === 'walkanims') {
        const anims = value.split(',');
        const indices: number[] = [];

        for (const anim of anims) {
            const index = PACKFILE.get('seq')!.indexOf(anim);
            if (index === -1) {
                return null;
            }

            indices.push(index);
        }

        if (indices.length === 0) {
            return null;
        }

        return indices;
    } else if (key === 'vislevel') {
        if (value === 'hide') {
            return 0;
        } else {
            const number = parseInt(value);
            if (isNaN(number)) {
                return null;
            }

            return number;
        }
    } else if (key === 'category') {
        const index = PACKFILE.get('category')!.indexOf(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else if (key === 'param') {
        const paramKey = value.substring(0, value.indexOf(','));
        const param = ParamType.getByName(paramKey);
        if (!param) {
            return null;
        }

        const paramValue = lookupParamValue(param.type, value.substring(value.indexOf(',') + 1));
        if (paramValue === null) {
            return null;
        }

        return {
            id: param.id,
            type: param.type,
            value: paramValue
        };
    } else if (key === 'moverestrict') {
        switch (value) {
            case 'normal':
                return MoveRestrict.NORMAL;
            case 'blocked':
                return MoveRestrict.BLOCKED;
            case 'blocked+normal':
                return MoveRestrict.BLOCKED_NORMAL;
            case 'indoors':
                return MoveRestrict.INDOORS;
            case 'outdoors':
                return MoveRestrict.OUTDOORS;
            case 'nomove':
                return MoveRestrict.NOMOVE;
            case 'passthru':
                return MoveRestrict.PASSTHRU;
            default:
                return null;
        }
    } else if (key === 'blockwalk') {
        switch (value) {
            case 'none':
                return BlockWalk.NONE;
            case 'all':
                return BlockWalk.ALL;
            case 'NPC':
                return BlockWalk.NPC;
            default:
                return null;
        }
    } else if (key === 'huntmode') {
        const index = PACKFILE.get('hunt')!.indexOf(value);
        if (index === -1) {
            return null;
        }
        return index;
    } else if (key === 'defaultmode') {
        switch (value) {
            case 'none':
                return NpcMode.NONE;
            case 'wander':
                return NpcMode.WANDER;
            case 'patrol':
                // TODO patrol points
                return NpcMode.PATROL;
            default:
                return null;
        }
    } else {
        return undefined;
    }
}

function packNpcConfig(configs: Map<string, ConfigLine[]>, transmitAll: boolean) {
    const pack = PACKFILE.get('npc')!;

    const dat = new Packet();
    const idx = new Packet();
    dat.p2(pack.length);
    idx.p2(pack.length);

    for (let i = 0; i < pack.length; i++) {
        const debugname = pack[i];
        const config = configs.get(debugname)!;

        const start = dat.pos;

        // collect these to write at the end
        const recol_s: number[] = [];
        const recol_d: number[] = [];
        let name: string | null = null;
        const models: number[] = [];
        const heads: number[] = [];
        const params: ParamValue[] = [];
        const stats: number[] = [1, 1, 1, 1, 1, 1];
        let vislevel = false;

        for (let j = 0; j < config.length; j++) {
            const { key, value } = config[j];

            if (key === 'name') {
                name = value as string;
            } else if (key.startsWith('model')) {
                const index = parseInt(key.substring('model'.length)) - 1;
                models[index] = value as number;
            } else if (key.startsWith('head')) {
                const index = parseInt(key.substring('head'.length)) - 1;
                heads[index] = value as number;
            } else if (key.startsWith('recol')) {
                const index = parseInt(key.substring('recol'.length, key.length - 1)) - 1;
                if (key.endsWith('s')) {
                    recol_s[index] = value as number;
                } else {
                    recol_d[index] = value as number;
                }
            } else if (key === 'param') {
                params.push(value as ParamValue);
            } else if (key === 'desc') {
                dat.p1(3);
                dat.pjstr(value as string);
            } else if (key === 'size') {
                dat.p1(12);
                dat.p1(value as number);
            } else if (key === 'readyanim') {
                dat.p1(13);
                dat.p2(value as number);
            } else if (key === 'walkanim') {
                dat.p1(14);
                dat.p2(value as number);
            } else if (key === 'hasalpha') {
                if (value === true) {
                    dat.p1(16);
                }
            } else if (key === 'walkanims') {
                dat.p1(17);

                const anims = value as number[];
                dat.p2(anims[0]);
                dat.p2(anims[1]);
                dat.p2(anims[2]);
                dat.p2(anims[3]);
            } else if (key === 'category') {
                if (transmitAll === true) {
                    dat.p1(18);
                    dat.p2(value as number);
                }
            } else if (key.startsWith('op')) {
                const index = parseInt(key.substring('op'.length)) - 1;
                dat.p1(30 + index);
                dat.pjstr(value as string);
            } else if (key === 'resizex') {
                dat.p1(90);
                dat.p2(value as number);
            } else if (key === 'resizey') {
                dat.p1(91);
                dat.p2(value as number);
            } else if (key === 'resizez') {
                dat.p1(92);
                dat.p2(value as number);
            } else if (key === 'visonmap') {
                if (value === false) {
                    dat.p1(93);
                }
            } else if (key === 'vislevel') {
                dat.p1(95);
                dat.p2(value as number);
                vislevel = true;
            } else if (key === 'resizeh') {
                dat.p1(97);
                dat.p2(value as number);
            } else if (key === 'resizev') {
                dat.p1(98);
                dat.p2(value as number);
            } else if (key === 'wanderrange') {
                if (transmitAll === true) {
                    dat.p1(200);
                    dat.p1(value as number);
                }
            } else if (key === 'maxrange') {
                if (transmitAll === true) {
                    dat.p1(201);
                    dat.p1(value as number);
                }
            } else if (key === 'huntrange') {
                if (transmitAll === true) {
                    dat.p1(202);
                    dat.p1(value as number);
                }
            } else if (key === 'timer') {
                if (transmitAll === true) {
                    dat.p1(203);
                    dat.p2(value as number);
                }
            } else if (key === 'respawnrate') {
                if (transmitAll === true) {
                    dat.p1(204);
                    dat.p2(value as number);
                }
            } else if (key === 'moverestrict') {
                if (transmitAll === true) {
                    dat.p1(206);
                    dat.p1(value as number);
                }
            } else if (key === 'attackrange') {
                if (transmitAll === true) {
                    dat.p1(207);
                    dat.p1(value as number);
                }
            } else if (key === 'blockwalk') {
                if (transmitAll === true) {
                    dat.p1(208);
                    dat.p1(value as number);
                }
            } else if (key === 'huntmode') {
                if (transmitAll === true) {
                    dat.p1(209);
                    dat.p1(value as number);
                }
            } else if (key === 'defaultmode') {
                if (transmitAll === true) {
                    dat.p1(210);
                    dat.p1(value as number);
                }
            } else if (key === 'members') {
                if (transmitAll === true) {
                    if (value === true) {
                        dat.p1(211);
                    }
                }
            } else if (key === 'hitpoints') {
                stats[0] = value as number;
            } else if (key === 'attack') {
                stats[1] = value as number;
            } else if (key === 'strength') {
                stats[2] = value as number;
            } else if (key === 'defence') {
                stats[3] = value as number;
            } else if (key === 'magic') {
                stats[4] = value as number;
            } else if (key === 'ranged') {
                stats[5] = value as number;
            }
        }

        if (recol_s.length > 0) {
            dat.p1(40);
            dat.p1(recol_s.length);

            for (let k = 0; k < recol_s.length; k++) {
                dat.p2(recol_s[k]);
                dat.p2(recol_d[k]);
            }
        }

        if (name !== null) {
            dat.p1(2);
            dat.pjstr(name);
        }

        if (models.length > 0) {
            dat.p1(1);

            dat.p1(models.length);
            for (let k = 0; k < models.length; k++) {
                dat.p2(models[k]);
            }
        }

        if (heads.length > 0) {
            dat.p1(60);

            dat.p1(heads.length);
            for (let k = 0; k < heads.length; k++) {
                dat.p2(heads[k]);
            }
        }

        if (!vislevel) {
            // TODO: calculate NPC level based on stats
            dat.p1(95);
            dat.p2(1);
        }

        if (transmitAll === true && stats.some(v => v !== 1)) {
            dat.p1(205);

            for (let k = 0; k < stats.length; k++) {
                dat.p2(stats[k]);
            }
        }

        if (transmitAll === true && params.length) {
            dat.p1(249);

            dat.p1(params.length);
            for (let k = 0; k < params.length; k++) {
                const paramData = params[k] as ParamValue;
                dat.p3(paramData.id);
                dat.pbool(paramData.type === ScriptVarType.STRING);

                if (paramData.type === ScriptVarType.STRING) {
                    dat.pjstr(paramData.value as string);
                } else {
                    dat.p4(paramData.value as number);
                }
            }
        }

        if (transmitAll === true) {
            dat.p1(250);
            dat.pjstr(debugname);
        }

        dat.p1(0);
        idx.p2(dat.pos - start);
    }

    return { dat, idx };
}

export function packNpcClient(configs: Map<string, ConfigLine[]>) {
    return packNpcConfig(configs, false);
}

export function packNpcServer(configs: Map<string, ConfigLine[]>) {
    return packNpcConfig(configs, true);
}
