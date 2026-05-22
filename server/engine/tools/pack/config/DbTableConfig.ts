import ScriptVarType from '#/cache/config/ScriptVarType.js';
import { DbTablePack } from '#tools/pack/PackFile.js';
import { ConfigValue, ConfigLine, PackedData, isConfigBoolean, getConfigBoolean, packStepError } from '#tools/pack/config/PackShared.js';
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

export function parseDbTableConfig(key: string, value: string): ConfigValue | null | undefined {
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
    } else if (key === 'column') {
        return value;
    } else if (key === 'default') {
        return value;
    } else {
        return undefined;
    }
}

export function packDbTableConfigs(configs: Map<string, ConfigLine[]>) {
    const client: PackedData = new PackedData(DbTablePack.max);
    const server: PackedData = new PackedData(DbTablePack.max);

    for (let id = 0; id < DbTablePack.max; id++) {
        const debugname = DbTablePack.getById(id);
        const config = configs.get(debugname);

        if (config) {
            const columns = [];
            const defaults = [];

            for (let j = 0; j < config.length; j++) {
                const { key, value } = config[j];

                if (key === 'column') {
                    // columns have a few rules:
                    // 1) the format is column=name,type,PROPERTIES
                    // 2) a column can have multiple comma-separated types, it becomes known as a tuple
                    // 3) if a row has multiple data values the column must have the LIST property
                    // 4) default values cannot be assigned to REQUIRED columns
                    // 5) if a column is INDEXED, it must be REQUIRED too
                    // (later versions have CLIENTSIDE properties which control cache transmission)
                    const column = parseCsv(value as string);
                    const name = column.shift();
                    const types = [];
                    const properties = [];

                    for (let j = 0; j < column.length; j++) {
                        const part = column[j];

                        if (part.toUpperCase() === part) {
                            properties.push(part);
                        } else {
                            const typeChar = ScriptVarType.getTypeChar(part);
                            if (typeChar === null) {
                                throw packStepError(debugname, `Invalid column type "${part}"`);
                            }

                            types.push(typeChar);
                        }
                    }

                    if (properties.find(p => p === 'INDEXED') && !properties.find(p => p === 'REQUIRED')) {
                        throw packStepError(debugname, 'INDEXED columns must be marked REQUIRED as well');
                    }

                    columns.push({ name, types, properties });
                } else if (key === 'default') {
                    // default values have a few rules:
                    // 1) the format is default=column,value,value,value,value,value
                    // 2) the first value is the column name
                    // 3) the rest of the values are the default values for that column, in order
                    // 4) if a string has a comma in it, it must be quoted
                    const parts = parseCsv(value as string);
                    const column = parts.shift();
                    const columnIndex = columns.findIndex(col => col.name === column);
                    const values = parts;

                    if (columnIndex === -1) {
                        throw packStepError(debugname, `Could not assign default to column "${column}" - column does not exist`);
                    }

                    if (columns[columnIndex].properties.find(p => p === 'REQUIRED')) {
                        throw packStepError(debugname, `Could not assign default to column "${column}" - no default value is allowed because the column is marked REQUIRED`);
                    }

                    defaults[columnIndex] = values;
                }
            }

            if (columns.length) {
                server.p1(1);

                server.p1(columns.length); // total columns (each one gets encoded based on if they're transmitted)
                for (let i = 0; i < columns.length; i++) {
                    const column = columns[i];

                    let flags = i;
                    if (defaults[i]) {
                        flags |= 0x80;
                    }
                    server.p1(flags);

                    server.p1(column.types.length);
                    for (let j = 0; j < column.types.length; j++) {
                        server.p1(column.types[j] as number);
                    }

                    if (flags & 0x80) {
                        server.p1(1); // # of fields

                        for (let j = 0; j < column.types.length; j++) {
                            const type = column.types[j];
                            const value = lookupParamValue(type as number, defaults[i][j]);
                            if (value === null) {
                                throw packStepError(debugname, `Data invalid in column, double-check the reference exists: default=${column.name},${defaults[i].join(',')}`);
                            }

                            if (type === ScriptVarType.STRING) {
                                server.pjstr(value as string);
                            } else {
                                server.p4(value as number);
                            }
                        }
                    }
                }

                server.p1(255); // end of column tuple
            }

            if (columns.length) {
                server.p1(251);

                server.p1(columns.length);
                for (let i = 0; i < columns.length; i++) {
                    server.pjstr(columns[i].name as string);
                }
            }

            if (columns.length) {
                server.p1(252);

                server.p1(columns.length);
                for (let i = 0; i < columns.length; i++) {
                    const column = columns[i];

                    let props = 0;
                    for (const prop of column.properties) {
                        if (prop === 'INDEXED') {
                            props |= 0x1;
                        } else if (prop === 'REQUIRED') {
                            props |= 0x2;
                        } else if (prop === 'LIST') {
                            props |= 0x4;
                        } else if (prop === 'CLIENTSIDE') {
                            props |= 0x8;
                        }
                    }
                    server.p1(props);
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
