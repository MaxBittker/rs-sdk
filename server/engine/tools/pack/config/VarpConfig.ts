import ScriptVarType from '#/cache/config/ScriptVarType.js';
import VarPlayerType from '#/cache/config/VarPlayerType.js';
import { VarpPack } from '#tools/pack/PackFile.js';
import { PackedData, ConfigValue, ConfigLine, isConfigBoolean, getConfigBoolean, packStepError } from '#tools/pack/config/PackShared.js';

const persistable = ['int', 'coord', 'boolean', 'obj', 'namedobj'];

export function parseVarpConfig(key: string, value: string): ConfigValue | null | undefined {
    const stringKeys: string[] = [];
    // prettier-ignore
    const numberKeys = [
        'clientcode'
    ];
    // prettier-ignore
    const booleanKeys = [
        'protect', 'transmit'
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
    } else if (key === 'scope') {
        if (value === 'perm') {
            return VarPlayerType.SCOPE_PERM;
        } else if (value === 'temp') {
            return VarPlayerType.SCOPE_TEMP;
        } else {
            return null;
        }
    } else if (key === 'type') {
        return ScriptVarType.getTypeChar(value);
    } else {
        return undefined;
    }
}

export function packVarpConfigs(configs: Map<string, ConfigLine[]>): { client: PackedData; server: PackedData } {
    const client: PackedData = new PackedData(VarpPack.max);
    const server: PackedData = new PackedData(VarpPack.max);

    for (let id = 0; id < VarpPack.max; id++) {
        const debugname = VarpPack.getById(id);
        const config = configs.get(debugname);

        if (config) {
            let scope = VarPlayerType.SCOPE_TEMP;
            let type = ScriptVarType.INT;

            for (let j = 0; j < config.length; j++) {
                const { key, value } = config[j];

                if (key === 'scope') {
                    scope = value as number;

                    server.p1(1);
                    server.p1(scope);
                } else if (key === 'type') {
                    type = value as number;

                    server.p1(2);
                    server.p1(type);
                } else if (key === 'protect') {
                    if (value === false) {
                        server.p1(4);
                    }
                } else if (key === 'clientcode') {
                    client.p1(5);
                    client.p2(value as number);
                } else if (key === 'transmit') {
                    if (value === true) {
                        server.p1(6);
                    }
                }
            }

            const typeName = ScriptVarType.getType(type);
            if (scope == VarPlayerType.SCOPE_PERM && !persistable.includes(typeName)) {
                throw packStepError(debugname, `scope=perm varps cannot be type=${typeName}`);
            }
        }

        if (debugname.length) {
            server.p1(250); // todo: maybe this was opcode 10?
            server.pjstr(debugname);
        }

        client.next();
        server.next();
    }

    return { client, server };
}
