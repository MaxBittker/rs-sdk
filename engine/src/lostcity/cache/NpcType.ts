import fs from 'fs';
import Packet from '#jagex2/io/Packet.js';
import { ConfigType } from './ConfigType.js';
import { MoveRestrict } from '#lostcity/entity/MoveRestrict.js';

export default class NpcType extends ConfigType {
    static configNames = new Map();
    static configs: NpcType[] = [];

    static load(dir: string) {
        NpcType.configNames = new Map();
        NpcType.configs = [];

        if (!fs.existsSync(`${dir}/npc.dat`)) {
            console.log('Warning: No npc.dat found.');
            return;
        }

        const dat = Packet.load(`${dir}/npc.dat`);
        const count = dat.g2();

        for (let id = 0; id < count; id++) {
            const config = new NpcType(id);
            config.decodeType(dat);

            NpcType.configs[id] = config;

            if (config.debugname) {
                NpcType.configNames.set(config.debugname, id);
            }
        }
    }

    static get(id: number) {
        return NpcType.configs[id] ?? new NpcType(id);
    }

    static getId(name: string) {
        return NpcType.configNames.get(name);
    }

    static getByName(name: string) {
        const id = this.getId(name);
        if (id === -1) {
            return null;
        }

        return this.get(id);
    }

    // ----
    name: string | null = null;
    desc: string | null = null;
    size = 1;
    models: number[] = [];
    heads: number[] = [];
    hasanim = false;
    readyanim = -1;
    walkanim = -1;
    walkanim_b = -1;
    walkanim_r = -1;
    walkanim_l = -1;
    hasalpha = false;
    recol_s: number[] = [];
    recol_d: number[] = [];
    ops: (string | null)[] = [];
    code90 = -1;
    code91 = -1;
    code92 = -1;
    visonmap = true;
    vislevel = -1;
    resizeh = 128;
    resizev = 128;

    // server-side
    category = -1;
    wanderrange = 5;
    maxrange = 5;
    huntrange = 5;
    timer = -1;
    respawnrate = 100; // default to 1-minute
    stats = [1, 1, 1, 1, 1, 1];
    moverestrict = MoveRestrict.NORMAL;
    params = new Map();

    decode(opcode: number, packet: Packet): void {
        if (opcode === 1) {
            const count = packet.g1();

            for (let i = 0; i < count; i++) {
                this.models[i] = packet.g2();
            }
        } else if (opcode === 2) {
            this.name = packet.gjstr();
        } else if (opcode === 3) {
            this.desc = packet.gjstr();
        } else if (opcode === 12) {
            this.size = packet.g1();
        } else if (opcode === 13) {
            this.readyanim = packet.g2();
        } else if (opcode === 14) {
            this.walkanim = packet.g2();
        } else if (opcode === 16) {
            this.hasanim = true;
        } else if (opcode === 17) {
            this.walkanim = packet.g2();
            this.walkanim_b = packet.g2();
            this.walkanim_r = packet.g2();
            this.walkanim_l = packet.g2();
        } else if (opcode === 18) {
            this.category = packet.g2();
        } else if (opcode >= 30 && opcode < 40) {
            this.ops[opcode - 30] = packet.gjstr();
        } else if (opcode === 40) {
            const count = packet.g1();

            for (let i = 0; i < count; i++) {
                this.recol_s[i] = packet.g2();
                this.recol_d[i] = packet.g2();
            }
        } else if (opcode === 60) {
            const count = packet.g1();

            for (let i = 0; i < count; i++) {
                this.heads[i] = packet.g2();
            }
        } else if (opcode === 90) {
            this.code90 = packet.g2();
        } else if (opcode === 91) {
            this.code91 = packet.g2();
        } else if (opcode === 92) {
            this.code92 = packet.g2();
        } else if (opcode === 93) {
            this.visonmap = false;
        } else if (opcode === 95) {
            this.vislevel = packet.g2();
        } else if (opcode === 97) {
            this.resizeh = packet.g2();
        } else if (opcode === 98) {
            this.resizev = packet.g2();
        } else if (opcode === 200) {
            this.wanderrange = packet.g1();
        } else if (opcode === 201) {
            this.maxrange = packet.g1();
        } else if (opcode === 202) {
            this.huntrange = packet.g1();
        } else if (opcode === 203) {
            this.timer = packet.g2();
        } else if (opcode === 204) {
            this.respawnrate = packet.g2();
        } else if (opcode === 205) {
            for (let i = 0; i < 6; i++) {
                this.stats[i] = packet.g2();
            }
        } else if (opcode === 206) {
            this.moverestrict = packet.g1();
        } else if (opcode === 249) {
            const count = packet.g1();

            for (let i = 0; i < count; i++) {
                const key = packet.g3();
                const isString = packet.gbool();

                if (isString) {
                    this.params.set(key, packet.gjstr());
                } else {
                    this.params.set(key, packet.g4s());
                }
            }
        } else if (opcode === 250) {
            this.debugname = packet.gjstr();
        } else {
            console.error(`Unrecognized npc config code: ${opcode}`);
            process.exit(1);
        }
    }
}
