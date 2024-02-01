import fs from 'fs';
import Packet from '#jagex2/io/Packet.js';
import { ConfigType } from '#lostcity/cache/ConfigType.js';
import ScriptVarType from '#lostcity/cache/ScriptVarType.js';

export default class VarSharedType extends ConfigType {
    private static configNames = new Map<string, number>();
    private static configs: VarSharedType[] = [];

    static load(dir: string) {
        VarSharedType.configNames = new Map();
        VarSharedType.configs = [];

        if (!fs.existsSync(`${dir}/vars.dat`)) {
            console.log('Warning: No vars.dat found.');
            return;
        }

        const dat = Packet.load(`${dir}/vars.dat`);
        const count = dat.g2();

        for (let id = 0; id < count; id++) {
            const config = new VarSharedType(id);
            config.decodeType(dat);

            VarSharedType.configs[id] = config;

            if (config.debugname) {
                VarSharedType.configNames.set(config.debugname, id);
            }
        }
    }

    static get(id: number): VarSharedType {
        return VarSharedType.configs[id];
    }

    static getId(name: string): number {
        return VarSharedType.configNames.get(name) ?? -1;
    }

    static getByName(name: string): VarSharedType | null {
        const id = this.getId(name);
        if (id === -1) {
            return null;
        }

        return this.get(id);
    }

    static get count() {
        return VarSharedType.configs.length;
    }

    // ----

    type = ScriptVarType.INT;

    decode(opcode: number, packet: Packet) {
        switch (opcode) {
            case 1:
                this.type = packet.g1();
                break;
            case 250:
                this.debugname = packet.gjstr();
                break;
            default:
                console.error(`Unrecognized vars config code: ${opcode}`);
                break;
        }
    }
}
