import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import { ConfigType } from '#lostcity/cache/ConfigType.js';
import ScriptVarType from '#lostcity/cache/ScriptVarType.js';

export default class VarNpcType extends ConfigType {
    private static configNames = new Map<string, number>();
    private static configs: VarNpcType[] = [];

    static load(dir: string) {
        VarNpcType.configNames = new Map();
        VarNpcType.configs = [];

        if (!fs.existsSync(`${dir}/server/varn.dat`)) {
            console.log('Warning: No varn.dat found.');
            return;
        }

        const dat = Packet.load(`${dir}/server/varn.dat`);
        const count = dat.g2();

        for (let id = 0; id < count; id++) {
            const config = new VarNpcType(id);
            config.decodeType(dat);

            VarNpcType.configs[id] = config;

            if (config.debugname) {
                VarNpcType.configNames.set(config.debugname, id);
            }
        }
    }

    static get(id: number): VarNpcType {
        return VarNpcType.configs[id];
    }

    static getId(name: string): number {
        return VarNpcType.configNames.get(name) ?? -1;
    }

    static getByName(name: string): VarNpcType | null {
        const id = this.getId(name);
        if (id === -1) {
            return null;
        }

        return this.get(id);
    }

    static get count() {
        return VarNpcType.configs.length;
    }

    // ----

    type = ScriptVarType.INT;

    decode(code: number, dat: Packet) {
        if (code === 1) {
            this.type = dat.g1();
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else {
            console.error(`Unrecognized varn config code: ${code}`);
        }
    }
}
