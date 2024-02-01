import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import { ConfigType } from '#lostcity/cache/ConfigType.js';

export default class InvType extends ConfigType {
    private static configNames = new Map<string, number>();
    private static configs: InvType[] = [];

    static SCOPE_TEMP = 0;
    static SCOPE_PERM = 1;
    static SCOPE_SHARED = 2;

    static load(dir: string) {
        InvType.configNames = new Map();
        InvType.configs = [];

        if (!fs.existsSync(`${dir}/inv.dat`)) {
            console.log('Warning: No inv.dat found.');
            return;
        }

        const dat = Packet.load(`${dir}/inv.dat`);
        const count = dat.g2();

        for (let id = 0; id < count; id++) {
            const config = new InvType(id);
            config.decodeType(dat);

            InvType.configs[id] = config;

            if (config.debugname) {
                InvType.configNames.set(config.debugname, id);
            }
        }
    }

    static get(id: number): InvType {
        return InvType.configs[id];
    }

    static getId(name: string): number {
        return InvType.configNames.get(name) ?? -1;
    }

    static getByName(name: string): InvType | null {
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

    scope = 0;
    size = 1;
    stackall = false;
    restock = false;
    allstock = false;
    stockobj: number[] = [];
    stockcount: number[] = [];
    stockrate: number[] = [];
    protect = true;
    runweight = false; // inv contributes to weight
    dummyinv = false; // inv only accepts objs with dummyitem=inv_only

    decode(opcode: number, packet: Packet) {
        if (opcode === 1) {
            this.scope = packet.g1();
        } else if (opcode === 2) {
            this.size = packet.g2();
        } else if (opcode === 3) {
            this.stackall = true;
        } else if (opcode === 4) {
            const count = packet.g1();

            this.stockobj = new Array(count);
            this.stockcount = new Array(count);
            this.stockrate = new Array(count);

            for (let j = 0; j < count; j++) {
                this.stockobj[j] = packet.g2();
                this.stockcount[j] = packet.g2();
                this.stockrate[j] = packet.g4();
            }
        } else if (opcode === 5) {
            this.restock = true;
        } else if (opcode === 6) {
            this.allstock = true;
        } else if (opcode === 7) {
            this.protect = false;
        } else if (opcode === 8) {
            this.runweight = true;
        } else if (opcode === 9) {
            this.dummyinv = true;
        } else if (opcode === 250) {
            this.debugname = packet.gjstr();
        } else {
            throw new Error(`Unrecognized inv config code: ${opcode}`);
        }
    }
}
