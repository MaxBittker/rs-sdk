import fs from 'fs';

import Packet from '#jagex2/io/Packet.js';

import { ConfigType } from '#lostcity/cache/ConfigType.js';

// this is a virtual type (just contains debugname) so we have an easily reloadable, portable category lookup
export default class CategoryType extends ConfigType {
    private static configNames = new Map<string, number>();
    private static configs: CategoryType[] = [];

    static load(dir: string) {
        CategoryType.configNames = new Map();
        CategoryType.configs = [];

        if (!fs.existsSync(`${dir}/server/category.dat`)) {
            console.log('Warning: No category.dat found.');
            return;
        }

        const dat = Packet.load(`${dir}/server/category.dat`);
        const count = dat.g2();

        for (let id = 0; id < count; id++) {
            const config = new CategoryType(id);
            config.decodeType(dat);

            CategoryType.configs[id] = config;

            if (config.debugname) {
                CategoryType.configNames.set(config.debugname, id);
            }
        }
    }

    static get(id: number): CategoryType {
        return CategoryType.configs[id];
    }

    static getId(name: string): number {
        return CategoryType.configNames.get(name) ?? -1;
    }

    static getByName(name: string): CategoryType | null {
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

    decode(code: number, dat: Packet) {
        this.debugname = dat.gjstr();
    }

    toString() {
        return this.debugname ?? `category_${this.id}`;
    }
}
