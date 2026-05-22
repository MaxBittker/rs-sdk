import ScriptVarType from '#/cache/config/ScriptVarType.js';
import { CategoryPack, EnumPack, InterfacePack, InvPack, LocPack, NpcPack, ObjPack, ParamPack, SeqPack, SynthPack, SpotAnimPack, StructPack, VarpPack, DbRowPack, MidiPack } from '#tools/pack/PackFile.js';
import { ConfigValue, ConfigLine, packStepError, PackedData, isConfigBoolean, getConfigBoolean } from '#tools/pack/config/PackShared.js';

const stats: (string | null)[] = [
    'attack',
    'defence',
    'strength',
    'hitpoints',
    'ranged',
    'prayer',
    'magic',
    'cooking',
    'woodcutting',
    'fletching',
    'fishing',
    'firemaking',
    'crafting',
    'smithing',
    'mining',
    'herblore',
    'agility',
    'thieving',
    'slayer',
    'farming',
    'runecraft'
];

const npcStats = ['hitpoints', 'attack', 'strength', 'defence', 'magic', 'ranged'];

export function lookupParamValue(type: number, value: string): string | number | null {
    if (value === 'null' && type !== ScriptVarType.STRING) {
        return -1;
    } else if (value === 'null') {
        return '';
    }

    let index = -1;
    switch (type) {
        case ScriptVarType.INT: {
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
        }
        case ScriptVarType.STRING:
            if (value.length > 1000) {
                // arbitrary limit
                return null;
            }

            return value;
        case ScriptVarType.BOOLEAN:
            if (!isConfigBoolean(value)) {
                return null;
            }

            return getConfigBoolean(value) ? 1 : 0;
        case ScriptVarType.COORD: {
            const parts = value.split('_');
            if (parts.length !== 5) {
                return null;
            }

            const level = parseInt(parts[0]);
            const mX = parseInt(parts[1]);
            const mZ = parseInt(parts[2]);
            const lX = parseInt(parts[3]);
            const lZ = parseInt(parts[4]);

            if (isNaN(level) || isNaN(mX) || isNaN(mZ) || isNaN(lX) || isNaN(lZ)) {
                return null;
            }

            if (lZ < 0 || lX < 0 || mZ < 0 || mX < 0 || level < 0) {
                return null;
            }

            if (lZ > 63 || lX > 63 || mZ > 255 || mX > 255 || level > 3) {
                return null;
            }

            const x = (mX << 6) + lX;
            const z = (mZ << 6) + lZ;
            return z | (x << 14) | (level << 28);
        }
        case ScriptVarType.ENUM:
            index = EnumPack.getByName(value);
            break;
        case ScriptVarType.NAMEDOBJ:
        case ScriptVarType.OBJ:
            index = ObjPack.getByName(value);
            break;
        case ScriptVarType.LOC:
            index = LocPack.getByName(value);
            break;
        case ScriptVarType.COMPONENT:
            index = InterfacePack.getByName(value);
            break;
        case ScriptVarType.STRUCT:
            index = StructPack.getByName(value);
            break;
        case ScriptVarType.CATEGORY:
            index = CategoryPack.getByName(value);
            break;
        case ScriptVarType.SPOTANIM:
            index = SpotAnimPack.getByName(value);
            break;
        case ScriptVarType.NPC:
            index = NpcPack.getByName(value);
            break;
        case ScriptVarType.INV:
            index = InvPack.getByName(value);
            break;
        case ScriptVarType.SYNTH:
            index = SynthPack.getByName(value);
            break;
        case ScriptVarType.SEQ:
            index = SeqPack.getByName(value);
            break;
        case ScriptVarType.STAT:
            index = stats.indexOf(value);
            break;
        case ScriptVarType.NPC_STAT:
            index = npcStats.indexOf(value);
            break;
        case ScriptVarType.VARP:
            index = VarpPack.getByName(value);
            break;
        case ScriptVarType.INTERFACE:
            if (value.indexOf(':') !== -1) {
                index = -1;
            } else {
                index = InterfacePack.getByName(value);
            }
            break;
        case ScriptVarType.DBROW:
            index = DbRowPack.getByName(value);
            break;
        case ScriptVarType.MIDI:
            index = MidiPack.getByName(value);
            break;
    }

    return index !== -1 ? index : null;
}

export function parseParamConfig(key: string, value: string): ConfigValue | null | undefined {
    const stringKeys: string[] = [];
    const numberKeys: string[] = [];
    // prettier-ignore
    const booleanKeys: string[] = [
        'autodisable'
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
    } else if (key === 'type') {
        return ScriptVarType.getTypeChar(value);
    } else if (key === 'default') {
        return value; // defer lookup to pack callback
    } else {
        return undefined;
    }
}

export function packParamConfigs(configs: Map<string, ConfigLine[]>): { client: PackedData; server: PackedData } {
    const client: PackedData = new PackedData(ParamPack.max);
    const server: PackedData = new PackedData(ParamPack.max);

    for (let id = 0; id < ParamPack.max; id++) {
        const debugname = ParamPack.getById(id);
        const config = configs.get(debugname);

        if (config) {
            // need to read ahead for type info to do default lookup
            const type = config.find(({ key }) => key === 'type')!.value as number;

            for (let j = 0; j < config.length; j++) {
                const { key, value } = config[j];

                if (key === 'type') {
                    server.p1(1);
                    server.p1(value as number);
                } else if (key === 'default') {
                    const paramValue = lookupParamValue(type, value as string);
                    if (paramValue === null) {
                        throw packStepError(debugname, `Invalid default value: ${value}`);
                    }

                    if (type === ScriptVarType.STRING) {
                        server.p1(5);
                        server.pjstr(paramValue as string);
                    } else {
                        server.p1(2);
                        server.p4(paramValue as number);
                    }
                } else if (key === 'autodisable') {
                    if (value === false) {
                        server.p1(4);
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
