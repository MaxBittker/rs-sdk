import Packet from '#jagex2/io/Packet.js';

import ScriptVarType from '#lostcity/cache/ScriptVarType.js';
import VarPlayerType from '#lostcity/cache/VarPlayerType.js';

import { PACKFILE, ConfigValue, ConfigLine } from '#lostcity/tools/packconfig/PackShared.js';

export function parseVarpConfig(key: string, value: string): ConfigValue | null | undefined {
    const stringKeys: string[] = [];
    // prettier-ignore
    const numberKeys = [
        'clientcode'
    ];
    // prettier-ignore
    const booleanKeys = [
        'protect', 'transmit'
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

        if (key === 'clientcode' && (number < 0 || number > 8)) {
            return null;
        }

        return number;
    } else if (booleanKeys.includes(key)) {
        if (value !== 'yes' && value !== 'no') {
            return null;
        }

        return value === 'yes';
    } else if (key === 'scope') {
        if (value === 'perm') {
            return VarPlayerType.SCOPE_PERM;
        } else if (value === 'temp') {
            return VarPlayerType.SCOPE_TEMP;
        } else {
            return null;
        }
    } else if (key === 'type') {
        return ScriptVarType.getTypeChar(value);
    } else {
        return undefined;
    }
}

function packVarpConfigs(configs: Map<string, ConfigLine[]>, transmitAll: boolean) {
    const pack = PACKFILE.get('varp')!;

    const dat = new Packet();
    const idx = new Packet();
    dat.p2(pack.length);
    idx.p2(pack.length);

    for (let i = 0; i < pack.length; i++) {
        const debugname = pack[i];
        const config = configs.get(debugname)!;

        const start = dat.pos;

        for (let j = 0; j < config.length; j++) {
            const { key, value } = config[j];

            if (key === 'scope') {
                if (transmitAll === true) {
                    dat.p1(1);
                    dat.p1(value as number);
                }
            } else if (key === 'type') {
                if (transmitAll === true) {
                    dat.p1(2);
                    dat.p1(value as number);
                }
            } else if (key === 'protect') {
                if (transmitAll === true) {
                    if (value === false) {
                        dat.p1(4);
                    }
                }
            } else if (key === 'clientcode') {
                dat.p1(5);
                dat.p2(value as number);
            } else if (key === 'transmit') {
                if (transmitAll === true) {
                    if (value === true) {
                        dat.p1(6);
                    }
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

export function packVarpClient(configs: Map<string, ConfigLine[]>) {
    return packVarpConfigs(configs, false);
}

export function packVarpServer(configs: Map<string, ConfigLine[]>) {
    return packVarpConfigs(configs, true);
}
