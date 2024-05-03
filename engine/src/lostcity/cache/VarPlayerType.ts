import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import { ConfigType } from '#lostcity/cache/ConfigType.js';
import ScriptVarType from '#lostcity/cache/ScriptVarType.js';
import Jagfile from '#jagex2/io/Jagfile.js';

export default class VarPlayerType extends ConfigType {
    static SCOPE_TEMP = 0;
    static SCOPE_PERM = 1;

    private static configNames = new Map<string, number>();
    private static configs: VarPlayerType[] = [];

    static load(dir: string) {
        VarPlayerType.configNames = new Map();
        VarPlayerType.configs = [];

        if (!fs.existsSync(`${dir}/server/varp.dat`)) {
            console.log('Warning: No varp.dat found.');
            return;
        }

        const server = Packet.load(`${dir}/server/varp.dat`);
        const count = server.g2();

        const jag = Jagfile.load(`${dir}/client/config`);
        const client = jag.read('varp.dat')!;
        client.pos = 2;

        for (let id = 0; id < count; id++) {
            const config = new VarPlayerType(id);
            config.decodeType(server);
            config.decodeType(client);

            VarPlayerType.configs[id] = config;

            if (config.debugname) {
                VarPlayerType.configNames.set(config.debugname, id);
            }
        }
    }

    static get(id: number): VarPlayerType {
        return VarPlayerType.configs[id];
    }

    static getId(name: string): number {
        return VarPlayerType.configNames.get(name) ?? -1;
    }

    static getByName(name: string): VarPlayerType | null {
        const id = this.getId(name);
        if (id === -1) {
            return null;
        }

        return this.get(id);
    }

    static get count() {
        return VarPlayerType.configs.length;
    }

    // ----

    clientcode = 0;

    // server-side
    scope = VarPlayerType.SCOPE_TEMP;
    type = ScriptVarType.INT;
    protect = true;
    transmit = false;

    decode(code: number, dat: Packet) {
        if (code === 1) {
            this.scope = dat.g1();
        } else if (code === 2) {
            this.type = dat.g1();
        } else if (code === 4) {
            this.protect = false;
        } else if (code === 5) {
            this.clientcode = dat.g2();
        } else if (code === 6) {
            this.transmit = true;
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else {
            console.error(`Unrecognized varp config code: ${code}`);
        }
    }
}
