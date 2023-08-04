import Packet from '#jagex2/io/Packet.js';
import { PACKFILE, ConfigValue, ConfigLine } from '#lostcity/tools/packconfig/PackShared.js';

export function parseMesAnimConfig(key: string, value: string): ConfigValue | null | undefined {
    const stringKeys: string[] = [];
    const numberKeys = [
        'clientcode'
    ];
    const booleanKeys = [
        'protect', 'transmit'
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
    } else if (key.startsWith('len')) {
        const index = PACKFILE.get('seq')!.indexOf(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else {
        return undefined;
    }
}

export function packMesAnimConfigs(configs: Map<string, ConfigLine[]>) {
    const pack = PACKFILE.get('mesanim')!;

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

            if (key.startsWith('len')) {
                const len = Number(key.substring('len'.length));
                if (isNaN(len)) {
                    continue;
                }

                const opcode = Math.max(0, len - 1) + 1;
                dat.p1(opcode);
                dat.p2(value as number);
            }
        }

        dat.p1(250);
        dat.pjstr(debugname);

        dat.p1(0);
        idx.p2(dat.pos - start);
    }

    return { dat, idx };
}
