import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import { ConfigType } from '#lostcity/cache/ConfigType.js';
import Jagfile from '#jagex2/io/Jagfile.js';

export default class IdkType extends ConfigType {
    private static configNames: Map<string, number> = new Map();
    private static configs: IdkType[] = [];

    static load(dir: string) {
        IdkType.configNames = new Map();
        IdkType.configs = [];

        if (!fs.existsSync(`${dir}/server/idk.dat`)) {
            console.log('Warning: No idk.dat found.');
            return;
        }

        const server = Packet.load(`${dir}/server/idk.dat`);
        const count = server.g2();

        const jag = Jagfile.load(`${dir}/client/config`);
        const client = jag.read('idk.dat')!;
        client.pos = 2;

        for (let id = 0; id < count; id++) {
            const config = new IdkType(id);
            config.decodeType(server);
            config.decodeType(client);

            IdkType.configs[id] = config;

            if (config.debugname) {
                IdkType.configNames.set(config.debugname, id);
            }
        }
    }

    static get(id: number): IdkType {
        return IdkType.configs[id];
    }

    static getId(name: string): number {
        return IdkType.configNames.get(name) ?? -1;
    }

    static getByName(name: string): IdkType | null {
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
    type: number = -1;
    models: number[] = [];
    heads: Uint16Array = new Uint16Array(10).fill(-1);
    recol_s: Uint16Array = new Uint16Array(10).fill(0);
    recol_d: Uint16Array = new Uint16Array(10).fill(0);
    disable: boolean = false;

    decode(code: number, dat: Packet): void {
        if (code === 1) {
            this.type = dat.g1();
        } else if (code === 2) {
            const count = dat.g1();
            for (let i = 0; i < count; i++) {
                this.models[i] = dat.g2();
            }
        } else if (code === 3) {
            this.disable = true;
        } else if (code >= 40 && code < 50) {
            this.recol_s[code - 40] = dat.g2();
        } else if (code >= 50 && code < 60) {
            this.recol_d[code - 50] = dat.g2();
        } else if (code >= 60 && code < 70) {
            this.heads[code - 60] = dat.g2();
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else {
            throw new Error(`Unrecognized idk config code: ${code}`);
        }
    }
}
