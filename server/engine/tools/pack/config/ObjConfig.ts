import ObjType from '#/cache/config/ObjType.js';
import ParamType from '#/cache/config/ParamType.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import ColorConversion from '#/util/ColorConversion.js';
import { printWarning } from '#/util/Logger.js';
import { CategoryPack, ModelPack, ObjPack, SeqPack } from '#tools/pack/PackFile.js';
import { ParamValue, ConfigValue, ConfigLine, PackedData, isConfigBoolean, getConfigBoolean, packStepError } from '#tools/pack/config/PackShared.js';
import { lookupParamValue } from '#tools/pack/config/ParamConfig.js';

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
        'cost', 'respawnrate',
        'resizex', 'resizey', 'resizez',
        'ambient', 'contrast',
        'team'
    ];
    // prettier-ignore
    const booleanKeys = [
        'stackable', 'members', 'tradeable'
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

        return number;
    } else if (booleanKeys.includes(key)) {
        if (!isConfigBoolean(value)) {
            return null;
        }

        return getConfigBoolean(value);
    } else if (key === 'model' || key === 'manwear2' || key === 'womanwear2' || key === 'manwear3' || key === 'womanwear3' || key === 'manhead' || key === 'womanhead' || key === 'manhead2' || key === 'womanhead2') {
        const index = ModelPack.getByName(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else if (key.startsWith('recol')) {
        const index = parseInt(key[5]);
        if (index > 9) {
            return null;
        }

        return parseInt(value);
    } else if (key === 'code10') {
        const index = SeqPack.getByName(value);
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

        const model = ModelPack.getByName(parts[0]);
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

        const obj = ObjPack.getByName(parts[0]);
        if (obj === -1) {
            return null;
        }

        const count = parseInt(parts[1]);
        if (isNaN(count) || count < 1 || count > 65535) {
            return null;
        }

        return [obj, count];
    } else if (key === 'category') {
        const index = CategoryPack.getByName(value);
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
    } else if (key === 'certlink' || key === 'certtemplate') {
        // freshly unpacked
        const index = ObjPack.getByName(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else {
        return undefined;
    }
}

export function packObjConfigs(configs: Map<string, ConfigLine[]>, modelFlags: number[]): { client: PackedData; server: PackedData } {
    const client: PackedData = new PackedData(ObjPack.max);
    const server: PackedData = new PackedData(ObjPack.max);

    const template_for_cert = ObjPack.getByName('template_for_cert');
    if (template_for_cert === -1) {
        printWarning('necessary template_for_cert does not exist');
    }

    for (let id = 0; id < ObjPack.max; id++) {
        const debugname = ObjPack.getById(id);
        let config;

        // todo: cert_ config names get reused... what to do now...
        if (debugname.startsWith('cert_')) {
            const uncert = ObjPack.getByName(debugname.substring('cert_'.length));
            if (uncert === -1) {
                throw packStepError(debugname, 'Cert does not link to anything based on its name.');
            }

            config = [
                { key: 'certlink', value: uncert },
                { key: 'certtemplate', value: template_for_cert }
            ];
        } else {
            config = configs.get(debugname);

            if (config) {
                // if no name we fill with the debug name
                let hasName = false;
                let hasModel = false;
                for (let j = 0; j < config.length; j++) {
                    const key = config[j].key;

                    if (key === 'name') {
                        hasName = true;
                    } else if (key === 'model') {
                        hasModel = true;
                    }
                }

                if (!hasName && hasModel) {
                    const name = debugname.charAt(0).toUpperCase() + debugname.slice(1).replace(/_/g, ' ');
                    config.push({ key: 'name', value: name });
                }
            }
        }

        if (config) {
            // collect these to write at the end
            const recol_s: number[] = [];
            const recol_d: number[] = [];
            let name: string | null = null;
            const params: ParamValue[] = [];

            // used for model_index
            const model: number[] = [];
            const worn: number[] = [];
            let members: boolean = false;

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
                    client.p1(1);
                    client.p2(value as number);
                    model.push(value as number);
                } else if (key === 'desc') {
                    client.p1(3);
                    client.pjstr(value as string);
                } else if (key === '2dzoom') {
                    client.p1(4);
                    client.p2(value as number);
                } else if (key === '2dxan') {
                    client.p1(5);
                    client.p2(value as number);
                } else if (key === '2dyan') {
                    client.p1(6);
                    client.p2(value as number);
                } else if (key === '2dxof') {
                    client.p1(7);
                    client.p2(value as number);
                } else if (key === '2dyof') {
                    client.p1(8);
                    client.p2(value as number);
                } else if (key === 'code10') {
                    client.p1(10);
                    client.p2(value as number);
                } else if (key === 'stackable') {
                    if (value === true) {
                        client.p1(11);
                    }
                } else if (key === 'cost') {
                    client.p1(12);
                    client.p4(value as number);
                } else if (key === 'wearpos') {
                    server.p1(13);
                    server.p1(value as number);
                } else if (key === 'wearpos2') {
                    server.p1(14);
                    server.p1(value as number);
                } else if (key === 'tradeable') {
                    if (value === false) {
                        server.p1(15);
                    }
                } else if (key === 'members') {
                    if (value === true) {
                        client.p1(16);
                        members = true;
                    }
                } else if (key === 'manwear') {
                    const values = value as number[];
                    client.p1(23);
                    client.p2(values[0]);
                    client.p1(values[1]);
                    worn.push(values[0]);
                } else if (key === 'manwear2') {
                    client.p1(24);
                    client.p2(value as number);
                    worn.push(value as number);
                } else if (key === 'womanwear') {
                    const values = value as number[];
                    client.p1(25);
                    client.p2(values[0]);
                    client.p1(values[1]);
                    worn.push(values[0]);
                } else if (key === 'womanwear2') {
                    client.p1(26);
                    client.p2(value as number);
                    worn.push(value as number);
                } else if (key === 'wearpos3') {
                    server.p1(27);
                    server.p1(value as number);
                } else if (key.startsWith('op')) {
                    const index = parseInt(key.substring('op'.length)) - 1;
                    client.p1(30 + index);
                    client.pjstr(value as string);
                } else if (key.startsWith('iop')) {
                    const index = parseInt(key.substring('iop'.length)) - 1;
                    client.p1(35 + index);
                    client.pjstr(value as string);
                } else if (key === 'weight') {
                    server.p1(75);
                    server.p2(value as number);
                } else if (key === 'manwear3') {
                    client.p1(78);
                    client.p2(value as number);
                    worn.push(value as number);
                } else if (key === 'womanwear3') {
                    client.p1(79);
                    client.p2(value as number);
                    worn.push(value as number);
                } else if (key === 'manhead') {
                    client.p1(90);
                    client.p2(value as number);
                    modelFlags[value as number] |= 0x80;
                } else if (key === 'womanhead') {
                    client.p1(91);
                    client.p2(value as number);
                    modelFlags[value as number] |= 0x80;
                } else if (key === 'manhead2') {
                    client.p1(92);
                    client.p2(value as number);
                    modelFlags[value as number] |= 0x80;
                } else if (key === 'womanhead2') {
                    client.p1(93);
                    client.p2(value as number);
                    modelFlags[value as number] |= 0x80;
                } else if (key === 'category') {
                    server.p1(94);
                    server.p2(value as number);
                } else if (key === '2dzan') {
                    client.p1(95);
                    client.p2(value as number);
                } else if (key === 'dummyitem') {
                    server.p1(96);
                    server.p1(value as number);
                } else if (key === 'certlink') {
                    client.p1(97);
                    client.p2(value as number);
                } else if (key === 'certtemplate') {
                    client.p1(98);
                    client.p2(value as number);
                } else if (key.startsWith('count')) {
                    const index = parseInt(key.substring('count'.length)) - 1;
                    const values = value as number[];

                    client.p1(100 + index);
                    client.p2(values[0]);
                    client.p2(values[1]);
                } else if (key === 'resizex') {
                    client.p1(110);
                    client.p2(value as number);
                } else if (key === 'resizey') {
                    client.p1(111);
                    client.p2(value as number);
                } else if (key === 'resizez') {
                    client.p1(112);
                    client.p2(value as number);
                } else if (key === 'ambient') {
                    client.p1(113);
                    client.p1(value as number);
                } else if (key === 'contrast') {
                    client.p1(114);
                    client.p1(value as number);
                } else if (key === 'team') {
                    client.p1(115);
                    client.p1(value as number);
                } else if (key === 'respawnrate') {
                    server.p1(201);
                    server.p2(value as number);
                }
            }

            if (members) {
                for (let i = 0; i < model.length; i++) {
                    modelFlags[model[i]] |= 0x40;
                }

                for (let i = 0; i < worn.length; i++) {
                    modelFlags[worn[i]] |= 0x10;
                }
            } else {
                for (let i = 0; i < model.length; i++) {
                    modelFlags[model[i]] |= 0x20;
                }

                for (let i = 0; i < worn.length; i++) {
                    modelFlags[worn[i]] |= 0x08;
                }
            }

            // reverse-lookup the certificate (so the server can find it quicker)
            const cert = ObjPack.getByName('cert_' + debugname);
            if (cert !== -1) {
                server.p1(97);
                server.p2(cert);
            }

            if (recol_s.length > 0) {
                client.p1(40);
                client.p1(recol_s.length);

                for (let k = 0; k < recol_s.length; k++) {
                    if (recol_s[k] >= 100 || recol_d[k] >= 100) {
                        client.p2(ColorConversion.rgb15toHsl16(recol_s[k]));
                        client.p2(ColorConversion.rgb15toHsl16(recol_d[k]));
                    } else {
                        client.p2(recol_s[k]);
                        client.p2(recol_d[k]);
                    }
                }
            }

            if (name !== null) {
                client.p1(2);
                client.pjstr(name);
            }

            if (params.length > 0) {
                server.p1(249);

                server.p1(params.length);
                for (let k = 0; k < params.length; k++) {
                    const paramData = params[k];
                    server.p3(paramData.id);
                    server.pbool(paramData.type === ScriptVarType.STRING);

                    if (paramData.type === ScriptVarType.STRING) {
                        server.pjstr(paramData.value as string);
                    } else {
                        server.p4(paramData.value as number);
                    }
                }
            }
        }

        if (debugname.length) {
            server.p1(250);
            server.pjstr(debugname);
        }

        client.next();
        server.next();
    }

    return { client, server };
}
