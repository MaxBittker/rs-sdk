import Packet from '#jagex2/io/Packet.js';

import InvType from '#lostcity/cache/InvType.js';

import { PACKFILE, ConfigValue, ConfigLine } from '#lostcity/tools/packconfig/PackShared.js';

export function parseInvConfig(key: string, value: string): ConfigValue | null | undefined {
    const stringKeys: string[] = [];
    const numberKeys = [
        'size'
    ];
    const booleanKeys = [
        'stackall', 'restock', 'allstock', 'protect', 'runweight',
        'dummyinv', // guessing that ObjType.dummyitem can only add to these invs
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

        if (key === 'size' && (number < 0 || number > 500)) {
            return null;
        }

        return number;
    } else if (booleanKeys.includes(key)) {
        if (value !== 'yes' && value !== 'no') {
            return null;
        }

        return value === 'yes';
    } else if (key === 'scope') {
        if (value === 'shared') {
            return InvType.SCOPE_SHARED;
        } else if (value === 'perm') {
            return InvType.SCOPE_PERM;
        } else if (value === 'temp') {
            return InvType.SCOPE_TEMP;
        } else {
            return null;
        }
    } else if (key.startsWith('stock')) {
        const parts = value.split(',');
        const objIndex = PACKFILE.get('obj')!.indexOf(parts[0]);
        if (objIndex === -1) {
            return null;
        }

        const objCount = parseInt(parts[1]);
        if (isNaN(objCount)) {
            return null;
        }

        if (parts.length === 2) {
            return [objIndex, objCount];
        }

        const objRespawn = parseInt(parts[2]);
        if (isNaN(objRespawn)) {
            return null;
        }

        return [objIndex, objCount, objRespawn];
    } else {
        return undefined;
    }
}

export function packInvConfigs(configs: Map<string, ConfigLine[]>) {
    const pack = PACKFILE.get('inv')!;

    const dat = new Packet();
    const idx = new Packet();
    dat.p2(pack.length);
    idx.p2(pack.length);

    for (let i = 0; i < pack.length; i++) {
        const debugname = pack[i];
        const config = configs.get(debugname)!;

        const start = dat.pos;

        // collect these to write at the end
        const stock = [];

        for (let j = 0; j < config.length; j++) {
            const { key, value } = config[j];

            if (key === 'scope') {
                dat.p1(1);
                dat.p1(value as number);
            } else if (key === 'size') {
                dat.p1(2);
                dat.p2(value as number);
            } else if (key.startsWith('stock')) {
                stock.push(value);
            } else if (key === 'stackall') {
                if (value === true) {
                    dat.p1(3);
                }
            } else if (key === 'restock') {
                if (value === true) {
                    dat.p1(5);
                }
            } else if (key === 'allstock') {
                if (value === true) {
                    dat.p1(6);
                }
            } else if (key === 'protect') {
                if (value === false) {
                    dat.p1(7);
                }
            } else if (key === 'runweight') {
                if (value === true) {
                    dat.p1(8);
                }
            } else if (key === 'dummyitem') {
                if (value === true) {
                    dat.p1(9);
                }
            }
        }

        if (stock.length > 0) {
            dat.p1(4);
            dat.p1(stock.length);

            for (let i = 0; i < stock.length; i++) {
                const [id, count, rate] = stock[i] as number[];
                dat.p2(id);
                dat.p2(count);

                if (typeof rate !== 'undefined') {
                    dat.p4(rate);
                } else {
                    dat.p4(0);
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
