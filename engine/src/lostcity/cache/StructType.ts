import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import { ConfigType } from '#lostcity/cache/ConfigType.js';
import { ParamHelper, ParamHolder, ParamMap } from '#lostcity/cache/ParamHelper.js';

export default class StructType extends ConfigType implements ParamHolder {
    private static configNames = new Map<string, number>();
    private static configs: StructType[] = [];

    static load(dir: string) {
        StructType.configNames = new Map();
        StructType.configs = [];

        if (!fs.existsSync(`${dir}/server/struct.dat`)) {
            console.log('Warning: No struct.dat found.');
            return;
        }

        const dat = Packet.load(`${dir}/server/struct.dat`);
        const count = dat.g2();

        for (let id = 0; id < count; id++) {
            const config = new StructType(id);
            config.decodeType(dat);

            StructType.configs[id] = config;

            if (config.debugname) {
                StructType.configNames.set(config.debugname, id);
            }
        }
    }

    static get(id: number): StructType {
        return StructType.configs[id];
    }

    static getId(name: string): number {
        return StructType.configNames.get(name) ?? -1;
    }

    static getByName(name: string): StructType | null {
        const id = this.getId(name);
        if (id === -1) {
            return null;
        }

        return this.get(id);
    }

    // ----

    params: ParamMap | null = null;

    decode(code: number, dat: Packet) {
        if (code === 249) {
            this.params = ParamHelper.decodeParams(dat);
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else {
            throw new Error(`Unrecognized struct config code: ${code}`);
        }
    }
}
