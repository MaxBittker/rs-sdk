import Packet from '#jagex2/io/Packet.js';

import ObjType from '#lostcity/cache/ObjType.js';
import ParamType from '#lostcity/cache/ParamType.js';
import ScriptVarType from '#lostcity/cache/ScriptVarType.js';

import { PACKFILE, ParamValue, ConfigValue, ConfigLine, packStepError } from '#lostcity/tools/packconfig/PackShared.js';
import { lookupParamValue } from '#lostcity/tools/packconfig/ParamConfig.js';

export function parseObjConfig(key: string, value: string): ConfigValue | null | undefined {
    // prettier-ignore
    const stringKeys = [
        'name', 'desc',
        'op1', 'op2', 'op3', 'op4', 'op5',
        'iop1', 'iop2', 'iop3', 'iop4', 'iop5'
    ];
    // prettier-ignore
    const numberKeys = [
        '2dzoom', '2dxan', '2dyan', '2dxof', '2dyof', '2dzan',
        'recol1s', 'recol1d', 'recol2s', 'recol2d', 'recol3s', 'recol3d', 'recol4s', 'recol4d', 'recol5s', 'recol5d', 'recol6s', 'recol6d',
        'cost', 'respawnrate'
    ];
    // prettier-ignore
    const booleanKeys = [
        'code9', 'stackable', 'members', 'tradeable'
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

        // range checks
        if (key === '2dzoom' && (number < 0 || number > 5000)) {
            return null;
        }

        if ((key === '2dxan' || key === '2dyan' || key === '2dzan') && (number < 0 || number > 5000)) {
            return null;
        }

        if ((key === '2dxof' || key === '2dyof') && (number < -5000 || number > 5000)) {
            return null;
        }

        if (key.startsWith('recol') && (number < 0 || number > 65535)) {
            return null;
        }

        if (key === 'cost' && (number < 0 || number > 0x7fff_ffff)) {
            return null;
        }

        if (key === 'respawnrate' && (number < 0 || number > 12000)) {
            return null;
        }

        return number;
    } else if (booleanKeys.includes(key)) {
        if (value !== 'yes' && value !== 'no') {
            return null;
        }

        return value === 'yes';
    } else if (key === 'model' || key === 'manwear2' || key === 'womanwear2' || key === 'manwear3' || key === 'womanwear3' || key === 'manhead' || key === 'womanhead' || key === 'manhead2' || key === 'womanhead2') {
        const index = PACKFILE.get('model')!.indexOf(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else if (key === 'code10') {
        const index = PACKFILE.get('seq')!.indexOf(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else if (key === 'wearpos' || key === 'wearpos2' || key === 'wearpos3') {
        const wearPos = ObjType.getWearPosId(value);
        if (wearPos === -1) {
            return null;
        }

        return wearPos;
    } else if (key === 'manwear' || key === 'womanwear') {
        const parts = value.split(',');
        if (parts.length < 2) {
            return null;
        }

        const model = PACKFILE.get('model')!.indexOf(parts[0]);
        if (model === -1) {
            return null;
        }

        const offset = parseInt(parts[1]);
        if (isNaN(offset)) {
            return null;
        }

        return [model, offset];
    } else if (key === 'weight') {
        let grams = 0;
        if (value.indexOf('kg') !== -1) {
            // in kg, convert to g
            grams = Number(value.substring(0, value.indexOf('kg'))) * 1000;
        } else if (value.indexOf('oz') !== -1) {
            // in oz, convert to g
            grams = Number(value.substring(0, value.indexOf('oz'))) * 28.3495;
        } else if (value.indexOf('lb') !== -1) {
            // in lb, convert to g
            grams = Number(value.substring(0, value.indexOf('lb'))) * 453.592;
        } else if (value.indexOf('g') !== -1) {
            // in g
            grams = Number(value.substring(0, value.indexOf('g')));
        } else {
            return null;
        }

        if (grams < -32768 || grams > 32767) {
            return null;
        }

        return grams;
    } else if (key === 'dummyitem') {
        if (value === 'graphic_only') {
            // only used during animations
            return 1;
        } else if (value === 'inv_only') {
            // only used in dummy inventories (interfaces)
            return 2;
        } else {
            return null;
        }
    } else if (key.startsWith('count')) {
        const parts = value.split(',');
        if (parts.length < 2) {
            return null;
        }

        const obj = PACKFILE.get('obj')!.indexOf(parts[0]);
        if (obj === -1) {
            return null;
        }

        const count = parseInt(parts[1]);
        if (isNaN(count) || count < 1 || count > 65535) {
            return null;
        }

        return [obj, count];
    } else if (key === 'category') {
        const index = PACKFILE.get('category')!.indexOf(value);
        if (index === -1) {
            return null;
        }

        return index;
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
            id: param.id,
            type: param.type,
            value: paramValue
        };
    } else {
        return undefined;
    }
}

function packObjConfig(configs: Map<string, ConfigLine[]>, transmitAll: boolean) {
    const pack = PACKFILE.get('obj')!;

    const dat = new Packet();
    const idx = new Packet();
    dat.p2(pack.length);
    idx.p2(pack.length);

    const template_for_cert = pack.indexOf('template_for_cert');
    if (template_for_cert === -1) {
        throw packStepError('template_for_cert', 'Template for certificate does not exist.');
    }

    for (let i = 0; i < pack.length; i++) {
        const debugname = pack[i];
        let config;
        if (debugname.startsWith('cert_')) {
            const uncert = pack.indexOf(debugname.substring('cert_'.length));
            if (uncert === -1) {
                throw packStepError(debugname, 'Cert does not link to anything based on its name.');
            }

            config = [
                { key: 'certlink', value: uncert },
                { key: 'certtemplate', value: template_for_cert }
            ];
        } else {
            config = configs.get(debugname)!;

            if (transmitAll === true) {
                const cert = pack.indexOf('cert_' + debugname);
                if (cert !== -1) {
                    config.push({ key: 'certlink', value: cert });
                }
            }
        }

        const start = dat.pos;

        // collect these to write at the end
        const recol_s: number[] = [];
        const recol_d: number[] = [];
        let name: string | null = null;
        const params: ParamValue[] = [];

        for (let j = 0; j < config.length; j++) {
            const { key, value } = config[j];

            if (key === 'name') {
                name = value as string;
            } else if (key.startsWith('recol')) {
                const index = parseInt(key.substring('recol'.length, key.length - 1)) - 1;
                if (key.endsWith('s')) {
                    recol_s[index] = value as number;
                } else {
                    recol_d[index] = value as number;
                }
            } else if (key === 'param') {
                params.push(value as ParamValue);
            } else if (key === 'model') {
                dat.p1(1);
                dat.p2(value as number);
            } else if (key === 'desc') {
                dat.p1(3);
                dat.pjstr(value as string);
            } else if (key === '2dzoom') {
                dat.p1(4);
                dat.p2(value as number);
            } else if (key === '2dxan') {
                dat.p1(5);
                dat.p2(value as number);
            } else if (key === '2dyan') {
                dat.p1(6);
                dat.p2(value as number);
            } else if (key === '2dxof') {
                dat.p1(7);
                dat.p2(value as number);
            } else if (key === '2dyof') {
                dat.p1(8);
                dat.p2(value as number);
            } else if (key === 'code9') {
                if (value === true) {
                    dat.p1(9);
                }
            } else if (key === 'code10') {
                dat.p1(10);
                dat.p2(value as number);
            } else if (key === 'stackable') {
                if (value === true) {
                    dat.p1(11);
                }
            } else if (key === 'cost') {
                dat.p1(12);
                dat.p4(value as number);
            } else if (key === 'wearpos') {
                if (transmitAll === true) {
                    dat.p1(13);
                    dat.p1(value as number);
                }
            } else if (key === 'wearpos2') {
                if (transmitAll === true) {
                    dat.p1(14);
                    dat.p1(value as number);
                }
            } else if (key === 'members') {
                if (value === true) {
                    dat.p1(16);
                }
            } else if (key === 'manwear') {
                const values = value as number[];
                dat.p1(23);
                dat.p2(values[0]);
                dat.p1(values[1]);
            } else if (key === 'manwear2') {
                dat.p1(24);
                dat.p2(value as number);
            } else if (key === 'womanwear') {
                const values = value as number[];
                dat.p1(25);
                dat.p2(values[0]);
                dat.p1(values[1]);
            } else if (key === 'womanwear2') {
                dat.p1(26);
                dat.p2(value as number);
            } else if (key === 'wearpos3') {
                if (transmitAll === true) {
                    dat.p1(27);
                    dat.p1(value as number);
                }
            } else if (key.startsWith('op')) {
                const index = parseInt(key.substring('op'.length)) - 1;
                dat.p1(30 + index);
                dat.pjstr(value as string);
            } else if (key.startsWith('iop')) {
                const index = parseInt(key.substring('iop'.length)) - 1;
                dat.p1(35 + index);
                dat.pjstr(value as string);
            } else if (key === 'weight') {
                if (transmitAll === true) {
                    dat.p1(75);
                    dat.p2(value as number);
                }
            } else if (key === 'manwear3') {
                dat.p1(78);
                dat.p2(value as number);
            } else if (key === 'womanwear3') {
                dat.p1(79);
                dat.p2(value as number);
            } else if (key === 'manhead') {
                dat.p1(90);
                dat.p2(value as number);
            } else if (key === 'womanhead') {
                dat.p1(91);
                dat.p2(value as number);
            } else if (key === 'manhead2') {
                dat.p1(92);
                dat.p2(value as number);
            } else if (key === 'womanhead2') {
                dat.p1(93);
                dat.p2(value as number);
            } else if (key === 'category') {
                if (transmitAll === true) {
                    dat.p1(94);
                    dat.p2(value as number);
                }
            } else if (key === '2dzan') {
                dat.p1(95);
                dat.p2(value as number);
            } else if (key === 'dummyitem') {
                if (transmitAll === true) {
                    dat.p1(96);
                    dat.p1(value as number);
                }
            } else if (key === 'certlink') {
                dat.p1(97);
                dat.p2(value as number);
            } else if (key === 'certtemplate') {
                dat.p1(98);
                dat.p2(value as number);
            } else if (key.startsWith('count')) {
                const index = parseInt(key.substring('count'.length)) - 1;
                const values = value as number[];

                dat.p1(100 + index);
                dat.p2(values[0]);
                dat.p2(values[1]);
            } else if (key === 'tradeable') {
                if (transmitAll === true) {
                    if (value === true) {
                        dat.p1(200);
                    }
                }
            } else if (key === 'respawnrate') {
                if (transmitAll === true) {
                    dat.p1(201);
                    dat.p2(value as number);
                }
            }
        }

        if (recol_s.length > 0) {
            dat.p1(40);
            dat.p1(recol_s.length);

            for (let k = 0; k < recol_s.length; k++) {
                dat.p2(recol_s[k]);
                dat.p2(recol_d[k]);
            }
        }

        if (name !== null) {
            dat.p1(2);
            dat.pjstr(name);
        }

        if (transmitAll === true && params.length > 0) {
            dat.p1(249);

            dat.p1(params.length);
            for (let k = 0; k < params.length; k++) {
                const paramData = params[k] as ParamValue;
                dat.p3(paramData.id);
                dat.pbool(paramData.type === ScriptVarType.STRING);

                if (paramData.type === ScriptVarType.STRING) {
                    dat.pjstr(paramData.value as string);
                } else {
                    dat.p4(paramData.value as number);
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

export function packObjClient(configs: Map<string, ConfigLine[]>) {
    return packObjConfig(configs, false);
}

export function packObjServer(configs: Map<string, ConfigLine[]>) {
    return packObjConfig(configs, true);
}
