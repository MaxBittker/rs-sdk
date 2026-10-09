import fs from 'fs';

import kleur from 'kleur';

import { ConfigType } from '#/cache/config/ConfigType.js';
import { ParamHelper, ParamMap } from '#/cache/config/ParamHelper.js';
import Jagfile from '#/io/Jagfile.js';
import Packet from '#/io/Packet.js';
import { printFatalError } from '#/util/Logger.js';

export default class LocType extends ConfigType {
    static configNames: Map<string, number> = new Map();
    static configs: LocType[] = [];

    static load(dir: string) {
        if (!fs.existsSync(`${dir}/server/loc.dat`)) {
            return;
        }

        const server = Packet.load(`${dir}/server/loc.dat`);
        const jag = Jagfile.load(`${dir}/client/config`);
        this.parse(server, jag);
    }

    static parse(server: Packet, jag: Jagfile) {
        LocType.configNames = new Map();
        LocType.configs = [];

        const count = server.g2();

        const client = jag.read('loc.dat')!;
        client.pos = 2;

        for (let id = 0; id < count; id++) {
            const config = new LocType(id);
            config.decodeType(server);
            config.decodeType(client);
            config.postDecode();

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

    models: Uint16Array | null = null;
    shapes: Uint8Array | null = null;
    name: string | null = null;
    desc: string | null = null;
    recol_s: Uint16Array | null = null;
    recol_d: Uint16Array | null = null;
    width = 1;
    length = 1;
    blockwalk = true;
    blockrange = true;
    active = -1;
    hillskew = false;
    sharelight = false;
    occlude = false;
    anim = -1;
    wallwidth = 16;
    ambient = 0;
    contrast = 0;
    op: (string | null)[] | null = null;
    mapfunction = -1;
    mapscene = -1;
    mirror = false;
    shadow = true;
    resizex = 128;
    resizey = 128;
    resizez = 128;
    forceapproach = 0;
    offsetx = 0;
    offsety = 0;
    offsetz = 0;
    forcedecor = false;
    breakroutefinding = false;
    raiseobject = -1;
    multivarbit = -1;
    multiloc: number[] = [];

    // server-side
    category = -1;
    params: ParamMap = new Map();

    decode(code: number, dat: Packet) {
        if (code === 1) {
            const count = dat.g1();
            this.models = new Uint16Array(count);
            this.shapes = new Uint8Array(count);

            for (let i = 0; i < count; i++) {
                this.models[i] = dat.g2();
                this.shapes[i] = dat.g1();
            }
        } else if (code === 2) {
            this.name = dat.gjstr();
        } else if (code === 3) {
            this.desc = dat.gjstr();
        } else if (code === 5) {
            const count = dat.g1();
            this.models = new Uint16Array(count);
            this.shapes = null;

            for (let i = 0; i < count; i++) {
                this.models[i] = dat.g2();
            }
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
        } else if (code === 28) {
            this.wallwidth = dat.g1();
        } else if (code === 29) {
            this.ambient = dat.g1b();
        } else if (code === 39) {
            this.contrast = dat.g1b();
        } else if (code >= 30 && code < 35) {
            if (!this.op) {
                this.op = new Array(5).fill(null);
            }

            this.op[code - 30] = dat.gjstr();
        } else if (code === 40) {
            const count = dat.g1();
            this.recol_s = new Uint16Array(count);
            this.recol_d = new Uint16Array(count);

            for (let i = 0; i < count; i++) {
                this.recol_s[i] = dat.g2();
                this.recol_d[i] = dat.g2();
            }
        } else if (code === 60) {
            this.mapfunction = dat.g2();
        } else if (code === 61) {
            this.category = dat.g2();
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
            this.offsetx = dat.g2s();
        } else if (code === 71) {
            this.offsety = dat.g2s();
        } else if (code === 72) {
            this.offsetz = dat.g2s();
        } else if (code === 73) {
            this.forcedecor = true;
        } else if (code === 74) {
            this.breakroutefinding = true;
        } else if (code === 75) {
            this.raiseobject = dat.g1();
        } else if (code === 77) {
            this.multivarbit = dat.g2();

            const count = dat.g1();
            this.multiloc = new Array(count + 1);
            for (let i = 0; i <= count; i++) {
                this.multiloc[i] = dat.g2();
                if (this.multiloc[i] === 65535) {
                    this.multiloc[i] = -1;
                }
            }
        } else if (code === 249) {
            this.params = ParamHelper.decodeParams(dat);
        } else if (code === 250) {
            this.debugname = dat.gjstr();
        } else {
            printFatalError(`Unrecognized loc config code: ${code}\nThis error comes from the packed data being out of sync, try running ` + kleur.green().bold('npm run build') + ', then restarting this.');
        }
    }

    postDecode() {
        if (this.active === -1) {
            this.active = 0;

            if (this.models && (!this.shapes || (this.shapes && this.shapes[0] === 10))) {
                this.active = 1;
            }

            if (this.op !== null) {
                this.active = 1;
            }
        }
    }
}
