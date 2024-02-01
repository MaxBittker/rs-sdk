import Packet from '#jagex2/io/Packet.js';

import { PACKFILE, ConfigValue, ConfigLine } from '#lostcity/tools/packconfig/PackShared.js';

export function parseIdkConfig(key: string, value: string): ConfigValue | null | undefined {
    const stringKeys: string[] = [];
    // prettier-ignore
    const numberKeys = [
        'recol1s', 'recol1d', 'recol2s', 'recol2d', 'recol3s', 'recol3d', 'recol4s', 'recol4d', 'recol5s', 'recol5d'
    ];
    // prettier-ignore
    const booleanKeys = [
        'disable'
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

        if (key.startsWith('recol') && (number < 0 || number > 65535)) {
            return null;
        }

        return number;
    } else if (booleanKeys.includes(key)) {
        if (value !== 'yes' && value !== 'no') {
            return null;
        }

        return value === 'yes';
    } else if (key === 'type') {
        let bodypart = 0;
        switch (value) {
            case 'man_hair':
                bodypart = 0;
                break;
            case 'man_jaw':
                bodypart = 1;
                break;
            case 'man_torso':
                bodypart = 2;
                break;
            case 'man_arms':
                bodypart = 3;
                break;
            case 'man_hands':
                bodypart = 4;
                break;
            case 'man_legs':
                bodypart = 5;
                break;
            case 'man_feet':
                bodypart = 6;
                break;
            case 'woman_hair':
                bodypart = 7;
                break;
            case 'woman_jaw':
                bodypart = 8;
                break;
            case 'woman_torso':
                bodypart = 9;
                break;
            case 'woman_arms':
                bodypart = 10;
                break;
            case 'woman_hands':
                bodypart = 11;
                break;
            case 'woman_legs':
                bodypart = 12;
                break;
            case 'woman_feet':
                bodypart = 13;
                break;
            default:
                return null;
        }

        return bodypart;
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
    } else {
        return undefined;
    }
}

function packIdkConfigs(configs: Map<string, ConfigLine[]>, transmitAll: boolean) {
    const pack = PACKFILE.get('idk')!;

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
        const models: number[] = [];
        const heads: number[] = [];

        for (let j = 0; j < config.length; j++) {
            const { key, value } = config[j];
            if (key.startsWith('model')) {
                const index = parseInt(key.substring('model'.length)) - 1;
                models[index] = value as number;
            } else if (key.startsWith('head')) {
                const index = parseInt(key.substring('head'.length)) - 1;
                heads[index] = value as number;
            } else if (key.startsWith('recol') && key.endsWith('s')) {
                const index = parseInt(key.substring('recol'.length, key.length - 1)) - 1;
                recol_s[index] = value as number;
            } else if (key.startsWith('recol') && key.endsWith('d')) {
                const index = parseInt(key.substring('recol'.length, key.length - 1)) - 1;
                recol_d[index] = value as number;
            } else if (key === 'type') {
                dat.p1(1);
                dat.p1(value as number);
            } else if (key === 'disable') {
                if (value === true) {
                    dat.p1(3);
                }
            }
        }

        if (recol_s.length) {
            for (let i = 0; i < recol_s.length; i++) {
                dat.p1(40 + i);
                dat.p2(recol_s[i]);
            }
        }

        if (recol_d.length) {
            for (let i = 0; i < recol_d.length; i++) {
                dat.p1(50 + i);
                dat.p2(recol_d[i]);
            }
        }

        if (heads.length) {
            for (let i = 0; i < heads.length; i++) {
                dat.p1(60 + i);
                dat.p2(heads[i]);
            }
        }

        if (models.length) {
            dat.p1(2);
            dat.p1(models.length);

            for (let i = 0; i < models.length; i++) {
                dat.p2(models[i]);
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

export function packIdkClient(configs: Map<string, ConfigLine[]>) {
    return packIdkConfigs(configs, false);
}

export function packIdkServer(configs: Map<string, ConfigLine[]>) {
    return packIdkConfigs(configs, true);
}
