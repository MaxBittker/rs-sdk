import Packet from '#jagex2/io/Packet.js';

import { PACKFILE, ConfigValue, ConfigLine } from '#lostcity/tools/packconfig/PackShared.js';

export function parseSeqConfig(key: string, value: string): ConfigValue | null | undefined {
    const stringKeys: string[] = [];
    const numberKeys = [
        'replayoff', 'priority', 'replaycount'
    ];
    const booleanKeys = [
        'stretches'
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

        if (key === 'replayoff' && (number < 0 || number > 1000)) {
            return null;
        }

        if (key === 'priority' && (number < 0 || number > 10)) {
            return null;
        }

        if (key === 'replaycount' && (number < 0 || number > 10)) {
            return null;
        }

        return number;
    } else if (booleanKeys.includes(key)) {
        if (value !== 'yes' && value !== 'no') {
            return null;
        }

        return value === 'yes';
    } else if (key.startsWith('frame')) {
        const index = PACKFILE.get('anim')!.indexOf(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else if (key.startsWith('iframe')) {
        const index = PACKFILE.get('anim')!.indexOf(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else if (key.startsWith('delay')) {
        const parsed = parseInt(value);
        if (isNaN(parsed)) {
            return null;
        }

        return parsed;
    } else if (key === 'walkmerge') {
        const parts = value.split(',');

        const labels = [];
        for (let i = 0; i < parts.length; i++) {
            // not tracking labels by name currently
            labels.push(parseInt(parts[i].substring(parts[i].indexOf('_') + 1)));
        }

        return labels;
    } else if (key === 'righthand') {
        if (value === 'hide') {
            return 0;
        }

        const index = PACKFILE.get('obj')!.indexOf(value);
        if (index === -1) {
            return null;
        }

        return index + 512;
    } else if (key === 'lefthand') {
        if (value === 'hide') {
            return 0;
        }

        const index = PACKFILE.get('obj')!.indexOf(value);
        if (index === -1) {
            return null;
        }

        return index + 512;
    } else {
        return undefined;
    }
}

function packSeqConfigs(configs: Map<string, ConfigLine[]>, transmitAll: boolean) {
    const pack = PACKFILE.get('seq')!;

    const dat = new Packet();
    const idx = new Packet();
    dat.p2(pack.length);
    idx.p2(pack.length);

    for (let i = 0; i < pack.length; i++) {
        const debugname = pack[i];
        const config = configs.get(debugname)!;

        const start = dat.pos;

        // collect these to write at the end
        const frames: number[] = [];
        const iframes: number[] = [];
        const delays: number[] = [];

        for (let j = 0; j < config.length; j++) {
            const { key, value } = config[j];
            if (key.startsWith('frame')) {
                const index = parseInt(key.substring('frame'.length)) - 1;
                frames[index] = value as number;
            } else if (key.startsWith('iframe')) {
                const index = parseInt(key.substring('iframe'.length)) - 1;
                iframes[index] = value as number;
            } else if (key.startsWith('delay')) {
                const index = parseInt(key.substring('delay'.length)) - 1;
                delays[index] = value as number;
            } else if (key === 'replayoff') {
                dat.p1(2);
                dat.p2(value as number);
            } else if (key === 'walkmerge') {
                dat.p1(3);

                const labels = value as number[];
                dat.p1(labels.length);
                for (let i = 0; i < labels.length; i++) {
                    dat.p1(labels[i]);
                }
            } else if (key === 'stretches') {
                if (value === true) {
                    dat.p1(4);
                }
            } else if (key === 'priority') {
                dat.p1(5);
                dat.p1(value as number);
            } else if (key === 'righthand') {
                dat.p1(6);
                dat.p2(value as number);
            } else if (key === 'lefthand') {
                dat.p1(7);
                dat.p2(value as number);
            } else if (key === 'replaycount') {
                dat.p1(8);
                dat.p1(value as number);
            }
        }

        if (frames.length > 0) {
            dat.p1(1);

            dat.p1(frames.length);
            for (let i = 0; i < frames.length; i++) {
                dat.p2(frames[i]);

                if (typeof iframes[i] !== 'undefined') {
                    dat.p2(iframes[i]);
                } else {
                    dat.p2(-1);
                }

                if (typeof delays[i] !== 'undefined') {
                    dat.p2(delays[i]);
                } else {
                    dat.p2(0);
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

export function packSeqClient(configs: Map<string, ConfigLine[]>) {
    return packSeqConfigs(configs, false);
}

export function packSeqServer(configs: Map<string, ConfigLine[]>) {
    return packSeqConfigs(configs, true);
}
