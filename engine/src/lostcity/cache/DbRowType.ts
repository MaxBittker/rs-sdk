import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import { ConfigType } from '#lostcity/cache/ConfigType.js';
import DbTableType from '#lostcity/cache/DbTableType.js';
import ScriptVarType from '#lostcity/cache/ScriptVarType.js';

export default class DbRowType extends ConfigType {
    private static configNames = new Map<string, number>();
    private static configs: DbRowType[] = [];

    static load(dir: string) {
        DbRowType.configNames = new Map();
        DbRowType.configs = [];

        if (!fs.existsSync(`${dir}/dbrow.dat`)) {
            console.log('Warning: No dbrow.dat found.');
            return;
        }

        const dat = Packet.load(`${dir}/dbrow.dat`);
        const count = dat.g2();

        for (let id = 0; id < count; id++) {
            const config = new DbRowType(id);
            config.decodeType(dat);

            DbRowType.configs[id] = config;

            if (config.debugname) {
                DbRowType.configNames.set(config.debugname, id);
            }
        }
    }

    static get(id: number): DbRowType {
        return DbRowType.configs[id];
    }

    static getId(name: string): number {
        return DbRowType.configNames.get(name) ?? -1;
    }

    static getByName(name: string): DbRowType | null {
        const id = this.getId(name);
        if (id === -1) {
            return null;
        }

        return this.get(id);
    }

    static getInTable(tableId: number): DbRowType[] {
        return DbRowType.configs.filter(config => config.tableId === tableId);
    }

    // ----

    tableId: number = 0;
    types: number[][] = [];
    columnValues: (number | string)[][] = [];

    decode(opcode: number, packet: Packet) {
        if (opcode === 3) {
            const numColumns = packet.g1();
            this.types = new Array(numColumns);
            this.columnValues = new Array(numColumns);

            for (let columnId = packet.g1(); columnId != 255; columnId = packet.g1()) {
                const columnTypes = new Array(packet.g1());

                for (let i = 0; i < columnTypes.length; i++) {
                    columnTypes[i] = packet.g1();
                }

                this.types[columnId] = columnTypes;
                this.columnValues[columnId] = this.decodeValues(packet, columnId);
            }
        } else if (opcode === 4) {
            this.tableId = packet.g2();
        } else if (opcode === 250) {
            this.debugname = packet.gjstr();
        } else {
            throw new Error(`Unrecognized dbtable config code: ${opcode}`);
        }
    }

    getValue(column: number, listIndex: number) {
        const value = this.columnValues[column].slice(listIndex * this.types[column].length, (listIndex + 1) * this.types[column].length);
        if (!value.length) {
            return DbTableType.get(this.tableId).getDefault(column);
        }

        return value;
    }

    decodeValues(packet: Packet, column: number) {
        const types = this.types[column];
        const fieldCount = packet.g1();
        const values: string[] | number[] = new Array(fieldCount * types.length);

        for (let fieldId = 0; fieldId < fieldCount; fieldId++) {
            for (let typeId = 0; typeId < types.length; typeId++) {
                const type = types[typeId];
                const index = typeId + fieldId * types.length;

                if (type === ScriptVarType.STRING) {
                    values[index] = packet.gjstr();
                } else {
                    values[index] = packet.g4s();
                }
            }
        }

        return values;
    }
}
