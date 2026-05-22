import fs from 'fs';
import { parentPort } from 'worker_threads';

import Environment from '#/util/Environment.js';
import { writeFileIfChanged } from '#tools/pack/FsCache.js';
import { loadFile } from '#tools/pack/Parse.js';
import { printError, printFatalError } from '#/util/Logger.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PackFileValidator = (packfile: PackFile, ...args: any[]) => void;

export class PackFile {
    static suspendAutoReload: boolean = false;

    type: string;
    validator: PackFileValidator | null = null;
    validatorArgs: any[] = [];
    pack: Map<number, string> = new Map();
    names: Set<string> = new Set();
    nameToId: Map<string, number> = new Map();
    max: number = 0;

    get size() {
        return this.pack.size;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(type: string, validator: PackFileValidator | null = null, ...validatorArgs: any[]) {
        this.type = type;
        this.validator = validator;
        this.validatorArgs = validatorArgs;
        if (!PackFile.suspendAutoReload) {
            this.reload();
        }
    }

    reload() {
        try {
            if (this.validator !== null) {
                this.validator(this, ...this.validatorArgs);
            } else {
                this.load(`${Environment.build.srcDir}/pack/${this.type}.pack`);
            }
        } catch (err) {
            if (err instanceof Error) {
                if (parentPort) {
                    printError(err.message);
                } else {
                    printFatalError(err.message);
                }
            }
        }
    }

    load(path: string) {
        this.pack = new Map();

        if (!fs.existsSync(path)) {
            return;
        }

        const lines = loadFile(path);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.length === 0 || !/^\d+=/g.test(line)) {
                continue;
            }

            const parts = line.split('=');
            if (parts[1].length === 0) {
                throw new Error(`Pack file has an empty name ${path}:${i + 1}`);
            }

            this.register(parseInt(parts[0]), parts[1]);
        }
        this.refreshNames();
    }

    clear() {
        this.pack.clear();
        this.names.clear();
        this.nameToId.clear();
        this.max = 0;
    }

    register(id: number, name: string) {
        this.pack.set(id, name);
        this.nameToId.set(name, id);
    }

    delete(id: number) {
        const name = this.pack.get(id);

        if (typeof name !== 'undefined') {
            this.pack.delete(id);
            this.nameToId.delete(name);

            this.refreshNames();
        }
    }

    deleteByName(name: string) {
        const id = this.nameToId.get(name);

        if (typeof id !== 'undefined') {
            this.nameToId.delete(name);
            this.pack.delete(id);

            this.refreshNames();
        }
    }

    refreshNames() {
        this.names = new Set(this.pack.values());
        if (this.names.size) {
            this.max = Math.max(...Array.from(this.pack.keys())) + 1;
        }
    }

    save() {
        writeFileIfChanged(
            `${Environment.build.srcDir}/pack/${this.type}.pack`,
            Array.from(this.pack.entries())
                .sort((a, b) => a[0] - b[0])
                .map(([id, name]) => `${id}=${name}`)
                .join('\n') + '\n'
        );
    }

    getById(id: number): string {
        return this.pack.get(id) ?? '';
    }

    getByName(name: string): number {
        const index = this.nameToId.get(name);
        if (typeof index === 'undefined') {
            return -1;
        }

        return index;
    }
}
