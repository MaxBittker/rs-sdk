import DbTableType from '#/cache/config/DbTableType.js';
import ScriptVarType from '#/cache/config/ScriptVarType.js';
import { DbRowPack, DbTablePack } from '#tools/pack/PackFile.js';
import { ConfigValue, ConfigLine, packStepError, PackedData, isConfigBoolean, getConfigBoolean } from '#tools/pack/config/PackShared.js';
import { lookupParamValue } from '#tools/pack/config/ParamConfig.js';

function parseCsv(str: string): string[] {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < str.length; i++) {
        const char = str.charAt(i);

        if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else {
            current += char;
        }
    }

    result.push(current);
    return result;
}

export function parseDbRowConfig(key: string, value: string): ConfigValue | null | undefined {
    const stringKeys: string[] = [];
    const numberKeys: string[] = [];
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

        return number;
    } else if (booleanKeys.includes(key)) {
        if (!isConfigBoolean(value)) {
            return null;
        }

        return getConfigBoolean(value);
    } else if (key === 'table') {
        const index = DbTablePack.getByName(value);
        if (index === -1) {
            return null;
        }

        return index;
    } else if (key === 'data') {
        return value;
    } else {
        return undefined;
    }
}

export function packDbRowConfigs(configs: Map<string, ConfigLine[]>): { client: PackedData; server: PackedData } {
    const client: PackedData = new PackedData(DbRowPack.max);
    const server: PackedData = new PackedData(DbRowPack.max);

    for (let id = 0; id < DbRowPack.max; id++) {
        const debugname = DbRowPack.getById(id);
        const config = configs.get(debugname);

        if (config) {
            let table = null;
            for (let j = 0; j < config.length; j++) {
                const { key, value } = config[j];

                if (key === 'table') {
                    table = DbTableType.get(value as number);
                }
            }

            if (!table) {
                throw packStepError(debugname, 'No table defined for dbrow');
            }

            const data = [];
            for (let j = 0; j < config.length; j++) {
                const { key, value } = config[j];

                if (key === 'data') {
                    // values have a few rules:
                    // 1) the format is data=column,value,value,value,value,value
                    // 2) the first value is the column name
                    // 3) the rest of the values are the values for that column, in order
                    // 4) if a string has a comma in it, it must be quoted
                    const parts = parseCsv(value as string);
                    const column = parts.shift();
                    const values = parts;

                    if (typeof column === 'undefined' || table.columnNames.indexOf(column) === -1) {
                        throw packStepError(debugname, `Data invalid in row, double-check the column exists: data=${value}`);
                    }

                    data.push({ column, values });
                }
            }

            if (data.length) {
                server.p1(3);

                server.p1(table.types.length);
                for (let i = 0; i < table.types.length; i++) {
                    server.p1(i);

                    const types = table.types[i];
                    server.p1(types.length);
                    for (let j = 0; j < types.length; j++) {
                        server.p1(types[j]);
                    }

                    const columnName = table.columnNames[i];
                    const fields = data.filter(d => d.column === columnName);
                    const props = table.props[i];

                    if ((props & DbTableType.REQUIRED) !== 0 && !fields.length) {
                        throw packStepError(debugname, `${columnName} column is marked REQUIRED, please add data for it`);
                    }

                    if ((props & DbTableType.LIST) === 0 && fields.length > 1) {
                        throw packStepError(debugname, `${columnName} column has multiple data values but is not marked as LIST`);
                    }

                    server.p1(fields.length);
                    for (let j = 0; j < fields.length; j++) {
                        const values = fields[j].values;

                        for (let k = 0; k < values.length; k++) {
                            const type = types[k];
                            const value = lookupParamValue(type, values[k]);
                            if (value === null) {
                                throw packStepError(debugname, `Data invalid in row, double-check the reference exists: data=${fields[j].column},${values.join(',')}`);
                            }

                            if (type === ScriptVarType.STRING) {
                                server.pjstr(value as string);
                            } else {
                                server.p4(value as number);
                            }
                        }
                    }
                }
                server.p1(255);
            }

            server.p1(4);
            server.p2(table.id);
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
