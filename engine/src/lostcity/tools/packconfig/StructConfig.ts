import Packet from '#jagex2/io/Packet.js';
import ParamType from '#lostcity/cache/ParamType.js';
import { PACKFILE, ConfigValue, ConfigLine, lookupParamValue, ParamValue } from '#lostcity/tools/packconfig/PackShared.js';

export function parseStructConfig(key: string, value: string): ConfigValue | null | undefined {
    const stringKeys: string[] = [];
    const numberKeys: string[] = [];
    const booleanKeys: string[] = [];

    if (stringKeys.includes(key)) {
        return value;
    } else if (numberKeys.includes(key)) {
        if (value.startsWith('0x')) {
            return parseInt(value, 16);
        } else {
            return parseInt(value);
        }
    } else if (booleanKeys.includes(key)) {
        if (value !== 'yes' && value !== 'no') {
            return null;
        }

        return value === 'yes';
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

export function packStructConfigs(configs: Map<string, ConfigLine[]>) {
    const pack = PACKFILE.get('struct')!;

    const dat = new Packet();
    const idx = new Packet();
    dat.p2(pack.length);
    idx.p2(pack.length);

    for (let i = 0; i < pack.length; i++) {
        const debugname = pack[i];
        const config = configs.get(debugname)!;

        const start = dat.pos;

        const params: ParamValue[] = [];

        for (let j = 0; j < config.length; j++) {
            const { key, value } = config[j];

            if (key === 'param') {
                params.push(value as ParamValue);
            }
        }

        if (params.length > 0) {
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

        dat.p1(250);
        dat.pjstr(debugname);

        dat.p1(0);
        idx.p2(dat.pos - start);
    }

    return { dat, idx };
}
