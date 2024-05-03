import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import { ConfigType } from '#lostcity/cache/ConfigType.js';
import ScriptVarType from '#lostcity/cache/ScriptVarType.js';

export default class ParamType extends ConfigType {
    private static configNames = new Map<string, number>();
    private static configs: ParamType[] = [];

    static load(dir: string) {
        ParamType.configNames = new Map();
        ParamType.configs = [];

        if (!fs.existsSync(`${dir}/server/param.dat`)) {
            console.log('Warning: No param.dat found.');
            return;
        }

        const dat = Packet.load(`${dir}/server/param.dat`);
        const count = dat.g2();

        for (let id = 0; id < count; id++) {
            const config = new ParamType(id);
            config.decodeType(dat);

            ParamType.configs[id] = config;

            if (config.debugname) {
                ParamType.configNames.set(config.debugname, id);
            }
        }
    }

    static get(id: number): ParamType {
        return ParamType.configs[id];
    }

    static getId(name: string): number {
        return ParamType.configNames.get(name) ?? -1;
    }

    static getByName(name: string): ParamType | null {
        const id = this.getId(name);
        if (id === -1) {
            return null;
        }

        return this.get(id);
    }

    static get count() {
        return this.configs.length;
    }

    // ----
    type = ScriptVarType.INT;
    defaultInt = -1;
    defaultString: string | null = null;
    autodisable = true;

    decode(code: number, dat: Packet) {
        if (code === 1) {
            this.type = dat.g1();
        } else if (code === 2) {
            this.defaultInt = dat.g4();
        } else if (code === 4) {
            this.autodisable = false;
        } else if (code === 5) {
            this.defaultString = dat.gjstr();
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else {
            throw new Error(`Unrecognized param config code: ${code}`);
        }
    }

    getType() {
        switch (this.type) {
            case ScriptVarType.INT:
                return 'int';
            case ScriptVarType.STRING:
                return 'string';
            case ScriptVarType.ENUM:
                return 'enum';
            case ScriptVarType.OBJ:
                return 'obj';
            case ScriptVarType.LOC:
                return 'loc';
            case ScriptVarType.COMPONENT:
                return 'component';
            case ScriptVarType.NAMEDOBJ:
                return 'namedobj';
            case ScriptVarType.STRUCT:
                return 'struct';
            case ScriptVarType.BOOLEAN:
                return 'boolean';
            case ScriptVarType.COORD:
                return 'coord';
            case ScriptVarType.CATEGORY:
                return 'category';
            case ScriptVarType.SPOTANIM:
                return 'spotanim';
            case ScriptVarType.NPC:
                return 'npc';
            case ScriptVarType.INV:
                return 'inv';
            case ScriptVarType.SYNTH:
                return 'synth';
            case ScriptVarType.SEQ:
                return 'seq';
            case ScriptVarType.STAT:
                return 'stat';
            case ScriptVarType.INTERFACE:
                return 'interface';
            default:
                return 'unknown';
        }
    }

    isString() {
        return this.type === ScriptVarType.STRING;
    }

    get default() {
        return this.isString() ? this.defaultString : this.defaultInt;
    }
}
