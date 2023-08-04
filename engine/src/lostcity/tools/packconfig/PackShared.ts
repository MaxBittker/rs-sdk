import fs from 'fs';

import { shouldBuild, validateCategoryPack, validateConfigPack, validateFilesPack, validateInterfacePack, validateScriptPack } from '#lostcity/util/PackFile.js';
import ParamType from '#lostcity/cache/ParamType.js';
import ScriptVarType from '#lostcity/cache/ScriptVarType.js';
import Packet from '#jagex2/io/Packet.js';

console.log('Validating .pack files');
// console.time('Validated .pack files');
export const PACKFILE = new Map<string, string[]>();
PACKFILE.set('anim', validateFilesPack('data/pack/anim.pack', 'data/src/models', '.frame'));
PACKFILE.set('base', validateFilesPack('data/pack/base.pack', 'data/src/models', '.base'));
PACKFILE.set('category', validateCategoryPack());
PACKFILE.set('dbrow', validateConfigPack('data/pack/dbrow.pack', '.dbrow', true));
PACKFILE.set('dbtable', validateConfigPack('data/pack/dbtable.pack', '.dbtable', true));
PACKFILE.set('enum', validateConfigPack('data/pack/enum.pack', '.enum', true));
PACKFILE.set('flo', validateConfigPack('data/pack/flo.pack', '.flo'));
PACKFILE.set('idk', validateConfigPack('data/pack/idk.pack', '.idk'));
PACKFILE.set('interface', validateInterfacePack());
PACKFILE.set('inv', validateConfigPack('data/pack/inv.pack', '.inv', true));
PACKFILE.set('loc', validateConfigPack('data/pack/loc.pack', '.loc'));
PACKFILE.set('mesanim', validateConfigPack('data/pack/mesanim.pack', '.mesanim', true));
PACKFILE.set('model', validateFilesPack('data/pack/model.pack', 'data/src/models', '.ob2'));
PACKFILE.set('npc', validateConfigPack('data/pack/npc.pack', '.npc'));
PACKFILE.set('obj', validateConfigPack('data/pack/obj.pack', '.obj'));
PACKFILE.set('param', validateConfigPack('data/pack/param.pack', '.param', true));
PACKFILE.set('script', validateScriptPack());
PACKFILE.set('seq', validateConfigPack('data/pack/seq.pack', '.seq'));
PACKFILE.set('sound', validateFilesPack('data/pack/sound.pack', 'data/src/sounds', '.synth'));
PACKFILE.set('spotanim', validateConfigPack('data/pack/spotanim.pack', '.spotanim'));
PACKFILE.set('struct', validateConfigPack('data/pack/struct.pack', '.struct', true));
PACKFILE.set('texture', validateFilesPack('data/pack/texture.pack', 'data/src/textures', '.png'));
PACKFILE.set('varp', validateConfigPack('data/pack/varp.pack', '.varp', true));
// console.timeEnd('Validated .pack files');

export function findFiles(path: string, extension: string, results: string[] = []): string[] {
    const files = fs.readdirSync(path);

    for (let i = 0; i < files.length; i++) {
        if (fs.statSync(path + '/' + files[i]).isDirectory()) {
            findFiles(path + '/' + files[i], extension, results);
        } else {
            if (files[i].endsWith(extension)) {
                results.push(path + '/' + files[i]);
            }
        }
    }

    return results;
}

export function readFiles(files: string[]): Map<string, string> {
    const contents = new Map<string, string>(); // key: file, value: content

    for (let i = 0; i < files.length; i++) {
        contents.set(files[i], fs.readFileSync(files[i], 'utf8').replace(/\r/g, ''));
    }

    return contents;
}

export function parseStepError(file: string, lineNumber: number, message: string) {
    console.error(`\nError during parsing - see ${file}:${lineNumber + 1}`);
    console.error(message);
    process.exit(1);
}

export function packStepError(debugname: string, message: string) {
    console.error(`\nError during packing - [${debugname}]`);
    console.error(message);
    process.exit(1);
}

export type ParamValue = { param: number, value: string | number | boolean };
export type LocModelShape = { model: number, shape: number };
export type ConfigValue = string | number | boolean | number[] | LocModelShape[] | ParamValue;
export type ConfigLine = { key: string, value: ConfigValue };

// we're using null for invalid values, undefined for invalid keys
export type ConfigParseCallback = (key: string, value: string) => ConfigValue | null | undefined;
export type ConfigDatIdx = { dat: Packet, idx: Packet };
export type ConfigPackCallback = (configs: Map<string, ConfigLine[]>) => ConfigDatIdx;
export type ConfigSaveCallback = (dat: Packet, idx: Packet) => void;

export function readConfigs(extension: string, requiredProperties: string[], parse: ConfigParseCallback, pack: ConfigPackCallback, save: ConfigSaveCallback) {
    const files = readFiles(findFiles('data/src/scripts', extension));

    const configs = new Map<string, ConfigLine[]>();
    files.forEach((value, file) => {
        const lines = value.split('\n');

        let debugname: string | null = null;
        let config: ConfigLine[] = [];

        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const line = lines[lineNumber];
            if (line.length === 0 || line.startsWith('//')) {
                continue;
            }

            if (line.startsWith('[')) {
                if (!line.endsWith(']')) {
                    throw parseStepError(file, lineNumber, `Missing closing bracket: ${line}`);
                }

                if (debugname !== null) {
                    if (requiredProperties.length > 0) {
                        // check config keys against requiredProperties
                        for (let i = 0; i < requiredProperties.length; i++) {
                            if (!config.some((value) => value.key === requiredProperties[i])) {
                                throw parseStepError(file, -1, `Missing required property: ${requiredProperties[i]}`);
                            }
                        }
                    }

                    configs.set(debugname, config);
                }

                debugname = line.substring(1, line.length - 1);
                if (!debugname.length) {
                    throw parseStepError(file, lineNumber, 'No config name');
                }

                if (configs.has(debugname)) {
                    throw parseStepError(file, lineNumber, `Duplicate config found: ${debugname}`);
                }

                config = [];
                continue;
            }

            const separator = line.indexOf('=');
            if (separator === -1) {
                throw parseStepError(file, lineNumber, `Missing property separator: ${line}`);
            }

            const key = line.substring(0, separator);
            const value = line.substring(separator + 1);

            const parsed = parse(key, value);
            if (parsed === null) {
                throw parseStepError(file, lineNumber, `Invalid property value: ${line}`);
            } else if (typeof parsed === 'undefined') {
                throw parseStepError(file, lineNumber, `Invalid property key: ${line}`);
            }

            config.push({ key, value: parsed });
        }

        if (debugname !== null) {
            if (requiredProperties.length > 0) {
                // check config keys against requiredProperties
                for (let i = 0; i < requiredProperties.length; i++) {
                    if (!config.some((value) => value.key === requiredProperties[i])) {
                        throw parseStepError(file, -1, `Missing required property: ${requiredProperties[i]}`);
                    }
                }
            }

            configs.set(debugname, config);
        }
    });

    const { dat, idx } = pack(configs);
    save(dat, idx);
}

// ---- Params ----

const stats: string[] = [
    'attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer',
    'magic', 'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking',
    'crafting', 'smithing', 'mining', 'herblore', 'agility', 'thieving',
    'stat18', 'stat19', 'runecraft'
];

export function lookupParamValue(type: number, value: string): string | number | null {
    if (value === 'null' && type !== ScriptVarType.STRING) {
        return -1;
    } else if (value === 'null') {
        return '';
    }

    let index = -1;
    switch (type) {
        case ScriptVarType.INT:
            return parseInt(value);
        case ScriptVarType.STRING:
            return value;
        case ScriptVarType.BOOLEAN:
            return value === 'yes' ? 1 : 0;
        case ScriptVarType.COORD: {
            const parts = value.split('_');
            const level = parseInt(parts[0]);
            const mX = parseInt(parts[1]);
            const mZ = parseInt(parts[2]);
            const lX = parseInt(parts[3]);
            const lZ = parseInt(parts[4]);

            const x = (mX << 6) + lX;
            const z = (mZ << 6) + lZ;
            return z | (x << 14) | (level << 28);
        }
        case ScriptVarType.ENUM:
            index = PACKFILE.get('enum')!.indexOf(value);
            break;
        case ScriptVarType.NAMEDOBJ:
        case ScriptVarType.OBJ:
            index = PACKFILE.get('obj')!.indexOf(value);
            break;
        case ScriptVarType.LOC:
            index = PACKFILE.get('loc')!.indexOf(value);
            break;
        case ScriptVarType.COMPONENT:
            index = PACKFILE.get('interface')!.indexOf(value);
            break;
        case ScriptVarType.STRUCT:
            index = PACKFILE.get('struct')!.indexOf(value);
            break;
        case ScriptVarType.CATEGORY:
            index = PACKFILE.get('category')!.indexOf(value);
            break;
        case ScriptVarType.SPOTANIM:
            index = PACKFILE.get('spotanim')!.indexOf(value);
            break;
        case ScriptVarType.NPC:
            index = PACKFILE.get('npc')!.indexOf(value);
            break;
        case ScriptVarType.INV:
            index = PACKFILE.get('inv')!.indexOf(value);
            break;
        case ScriptVarType.SYNTH:
            index = PACKFILE.get('sound')!.indexOf(value);
            break;
        case ScriptVarType.SEQ:
            index = PACKFILE.get('seq')!.indexOf(value);
            break;
        case ScriptVarType.STAT:
            index = stats.indexOf(value);
            break;
        case ScriptVarType.VARP:
            index = PACKFILE.get('varp')!.indexOf(value);
            break;
    }

    if (index === -1) {
        return null;
    }

    return index;
}

// We have to pack params first so might as well do in this shared file
if (shouldBuild('data/src/scripts', '.param', 'data/pack/server/param.dat')) {
    readConfigs('.param', ['type'], (key: string, value: string): ConfigValue | null | undefined => {
        if (key === 'type') {
            return ScriptVarType.getTypeChar(value);
        } else if (key === 'default') {
            return value; // defer lookup to pack callback
        } else if (key === 'autodisable') {
            if (value !== 'yes' && value !== 'no') {
                return null;
            }

            return value === 'yes' ? true : false;
        } else {
            return undefined;
        }
    }, (configs: Map<string, ConfigLine[]>) => {
        const paramPack = PACKFILE.get('param')!;

        const dat = new Packet();
        const idx = new Packet();
        dat.p2(paramPack.length);
        idx.p2(paramPack.length);

        for (let i = 0; i < paramPack.length; i++) {
            const debugname = paramPack[i];
            const config = configs.get(debugname)!;

            const start = dat.pos;

            // need to read ahead for type info to do default lookup
            const type = config.find(({ key }) => key === 'type')!.value as number;

            for (let j = 0; j < config.length; j++) {
                const { key, value } = config[j];

                if (key === 'type') {
                    dat.p1(1);
                    dat.p1(value as number);
                } else if (key === 'default') {
                    const paramValue = lookupParamValue(type, value as string);
                    if (paramValue === null) {
                        throw packStepError(debugname, `Invalid default value: ${value}`);
                    }

                    if (type === ScriptVarType.STRING) {
                        dat.p1(5);
                        dat.pjstr(paramValue as string);
                    } else {
                        dat.p1(2);
                        dat.p4(paramValue as number);
                    }
                } else if (key === 'autodisable') {
                    if (value === false) {
                        dat.p1(4);
                    }
                }
            }

            dat.p1(250);
            dat.pjstr(debugname);

            dat.p1(0);
            idx.p2(dat.pos - start);
        }

        return { dat, idx };
    }, (dat: Packet, idx: Packet) => {
        dat.save('data/pack/server/param.dat');
        idx.save('data/pack/server/param.idx');
    });
}

// Now that they're up to date, load them for us to use elsewhere during this process
ParamType.load('data/pack/server');
