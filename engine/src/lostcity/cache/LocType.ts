import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import { ConfigType } from '#lostcity/cache/ConfigType.js';
import { ParamHelper, ParamMap } from '#lostcity/cache/ParamHelper.js';
import Jagfile from '#jagex2/io/Jagfile.js';

export default class LocType extends ConfigType {
    static configNames: Map<string, number> = new Map();
    static configs: LocType[] = [];

    static load(dir: string) {
        LocType.configNames = new Map();
        LocType.configs = [];

        if (!fs.existsSync(`${dir}/server/loc.dat`)) {
            console.log('Warning: No loc.dat found.');
            return;
        }

        const server = Packet.load(`${dir}/server/loc.dat`);
        const count = server.g2();

        const jag = Jagfile.load(`${dir}/client/config`);
        const client = jag.read('loc.dat')!;
        client.pos = 2;

        for (let id = 0; id < count; id++) {
            const config = new LocType(id);
            config.active = -1; // so we can infer if active should be automatically determined based on loc shape/ops available
            config.decodeType(server);
            config.decodeType(client);

            if (config.active === -1) {
                config.active = config.shapes.length > 0 && config.shapes[0] === 10 ? 1 : 0;

                if (config.ops.length > 0) {
                    config.active = 1;
                }
            }

            LocType.configs[id] = config;

            if (config.debugname) {
                LocType.configNames.set(config.debugname, id);
            }
        }
    }

    static get(id: number): LocType {
        return LocType.configs[id];
    }

    static getId(name: string): number {
        return LocType.configNames.get(name) ?? -1;
    }

    static getByName(name: string): LocType | null {
        const id = this.getId(name);
        if (id === undefined || id === -1) {
            return null;
        }

        return this.get(id);
    }

    static get count() {
        return this.configs.length;
    }

    // ----
    models: number[] = [];
    shapes: number[] = [];
    name: string | null = null;
    desc: string | null = null;
    recol_s: number[] = [];
    recol_d: number[] = [];
    width = 1;
    length = 1;
    blockwalk = true;
    blockrange = true;
    active = 0; // not -1 here just in case an new LocType is created, we want to default to "false"
    hillskew = false;
    sharelight = false;
    occlude = false;
    anim = -1;
    hasalpha = false;
    wallwidth = 16;
    ambient = 0;
    contrast = 0;
    ops: (string | null)[] = [];
    mapfunction = -1;
    mapscene = -1;
    mirror = false;
    shadow = true;
    resizex = 128;
    resizey = 128;
    resizez = 128;
    forceapproach = 0;
    xoff = 0;
    yoff = 0;
    zoff = 0;
    forcedecor = false;

    // server-side
    category = -1;
    params: ParamMap = new Map();

    decode(code: number, dat: Packet) {
        if (code === 1) {
            const count = dat.g1();

            for (let i = 0; i < count; i++) {
                this.models[i] = dat.g2();
                this.shapes[i] = dat.g1();
            }
        } else if (code === 2) {
            this.name = dat.gjstr();
        } else if (code === 3) {
            this.desc = dat.gjstr();
        } else if (code === 14) {
            this.width = dat.g1();
        } else if (code === 15) {
            this.length = dat.g1();
        } else if (code === 17) {
            this.blockwalk = false;
        } else if (code === 18) {
            this.blockrange = false;
        } else if (code === 19) {
            this.active = dat.g1();
        } else if (code === 21) {
            this.hillskew = true;
        } else if (code === 22) {
            this.sharelight = true;
        } else if (code === 23) {
            this.occlude = true;
        } else if (code === 24) {
            this.anim = dat.g2();

            if (this.anim == 65535) {
                this.anim = -1;
            }
        } else if (code === 25) {
            this.hasalpha = true;
        } else if (code === 28) {
            this.wallwidth = dat.g1();
        } else if (code === 29) {
            this.ambient = dat.g1b();
        } else if (code === 39) {
            this.contrast = dat.g1b();
        } else if (code >= 30 && code < 35) {
            this.ops[code - 30] = dat.gjstr();

            if (this.ops[code - 30] === 'hidden') {
                this.ops[code - 30] = null;
            }
        } else if (code === 40) {
            const count = dat.g1();

            for (let i = 0; i < count; i++) {
                this.recol_s[i] = dat.g2();
                this.recol_d[i] = dat.g2();
            }
        } else if (code === 60) {
            this.mapfunction = dat.g2();
        } else if (code === 62) {
            this.mirror = true;
        } else if (code === 64) {
            this.shadow = false;
        } else if (code === 65) {
            this.resizex = dat.g2();
        } else if (code === 66) {
            this.resizey = dat.g2();
        } else if (code === 67) {
            this.resizez = dat.g2();
        } else if (code === 68) {
            this.mapscene = dat.g2();
        } else if (code === 69) {
            this.forceapproach = dat.g1();
        } else if (code === 70) {
            this.xoff = dat.g2s();
        } else if (code === 71) {
            this.yoff = dat.g2s();
        } else if (code === 72) {
            this.zoff = dat.g2s();
        } else if (code === 73) {
            this.forcedecor = true;
        } else if (code === 200) {
            this.category = dat.g2();
        } else if (code === 249) {
            this.params = ParamHelper.decodeParams(dat);
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else {
            throw new Error(`Unrecognized loc config code: ${code}`);
        }
    }
}
