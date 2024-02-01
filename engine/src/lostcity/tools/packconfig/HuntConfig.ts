import Packet from '#jagex2/io/Packet.js';

import { PACKFILE, ConfigValue, ConfigLine } from '#lostcity/tools/packconfig/PackShared.js';
import HuntModeType from '#lostcity/entity/hunt/HuntModeType.js';
import HuntVis from '#lostcity/entity/hunt/HuntVis.js';
import HuntCheckNotTooStrong from '#lostcity/entity/hunt/HuntCheckNotTooStrong.js';
import HuntNobodyNear from '#lostcity/entity/hunt/HuntNobodyNear.js';
import NpcMode from '#lostcity/entity/NpcMode.js';

export function parseHuntConfig(key: string, value: string): ConfigValue | null | undefined {
    const stringKeys: string[] = [];
    // prettier-ignore
    const numberKeys: string[] = [
        'rate'
    ];
    const booleanKeys: string[] = [];

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

        if (key === 'rate' && (number < 1 || number > 255)) {
            // min of 1 tick
            return null;
        }

        return number;
    } else if (booleanKeys.includes(key)) {
        if (value !== 'yes' && value !== 'no') {
            return null;
        }

        return value === 'yes';
    } else if (key === 'type') {
        switch (value) {
            case 'off':
                return HuntModeType.OFF;
            case 'player':
                return HuntModeType.PLAYER;
            case 'npc':
                return HuntModeType.NPC;
            case 'obj':
                return HuntModeType.OBJ;
            case 'scenery':
                // loc ?
                return HuntModeType.SCENERY;
            default:
                return null;
        }
    } else if (key === 'check_vis') {
        switch (value) {
            case 'off':
                return HuntVis.OFF;
            case 'lineofsight':
                return HuntVis.LINEOFSIGHT;
            case 'lineofwalk':
                return HuntVis.LINEOFWALK;
            default:
                return null;
        }
    } else if (key === 'check_nottoostrong') {
        switch (value) {
            case 'off':
                return HuntCheckNotTooStrong.OFF;
            case 'outside_wilderness':
                return HuntCheckNotTooStrong.OUTSIDE_WILDERNESS;
            default:
                return null;
        }
    } else if (key === 'check_notcombat') {
        if (!value.startsWith('%')) {
            return null;
        }

        value = value.slice(1);

        const index = PACKFILE.get('varp')!.indexOf(value);
        if (index === -1) {
            return null;
        }
        return index;
    } else if (key === 'check_notcombat_self') {
        if (!value.startsWith('%')) {
            return null;
        }

        value = value.slice(1);

        const index = PACKFILE.get('varn')!.indexOf(value);
        if (index === -1) {
            return null;
        }
        return index;
    } else if (key === 'check_notbusy') {
        switch (value) {
            case 'off':
                return false;
            case 'on':
                return true;
            default:
                return null;
        }
    } else if (key === 'find_keephunting') {
        switch (value) {
            case 'off':
                return false;
            case 'on':
                return true;
            default:
                return null;
        }
    } else if (key === 'find_newmode') {
        switch (value) {
            case 'opplayer1':
                return NpcMode.OPPLAYER1;
            case 'opplayer2':
                return NpcMode.OPPLAYER2;
            case 'opplayer3':
                return NpcMode.OPPLAYER3;
            case 'opplayer4':
                return NpcMode.OPPLAYER4;
            case 'opplayer5':
                return NpcMode.OPPLAYER5;
            case 'applayer1':
                return NpcMode.APPLAYER1;
            case 'applayer2':
                return NpcMode.APPLAYER2;
            case 'applayer3':
                return NpcMode.APPLAYER3;
            case 'applayer4':
                return NpcMode.APPLAYER4;
            case 'applayer5':
                return NpcMode.APPLAYER5;
            case 'queue1':
                return NpcMode.QUEUE1;
            case 'queue2':
                return NpcMode.QUEUE2;
            case 'queue3':
                return NpcMode.QUEUE3;
            case 'queue4':
                return NpcMode.QUEUE4;
            case 'queue5':
                return NpcMode.QUEUE5;
            case 'queue6':
                return NpcMode.QUEUE6;
            case 'queue7':
                return NpcMode.QUEUE7;
            case 'queue8':
                return NpcMode.QUEUE8;
            case 'queue9':
                return NpcMode.QUEUE9;
            case 'queue10':
                return NpcMode.QUEUE10;
            case 'queue11':
                return NpcMode.QUEUE11;
            case 'queue12':
                return NpcMode.QUEUE12;
            case 'queue13':
                return NpcMode.QUEUE13;
            case 'queue14':
                return NpcMode.QUEUE14;
            case 'queue15':
                return NpcMode.QUEUE15;
            case 'queue16':
                return NpcMode.QUEUE16;
            case 'queue17':
                return NpcMode.QUEUE17;
            case 'queue18':
                return NpcMode.QUEUE18;
            case 'queue19':
                return NpcMode.QUEUE19;
            case 'queue20':
                return NpcMode.QUEUE20;
            default:
                return null;
        }
    } else if (key === 'nobodynear') {
        switch (value) {
            case 'keephunting':
                return HuntNobodyNear.KEEPHUNTING;
            case 'pausehunt':
                return HuntNobodyNear.PAUSEHUNT;
            default:
                return null;
        }
    } else if (key === 'check_afk') {
        switch (value) {
            case 'off':
                return false;
            case 'on':
                return true;
            default:
                return null;
        }
    } else {
        return undefined;
    }
}

export function packHuntConfigs(configs: Map<string, ConfigLine[]>) {
    const pack = PACKFILE.get('hunt')!;

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

            if (key === 'type') {
                if (value !== HuntModeType.OFF) {
                    dat.p1(1);
                    dat.p1(value as number);
                }
            } else if (key === 'check_vis') {
                if (value !== HuntVis.OFF) {
                    dat.p1(2);
                    dat.p1(value as number);
                }
            } else if (key === 'check_nottoostrong') {
                if (value !== HuntCheckNotTooStrong.OFF) {
                    dat.p1(3);
                    dat.p1(value as number);
                }
            } else if (key === 'check_notbusy') {
                if (value !== false) {
                    dat.p1(4);
                }
            } else if (key === 'find_keephunting') {
                if (value !== false) {
                    dat.p1(5);
                }
            } else if (key === 'find_newmode') {
                if (value !== NpcMode.NONE) {
                    dat.p1(6);
                    dat.p1(value as number);
                }
            } else if (key === 'nobodynear') {
                if (value !== HuntNobodyNear.OFF) {
                    dat.p1(7);
                    dat.p1(value as number);
                }
            } else if (key === 'check_notcombat') {
                if (value !== null) {
                    dat.p1(8);
                    dat.p2(value as number);
                }
            } else if (key === 'check_notcombat_self') {
                if (value !== null) {
                    dat.p1(9);
                    dat.p2(value as number);
                }
            } else if (key === 'check_afk') {
                if (value !== false) {
                    dat.p1(10);
                }
            } else if (key === 'rate') {
                if (value !== 1) {
                    dat.p1(11);
                    dat.p2(value as number);
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
