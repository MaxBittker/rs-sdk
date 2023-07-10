import fs from 'fs';
import Packet from '#jagex2/io/Packet.js';
import { ConfigType } from "#lostcity/cache/ConfigType.js";

// this is a virtual type (just contains debugname) so we have an easily reloadable, portable category lookup
export default class CategoryType extends ConfigType {
    private static configNames = new Map<string, number>();
    private static configs: CategoryType[] = [];

    static load(dir: string) {
        CategoryType.configNames = new Map();
        CategoryType.configs = [];

        if (!fs.existsSync(`${dir}/category.dat`)) {
            console.log('Warning: No category.dat found.');
            return;
        }

        let dat = Packet.load(`${dir}/category.dat`);
        let count = dat.g2();

        for (let id = 0; id < count; id++) {
            let config = new CategoryType(id);
            config.debugname = dat.gjstr();

            CategoryType.configs[id] = config;

            if (config.debugname) {
                CategoryType.configNames.set(config.debugname, id);
            }
        }
    }

    static get(id: number) {
        return CategoryType.configs[id];
    }

    static getId(name: string) {
        return CategoryType.configNames.get(name) ?? -1;
    }

    static getByName(name: string) {
        let id = this.getId(name);
        if (id === -1) {
            return null;
        }

        return this.get(id);
    }

    // ----

    decode(opcode: number, packet: Packet) {
    }

    toString() {
        return this.debugname ?? `category_${this.id}`;
    }
}
