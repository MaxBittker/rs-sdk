import Packet from '#jagex2/io/Packet.js';

import DbTableType from '#lostcity/cache/DbTableType.js';
import ScriptVarType from '#lostcity/cache/ScriptVarType.js';

import { PACKFILE, ConfigValue, ConfigLine, packStepError } from '#lostcity/tools/packconfig/PackShared.js';
import { lookupParamValue } from '#lostcity/tools/packconfig/ParamConfig.js';

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

        return number;
    } else if (booleanKeys.includes(key)) {
        if (value !== 'yes' && value !== 'no') {
            return null;
        }

        return value === 'yes';
    } else if (key === 'table') {
        const index = PACKFILE.get('dbtable')!.indexOf(value);
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

export function packDbRowConfigs(configs: Map<string, ConfigLine[]>) {
    const pack = PACKFILE.get('dbrow')!;

    const dat = new Packet();
    const idx = new Packet();
    dat.p2(pack.length);
    idx.p2(pack.length);

    for (let i = 0; i < pack.length; i++) {
        const debugname = pack[i];
        const config = configs.get(debugname)!;

        const start = dat.pos;

        let table = null;
        const data = [];

        for (let j = 0; j < config.length; j++) {
            const { key, value } = config[j];

            if (key === 'table') {
                table = DbTableType.get(value as number);
            } else if (key === 'data') {
                // values have a few rules:
                // 1) the format is data=column,value,value,value,value,value
                // 2) the first value is the column name
                // 3) the rest of the values are the values for that column, in order
                // 4) if a string has a comma in it, it must be quoted
                const parts = parseCsv(value as string);
                const column = parts.shift();
                const values = parts;
    
                data.push({ column, values });
            }
        }

        if (data.length && !table) {
            packStepError(debugname, 'No table defined in dbrow config');
            process.exit(1);
        }

        if (data.length) {
            dat.p1(3);
    
            dat.p1(table!.types.length);
            for (let i = 0; i < table!.types.length; i++) {
                dat.p1(i);
    
                const types = table!.types[i];
                dat.p1(types.length);
                for (let j = 0; j < types.length; j++) {
                    dat.p1(types[j]);
                }
    
                const columnName = table!.columnNames[i];
                const fields = data.filter(d => d.column === columnName);

                dat.p1(fields.length);
                for (let j = 0; j < fields.length; j++) {
                    const values = fields[j].values;
    
                    for (let k = 0; k < values.length; k++) {
                        const type = types[k];
                        const value = lookupParamValue(type, values[k]);
    
                        if (type === ScriptVarType.STRING) {
                            dat.pjstr(value as string);
                        } else {
                            dat.p4(value as number);
                        }
                    }
                }
            }
            dat.p1(255);
        }
    
        if (table) {
            dat.p1(4);
            dat.p2(table.id);
        }

        dat.p1(250);
        dat.pjstr(debugname);

        dat.p1(0);
        idx.p2(dat.pos - start);
    }

    return { dat, idx };
}
