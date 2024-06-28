import ParamType from '#lostcity/cache/config/ParamType.js';
import ScriptVarType from '#lostcity/cache/config/ScriptVarType.js';

import MoveRestrict from '#lostcity/entity/MoveRestrict.js';
import NpcMode from '#lostcity/entity/NpcMode.js';

import { ParamValue, ConfigValue, ConfigLine, PackedData, isConfigBoolean, getConfigBoolean } from '#lostcity/cache/packconfig/PackShared.js';
import { lookupParamValue } from '#lostcity/cache/packconfig/ParamConfig.js';
import BlockWalk from '#lostcity/entity/BlockWalk.js';
import { CategoryPack, HuntPack, ModelPack, NpcPack, SeqPack } from '#lostcity/util/PackFile.js';
import ColorConversion from '#lostcity/util/ColorConversion.js';

export function parseNpcConfig(key: string, value: string): ConfigValue | null | undefined {
    // prettier-ignore
    const stringKeys = [
        'name', 'desc',
        'op1', 'op2', 'op3', 'op4', 'op5'
    ];
    // prettier-ignore
    const numberKeys = [
        'size',
        'resizex', 'resizey', 'resizez', // not actually used in client
        'resizeh', 'resizev',
        'wanderrange', 'maxrange', 'huntrange', 'attackrange',
        'hitpoints', 'attack', 'strength', 'defence', 'magic', 'ranged',
        'timer', 'respawnrate'
    ];
    // prettier-ignore
    const booleanKeys = [
        'hasalpha', 'minimap', 'members', 'givechase'
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
        if (!isConfigBoolean(value)) {
            return null;
        }

        return getConfigBoolean(value);
    } else if (key.startsWith('model')) {
        const index = ModelPack.getByName(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else if (key.startsWith('head')) {
        const index = ModelPack.getByName(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else if (key.startsWith('recol')) {
        const index = parseInt(key[5]);
        if (index > 9) {
            return null;
        }

        return ColorConversion.rgb15toHsl16(parseInt(value));
    } else if (key === 'readyanim') {
        const index = SeqPack.getByName(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else if (key === 'walkanim') {
        if (value.includes(',')) {
            const anims = value.split(',');
            const indices: number[] = [];

            for (const anim of anims) {
                const index = SeqPack.getByName(anim);
                if (index === -1) {
                    return null;
                }

                indices.push(index);
            }

            if (indices.length !== 4) {
                return null;
            }

            return indices;
        }

        const index = SeqPack.getByName(value);
        if (index === -1) {
            return null;
        }

        return index;
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
        const index = CategoryPack.getByName(value);
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
        const index = HuntPack.getByName(value);
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
    } else if (key.startsWith('patrol')) {
        const parts = value.split(',');
        const coordParts = parts[0].split('_');
        const delay = parseInt(parts[1]);

        const level = parseInt(coordParts[0]);
        const mX = parseInt(coordParts[1]);
        const mZ = parseInt(coordParts[2]);
        const lX = parseInt(coordParts[3]);
        const lZ = parseInt(coordParts[4]);

        if (isNaN(level) || isNaN(mX) || isNaN(mZ) || isNaN(lX) || isNaN(lZ)) {
            return null;
        }
        if (lZ < 0 || lX < 0 || mZ < 0 || mX < 0 || level < 0) {
            return null;
        }
        if (lZ > 63 || lX > 63 || mZ > 255 || mX > 255 || level > 3) {
            return null;
        }

        const x = (mX << 6) + lX;
        const z = (mZ << 6) + lZ;
        const coord = (z & 0x3fff) | ((x & 0x3fff) << 14) | ((level & 0x3) << 28);
        if (isNaN(delay)) {
            return [coord, 0]; // maybe we return null instead?
        }
        return [coord, delay];
    } else {
        return undefined;
    }
}

export function packNpcConfigs(configs: Map<string, ConfigLine[]>): { client: PackedData, server: PackedData } {
    const client: PackedData = new PackedData(NpcPack.size);
    const server: PackedData = new PackedData(NpcPack.size);

    for (let i = 0; i < NpcPack.size; i++) {
        const debugname = NpcPack.getById(i);
        const config = configs.get(debugname)!;

        // collect these to write at the end
        const recol_s: number[] = [];
        const recol_d: number[] = [];
        let name: string | null = null;
        const models: number[] = [];
        const heads: number[] = [];
        const params: ParamValue[] = [];
        const stats: number[] = [1, 1, 1, 1, 1, 1];
        const patrol = [];
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
                client.p1(3);
                client.pjstr(value as string);
            } else if (key === 'size') {
                client.p1(12);
                client.p1(value as number);
            } else if (key === 'readyanim') {
                client.p1(13);
                client.p2(value as number);
            } else if (key === 'walkanim') {
                if (Array.isArray(value)) {
                    client.p1(17);
                    client.p2(value[0] as number);
                    client.p2(value[1] as number);
                    client.p2(value[2] as number);
                    client.p2(value[3] as number);
                } else {
                    client.p1(14);    
                    client.p2(value as number);
                }
            } else if (key === 'hasalpha') {
                if (value === true) {
                    client.p1(16);
                }
            } else if (key === 'category') {
                server.p1(18);
                server.p2(value as number);
            } else if (key.startsWith('op')) {
                const index = parseInt(key.substring('op'.length)) - 1;
                client.p1(30 + index);
                client.pjstr(value as string);
            } else if (key === 'attack') {
                server.p1(74);
                server.p2(value as number);
            } else if (key === 'defence') {
                server.p1(75);
                server.p2(value as number);
            } else if (key === 'strength') {
                server.p1(76);
                server.p2(value as number);
            } else if (key === 'hitpoints') {
                server.p1(77);
                server.p2(value as number);
            } else if (key === 'ranged') {
                server.p1(78);
                server.p2(value as number);
            } else if (key === 'magic') {
                server.p1(79);
                server.p2(value as number);
            } else if (key === 'resizex') {
                client.p1(90);
                client.p2(value as number);
            } else if (key === 'resizey') {
                client.p1(91);
                client.p2(value as number);
            } else if (key === 'resizez') {
                client.p1(92);
                client.p2(value as number);
            } else if (key === 'minimap') {
                if (value === false) {
                    client.p1(93);
                }
            } else if (key === 'vislevel') {
                client.p1(95);
                client.p2(value as number);
                vislevel = true;
            } else if (key === 'resizeh') {
                client.p1(97);
                client.p2(value as number);
            } else if (key === 'resizev') {
                client.p1(98);
                client.p2(value as number);
            } else if (key === 'wanderrange') {
                server.p1(200);
                server.p1(value as number);
            } else if (key === 'maxrange') {
                server.p1(201);
                server.p1(value as number);
            } else if (key === 'huntrange') {
                server.p1(202);
                server.p1(value as number);
            } else if (key === 'timer') {
                server.p1(203);
                server.p2(value as number);
            } else if (key === 'respawnrate') {
                server.p1(204);
                server.p2(value as number);
            } else if (key === 'moverestrict') {
                server.p1(206);
                server.p1(value as number);
            } else if (key === 'attackrange') {
                server.p1(207);
                server.p1(value as number);
            } else if (key === 'blockwalk') {
                server.p1(208);
                server.p1(value as number);
            } else if (key === 'huntmode') {
                server.p1(209);
                server.p1(value as number);
            } else if (key === 'defaultmode') {
                server.p1(210);
                server.p1(value as number);
            } else if (key === 'members') {
                if (value === true) {
                    server.p1(211);
                }
            } else if (key.startsWith('patrol')) {
                patrol.push(value);
            } else if (key === 'givechase') {
                if (value === false) {
                    server.p1(213);
                }
            }
        }

        if (recol_s.length > 0) {
            client.p1(40);
            client.p1(recol_s.length);

            for (let k = 0; k < recol_s.length; k++) {
                client.p2(recol_s[k]);
                client.p2(recol_d[k]);
            }
        }

        if (name === null) {
            name = debugname;
        }

        if (name !== null) {
            client.p1(2);
            client.pjstr(name);
        }

        if (models.length > 0) {
            client.p1(1);

            client.p1(models.length);
            for (let k = 0; k < models.length; k++) {
                client.p2(models[k]);
            }
        }

        if (heads.length > 0) {
            client.p1(60);

            client.p1(heads.length);
            for (let k = 0; k < heads.length; k++) {
                client.p2(heads[k]);
            }
        }

        if (!vislevel) {
            // TODO: calculate NPC level based on stats
            client.p1(95);
            client.p2(1);
        }

        if (patrol.length > 0) {
            server.p1(212);
            server.p1(patrol.length);

            for (let i = 0; i < patrol.length; i++) {
                const [packedCoord, delay] = patrol[i] as number[];
                server.p4(packedCoord);
                server.p1(delay);
            }
        }

        if (params.length) {
            server.p1(249);

            server.p1(params.length);
            for (let k = 0; k < params.length; k++) {
                const paramData = params[k] as ParamValue;
                server.p3(paramData.id);
                server.pbool(paramData.type === ScriptVarType.STRING);

                if (paramData.type === ScriptVarType.STRING) {
                    server.pjstr(paramData.value as string);
                } else {
                    server.p4(paramData.value as number);
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
