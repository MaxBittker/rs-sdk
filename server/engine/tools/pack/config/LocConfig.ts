import ParamType from '#/cache/config/ParamType.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import ColorConversion from '#/util/ColorConversion.js';
import { CategoryPack, LocPack, ModelPack, SeqPack, TexturePack } from '#tools/pack/PackFile.js';
import { LocModelShape, ConfigValue, ConfigLine, ParamValue, PackedData, isConfigBoolean, getConfigBoolean, packStepError } from '#tools/pack/config/PackShared.js';
import { lookupParamValue } from '#tools/pack/config/ParamConfig.js';

// these suffixes are simply the map editor keybinds
enum LocShapeSuffix {
    _1 = 0, // wall_straight
    _2 = 1, // wall_diagonalcorner
    _3 = 2, // wall_l
    _4 = 3, // wall_squarecorner
    _q = 4, // walldecor_straight_nooffset
    _5 = 9, // wall_diagonal
    _w = 5, // walldecor_straight_offset
    _r = 6, // walldecor_diagonal_offset
    _e = 7, // walldecor_diagonal_nooffset
    _t = 8, // walldecor_diagonal_both
    _8 = 10, // centrepiece_straight
    _9 = 11, // centrepiece_diagonal
    _0 = 22, // grounddecor
    _a = 12, // roof_straight
    _s = 13, // roof_diagonal_with_roofedge
    _d = 14, // roof_diagonal
    _f = 15, // roof_l_concave
    _g = 16, // roof_l_convex
    _h = 17, // roof_flat
    _z = 18, // roofedge_straight
    _x = 19, // roofedge_diagonalcorner
    _c = 20, // roofedge_l
    _v = 21 // roofedge_squarecorner
}

export function parseLocConfig(key: string, value: string): ConfigValue | null | undefined {
    // prettier-ignore
    const stringKeys = [
        'name', 'desc',
        'op1', 'op2', 'op3', 'op4', 'op5',
        // defer parsing to packing stage:
        'model', 'model2', 'model3', 'model4', 'model5',
    ];
    // prettier-ignore
    const numberKeys = [
        'width', 'length',
        'wallwidth',
        'ambient', 'contrast',
        'mapfunction',
        'resizex', 'resizey', 'resizez',
        'mapscene',
        'offsetx', 'offsety', 'offsetz'
    ];
    // prettier-ignore
    const booleanKeys = [
        'blockwalk', 'blockrange',
        'active', 'hillskew', 'sharelight', 'occlude',
        'hasalpha',
        'mirror', 'shadow',
        'forcedecor',
        'breakroutefinding', 'raiseobject'
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
    } else if (key.startsWith('recol')) {
        const index = parseInt(key[5]);
        if (index > 9) {
            return null;
        }

        return ColorConversion.rgb15toHsl16(parseInt(value));
    } else if (key.startsWith('retex')) {
        const index = parseInt(key[5]);
        if (index > 9) {
            return null;
        }

        const texture = TexturePack.getByName(value);
        if (texture === -1) {
            return null;
        }

        return texture;
    } else if (key === 'category') {
        const index = CategoryPack.getByName(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else if (key === 'anim') {
        const index = SeqPack.getByName(value);
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
    } else if (key === 'forceapproach') {
        let flags = 0b1111;
        switch (value) {
            case 'north':
                flags &= ~0b0001;
                break;
            case 'east':
                flags &= ~0b0010;
                break;
            case 'south':
                flags &= ~0b0100;
                break;
            case 'west':
                flags &= ~0b1000;
                break;
        }
        return flags;
    } else {
        return undefined;
    }
}

export function packLocConfigs(configs: Map<string, ConfigLine[]>, modelFlags: number[]): { client: PackedData; server: PackedData } {
    const client: PackedData = new PackedData(LocPack.max);
    const server: PackedData = new PackedData(LocPack.max);

    for (let id = 0; id < LocPack.max; id++) {
        const debugname = LocPack.getById(id);
        const config = configs.get(debugname);

        if (config) {
            // collect these to write at the end
            const recol_s: number[] = [];
            const recol_d: number[] = [];
            const srcModels: string[] = [];
            let name: string | null = null;
            let active: number = -1; // not written last, but affects name output
            let desc: string | null = null;
            const params: ParamValue[] = [];

            for (let j = 0; j < config.length; j++) {
                const { key, value } = config[j];

                if (key === 'name') {
                    name = value as string;
                } else if (key === 'desc') {
                    desc = value as string;
                } else if (key.startsWith('model')) {
                    srcModels.push(value as string);
                } else if (key.startsWith('recol')) {
                    const index = parseInt(key[5]) - 1;
                    if (key.endsWith('s')) {
                        recol_s[index] = value as number;
                    } else {
                        recol_d[index] = value as number;
                    }
                } else if (key.startsWith('retex')) {
                    // retextures stored in recol until rev 465
                    const index = parseInt(key[5]) - 1;
                    if (key.endsWith('s')) {
                        recol_s[index] = value as number;
                    } else {
                        recol_d[index] = value as number;
                    }
                } else if (key === 'param') {
                    params.push(value as ParamValue);
                } else if (key === 'width') {
                    client.p1(14);
                    client.p1(value as number);
                } else if (key === 'length') {
                    client.p1(15);
                    client.p1(value as number);
                } else if (key === 'blockwalk') {
                    if (value === false) {
                        client.p1(17);
                    }
                } else if (key === 'blockrange') {
                    if (value === false) {
                        client.p1(18);
                    }
                } else if (key === 'active') {
                    client.p1(19);
                    client.pbool(value as boolean);
                    active = value ? 1 : 0;
                } else if (key === 'hillskew') {
                    if (value === true) {
                        client.p1(21);
                    }
                } else if (key === 'sharelight') {
                    if (value === true) {
                        client.p1(22);
                    }
                } else if (key === 'occlude') {
                    if (value === true) {
                        client.p1(23);
                    }
                } else if (key === 'anim') {
                    client.p1(24);
                    client.p2(value as number);
                } else if (key === 'hasalpha') {
                    if (value === true) {
                        client.p1(25);
                    }
                } else if (key === 'wallwidth') {
                    client.p1(28);
                    client.p1(value as number);
                } else if (key === 'ambient') {
                    client.p1(29);
                    client.p1(value as number);
                } else if (key === 'contrast') {
                    client.p1(39);
                    client.p1(value as number);
                } else if (key.startsWith('op')) {
                    const index = parseInt(key.substring('op'.length)) - 1;
                    client.p1(30 + index);
                    client.pjstr(value as string);
                } else if (key === 'mapfunction') {
                    client.p1(60);
                    client.p2(value as number);
                } else if (key === 'category') {
                    server.p1(61);
                    server.p2(value as number);
                } else if (key === 'mirror') {
                    if (value === true) {
                        client.p1(62);
                    }
                } else if (key === 'shadow') {
                    if (value === false) {
                        client.p1(64);
                    }
                } else if (key === 'resizex') {
                    client.p1(65);
                    client.p2(value as number);
                } else if (key === 'resizey') {
                    client.p1(66);
                    client.p2(value as number);
                } else if (key === 'resizez') {
                    client.p1(67);
                    client.p2(value as number);
                } else if (key === 'mapscene') {
                    client.p1(68);
                    client.p2(value as number);
                } else if (key === 'forceapproach') {
                    client.p1(69);
                    client.p1(value as number);
                } else if (key === 'offsetx') {
                    client.p1(70);
                    client.p2(value as number);
                } else if (key === 'offsety') {
                    client.p1(71);
                    client.p2(value as number);
                } else if (key === 'offsetz') {
                    client.p1(72);
                    client.p2(value as number);
                } else if (key === 'forcedecor') {
                    if (value === true) {
                        client.p1(73);
                    }
                } else if (key === 'breakroutefinding') {
                    if (value === true) {
                        client.p1(74);
                    }
                } else if (key === 'raiseobject') {
                    client.p1(75);
                    client.pbool(value as boolean);
                }
            }

            if (recol_s.length > 0) {
                client.p1(40);
                client.p1(recol_s.length);

                for (let k = 0; k < recol_s.length; k++) {
                    client.p2(recol_s[k]);
                    client.p2(recol_d[k]);
                }
            }

            const models: LocModelShape[] = [];
            for (let i = 0; i < srcModels.length; i++) {
                let directReference = ModelPack.getByName(srcModels[i]) !== -1;
                for (let shape = 0; shape <= 22; shape++) {
                    if (shape === 10) {
                        continue;
                    }

                    if (ModelPack.getByName(`${srcModels[i]}${LocShapeSuffix[shape]}`) !== -1) {
                        directReference = false;
                        break;
                    }
                }

                if (directReference) {
                    // if a model directly points to a shape, we are forcing that shape to appear as centrepiece_straight
                    const forceModelId = ModelPack.getByName(srcModels[i]);
                    if (forceModelId !== -1) {
                        modelFlags[forceModelId] |= 0x4;
                        models.push({ model: forceModelId, shape: LocShapeSuffix._8 });
                        continue;
                    }
                }

                // centrepiece_straight comes first in their data, so we check it first
                const modelId = ModelPack.getByName(`${srcModels[i]}_8`);

                if (modelId !== -1) {
                    modelFlags[modelId] |= 0x4;
                    models.push({ model: modelId, shape: LocShapeSuffix._8 });
                }

                // now we can check the rest of the shapes
                for (let shape = 0; shape <= 22; shape++) {
                    if (shape === LocShapeSuffix._8) {
                        continue;
                    }

                    const modelId = ModelPack.getByName(`${srcModels[i]}${LocShapeSuffix[shape]}`);
                    if (modelId !== -1) {
                        modelFlags[modelId] |= 0x4;
                        models.push({ model: modelId, shape });
                    }
                }
            }

            if (srcModels.length > 0 && models.length === 0) {
                throw packStepError(debugname, 'Failed to find suitable loc models');
            }

            if (models.length > 0) {
                let centrepieceOnly = true;
                for (let i = 0; i < models.length; i++) {
                    if (models[i].shape !== LocShapeSuffix._8) {
                        centrepieceOnly = false;
                        break;
                    }
                }

                if (centrepieceOnly) {
                    client.p1(5);

                    client.p1(models.length);
                    for (let i = 0; i < models.length; i++) {
                        client.p2(models[i].model);
                    }
                } else {
                    client.p1(1);

                    client.p1(models.length);
                    for (let i = 0; i < models.length; i++) {
                        client.p2(models[i].model);
                        client.p1(models[i].shape);
                    }
                }
            }

            if (name === null && active !== 0) {
                // edge case: a loc has no name= property but contains a centrepiece_straight shape or active=yes
                //   we have to transmit a name - so we fall back to the debugname
                let shouldTransmit: boolean = active === 1;

                if (active === -1) {
                    for (let i = 0; i < models.length; i++) {
                        if (models[i].shape === LocShapeSuffix._8) {
                            // the presence of any _8 shape means we have to transmit a name
                            shouldTransmit = true;
                            break;
                        }
                    }
                }

                if (shouldTransmit) {
                    name = debugname;
                }
            }

            if (name !== null) {
                client.p1(2);
                client.pjstr(name);
            }

            if (desc !== null) {
                client.p1(3);
                client.pjstr(desc);
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
