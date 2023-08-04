import Packet from '#jagex2/io/Packet.js';
import { PACKFILE, ConfigValue, ConfigLine } from '#lostcity/tools/packconfig/PackShared.js';

export function parseFloConfig(key: string, value: string): ConfigValue | null | undefined {
    const stringKeys: string[] = [];
    const numberKeys = [
        'rgb'
    ];
    const booleanKeys = [
        'overlay', 'occlude'
    ];

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
    } else if (key === 'texture') {
        const index = PACKFILE.get('texture')!.indexOf(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else {
        return undefined;
    }
}

function packFloConfigs(configs: Map<string, ConfigLine[]>, transmitAll: boolean) {
    const pack = PACKFILE.get('flo')!;

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

            if (key === 'rgb') {
                dat.p1(1);
                dat.p3(value as number);
            } else if (key === 'texture') {
                dat.p1(2);
                dat.p1(value as number);
            } else if (key === 'overlay') {
                if (value === true) {
                    dat.p1(3);
                }
            } else if (key === 'occlude') {
                if (value === false) {
                    dat.p1(5);
                }
            }
        }

        dat.p1(6); // editname
        dat.pjstr(debugname);

        dat.p1(0);
        idx.p2(dat.pos - start);
    }

    return { dat, idx };
}

export function packFloClient(configs: Map<string, ConfigLine[]>) {
    return packFloConfigs(configs, false);
}

export function packFloServer(configs: Map<string, ConfigLine[]>) {
    return packFloConfigs(configs, true);
}
