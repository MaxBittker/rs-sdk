import Packet from '#jagex2/io/Packet.js';
import ScriptVarType from '#lostcity/cache/ScriptVarType.js';
import { PACKFILE, ConfigValue, ConfigLine, lookupParamValue } from '#lostcity/tools/packconfig/PackShared.js';

export function parseEnumConfig(key: string, value: string): ConfigValue | null | undefined {
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
    } else if (key === 'inputtype') {
        return ScriptVarType.getTypeChar(value);
    } else if (key === 'outputtype') {
        return ScriptVarType.getTypeChar(value);
    } else if (key === 'default') {
        return value;
    } else if (key === 'val') {
        return value;
    } else {
        return undefined;
    }
}

export function packEnumConfigs(configs: Map<string, ConfigLine[]>) {
    const pack = PACKFILE.get('enum')!;

    const dat = new Packet();
    const idx = new Packet();
    dat.p2(pack.length);
    idx.p2(pack.length);

    for (let i = 0; i < pack.length; i++) {
        const debugname = pack[i];
        const config = configs.get(debugname)!;

        const start = dat.pos;

        // collect these to write at the end
        const val = [];

        // need to read-ahead for type info
        const inputtype = config.find(line => line.key === 'inputtype')!.value as number;
        const outputtype = config.find(line => line.key === 'outputtype')!.value as number;

        for (let j = 0; j < config.length; j++) {
            const { key, value } = config[j];

            if (key === 'val') {
                val.push(value as string);
            }
        }

        if (outputtype === ScriptVarType.STRING) {
            dat.p1(5);
        } else {
            dat.p1(6);
        }

        dat.p2(val.length);
        for (let i = 0; i < val.length; i++) {
            if (inputtype === ScriptVarType.AUTOINT) {
                dat.p4(i);
            } else {
                const key = val[i].substring(0, val[i].indexOf(','));
                dat.p4(lookupParamValue(inputtype, key) as number);
            }

            if (outputtype === ScriptVarType.AUTOINT) {
                dat.p4(lookupParamValue(outputtype, val[i]) as number);
            } else {
                const value = val[i].substring(val[i].indexOf(',') + 1);
                if (outputtype === ScriptVarType.STRING) {
                    dat.pjstr(lookupParamValue(outputtype, value) as string);
                } else {
                    dat.p4(lookupParamValue(outputtype, value) as number);
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
