import Packet from '#jagex2/io/Packet.js';

import { PACKFILE, ConfigValue, ConfigLine } from '#lostcity/tools/packconfig/PackShared.js';

export function parseSpotAnimConfig(key: string, value: string): ConfigValue | null | undefined {
    const stringKeys: string[] = [];
    // prettier-ignore
    const numberKeys = [
        'resizeh', 'resizev',
        'orientation',
        'ambient', 'contrast',
        'recol1s', 'recol1d', 'recol2s', 'recol2d', 'recol3s', 'recol3d', 'recol4s', 'recol4d', 'recol5s', 'recol5d', 'recol6s', 'recol6d'
    ];
    // prettier-ignore
    const booleanKeys = [
        'hasalpha'
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

        if ((key === 'resizeh' || key === 'resizev') && (number < 0 || number > 512)) {
            return null;
        }

        if (key === 'orientation' && (number < 0 || number > 360)) {
            return null;
        }

        if ((key === 'ambient' || key === 'contrast') && (number < -128 || number > 127)) {
            return null;
        }

        if (key.startsWith('recol') && (number < 0 || number > 65535)) {
            return null;
        }

        return number;
    } else if (booleanKeys.includes(key)) {
        if (value !== 'yes' && value !== 'no') {
            return null;
        }

        return value === 'yes';
    } else if (key === 'model') {
        const index = PACKFILE.get('model')!.indexOf(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else if (key === 'anim') {
        const index = PACKFILE.get('seq')!.indexOf(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else {
        return undefined;
    }
}

function packSpotAnimConfigs(configs: Map<string, ConfigLine[]>, transmitAll: boolean) {
    const pack = PACKFILE.get('spotanim')!;

    const dat = new Packet();
    const idx = new Packet();
    dat.p2(pack.length);
    idx.p2(pack.length);

    // collect these to write at the end
    const recol_s = [];
    const recol_d = [];

    for (let i = 0; i < pack.length; i++) {
        const debugname = pack[i];
        const config = configs.get(debugname)!;

        const start = dat.pos;

        for (let j = 0; j < config.length; j++) {
            const { key, value } = config[j];

            if (key === 'model') {
                dat.p1(1);
                dat.p2(value as number);
            } else if (key === 'anim') {
                dat.p1(2);
                dat.p2(value as number);
            } else if (key === 'hasalpha') {
                if (value === true) {
                    dat.p1(3);
                }
            } else if (key === 'resizeh') {
                dat.p1(4);
                dat.p2(value as number);
            } else if (key === 'resizev') {
                dat.p1(5);
                dat.p2(value as number);
            } else if (key === 'orientation') {
                dat.p1(6);
                dat.p2(value as number);
            } else if (key === 'ambient') {
                dat.p1(7);
                dat.p1(value as number);
            } else if (key === 'contrast') {
                dat.p1(8);
                dat.p1(value as number);
            } else if (key.startsWith('recol')) {
                const index = parseInt(key.substring('recol'.length, key.length - 1)) - 1;
                if (key.endsWith('s')) {
                    dat.p1(40 + index);
                    dat.p2(value as number);
                } else {
                    dat.p1(50 + index);
                    dat.p2(value as number);
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

export function packSpotAnimClient(configs: Map<string, ConfigLine[]>) {
    return packSpotAnimConfigs(configs, false);
}

export function packSpotAnimServer(configs: Map<string, ConfigLine[]>) {
    return packSpotAnimConfigs(configs, true);
}
