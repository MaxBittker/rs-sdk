import Packet from '#jagex2/io/Packet.js';

import ParamType from '#lostcity/cache/ParamType.js';

import { PACKFILE, ParamValue, ConfigValue, ConfigLine } from '#lostcity/tools/packconfig/PackShared.js';
import { lookupParamValue } from '#lostcity/tools/packconfig/ParamConfig.js';

export function parseNpcConfig(key: string, value: string): ConfigValue | null | undefined {
    const stringKeys = [
        'name', 'desc',
        'op1', 'op2', 'op3', 'op4', 'op5'
    ];
    const numberKeys = [
        'size',
        'recol1s', 'recol1d', 'recol2s', 'recol2d', 'recol3s', 'recol3d', 'recol4s', 'recol4d', 'recol5s', 'recol5d', 'recol6s', 'recol6d',
        'resizex', 'resizey', 'resizez', // not actually used in client
        'resizeh', 'resizev'
    ];
    const booleanKeys = [
        'hasalpha', 'visonmap'
    ];

    if (stringKeys.includes(key)) {
        return value;
    } else if (numberKeys.includes(key)) {
        let number;
        if (value.startsWith('0x')) {
            number = parseInt(value, 16);
        } else {
            number = parseInt(value);
        }

        if (isNaN(number)) {
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
            param: param.type,
            value: paramValue
        };
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
            } else if (key === 'resizeh') {
                dat.p1(97);
                dat.p2(value as number);
            } else if (key === 'resizev') {
                dat.p1(98);
                dat.p2(value as number);
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

        if (transmitAll === true && params.length) {
            dat.p1(249);

            dat.p1(params.length);
            for (let k = 0; k < params.length; k++) {
                const paramData = params[k] as ParamValue;
                dat.p3(paramData.param);
                dat.pbool(typeof paramData.value === 'string');

                if (typeof paramData.value === 'string') {
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
