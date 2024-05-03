import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import { ConfigType } from '#lostcity/cache/ConfigType.js';
import ScriptVarType from '#lostcity/cache/ScriptVarType.js';

export default class DbTableType extends ConfigType {
    private static configNames = new Map<string, number>();
    private static configs: DbTableType[] = [];

    static load(dir: string) {
        DbTableType.configNames = new Map();
        DbTableType.configs = [];

        if (!fs.existsSync(`${dir}/server/dbtable.dat`)) {
            console.log('Warning: No dbtable.dat found.');
            return;
        }

        const dat = Packet.load(`${dir}/server/dbtable.dat`);
        const count = dat.g2();

        for (let id = 0; id < count; id++) {
            const config = new DbTableType(id);
            config.decodeType(dat);

            DbTableType.configs[id] = config;

            if (config.debugname) {
                DbTableType.configNames.set(config.debugname, id);
            }
        }
    }

    static get(id: number): DbTableType {
        return DbTableType.configs[id];
    }

    static getId(name: string): number {
        return DbTableType.configNames.get(name) ?? -1;
    }

    static getByName(name: string): DbTableType | null {
        const id = this.getId(name);
        if (id === -1) {
            return null;
        }

        return this.get(id);
    }

    // ----

    types: number[][] = [];
    defaultValues: (string | number)[][] = [];
    columnNames: string[] = [];

    decode(code: number, dat: Packet) {
        if (code === 1) {
            this.types = new Array(dat.g1());

            for (let setting = dat.g1(); setting != 255; setting = dat.g1()) {
                const column = setting & 0x7f;
                const hasDefault = (setting & 0x80) !== 0;

                const columnTypes: number[] = new Array(dat.g1());
                for (let i = 0; i < columnTypes.length; i++) {
                    columnTypes[i] = dat.g1();
                }
                this.types[column] = columnTypes;

                if (hasDefault) {
                    if (!this.defaultValues) {
                        this.defaultValues = new Array(this.types.length);
                    }

                    this.defaultValues[column] = this.decodeValues(dat, column);
                }
            }
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else if (code === 251) {
            this.columnNames = new Array(dat.g1());

            for (let i = 0; i < this.columnNames.length; i++) {
                this.columnNames[i] = dat.gjstr();
            }
        } else {
            throw new Error(`Unrecognized dbtable config code: ${code}`);
        }
    }

    getDefault(column: number) {
        if (!this.defaultValues[column]) {
            const defaults: ReturnType<typeof ScriptVarType.getDefault>[] = [];
            for (let i = 0; i < this.types[column].length; i++) {
                defaults[i] = ScriptVarType.getDefault(this.types[column][i]);
            }
            return defaults;
        }

        return this.defaultValues[column];
    }

    decodeValues(dat: Packet, column: number) {
        const types = this.types[column];
        const fieldCount = dat.g1();
        const values: (string | number)[] = new Array(fieldCount * types.length);

        for (let fieldId = 0; fieldId < fieldCount; fieldId++) {
            for (let typeId = 0; typeId < types.length; typeId++) {
                const type = types[typeId];
                const index = typeId + fieldId * types.length;

                if (type === ScriptVarType.STRING) {
                    values[index] = dat.gjstr();
                } else {
                    values[index] = dat.g4();
                }
            }
        }

        return values;
    }
}
