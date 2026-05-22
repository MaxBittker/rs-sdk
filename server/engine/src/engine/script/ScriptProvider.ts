import { TargetOp } from '#/engine/entity/PathingEntity.js';
import ScriptFile from '#/engine/script/ScriptFile.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import Packet from '#/io/Packet.js';
import { printFatalError, printWarning } from '#/util/Logger.js';

// maintains a list of scripts (id <-> name)
export default class ScriptProvider {
    /**
     * The expected version of the script compiler that the runtime should be loading scripts from.
     */
    public static readonly COMPILER_VERSION = 27;

    /**
     * Array of loaded scripts.
     */
    private static scripts: ScriptFile[] = [];

    /**
     * Mapping of unique trigger + type/category/global key to script.
     */
    private static scriptLookup = new Map<number, ScriptFile>();

    /**
     * Mapping of script names to its id.
     */
    private static scriptNames = new Map<string, number>();

    /**
     * Loads all scripts from `dir`.
     *
     * @param dir The directory that holds the script.{dat,idx} files.
     * @returns The number of scripts loaded.
     */
    static load(dir: string): number {
        const dat = Packet.load(`${dir}/server/script.dat`);
        const idx = Packet.load(`${dir}/server/script.idx`);
        return this.parse(dat, idx);
    }

    static parse(dat: Packet, idx: Packet): number {
        if (!dat.data.length || !idx.data.length) {
            printFatalError('No server cache found. Please build the cache first.');
        }

        const entries = dat.g4s();
        idx.pos += 4;

        const version = dat.g4s();
        if (version !== ScriptProvider.COMPILER_VERSION) {
            printFatalError('\nFatal: Scripts were compiled with an incompatible script compiler. Please run `bun i`, then `bun run build`, and restart the server.');
        }

        const scripts = new Array<ScriptFile>(entries);
        const scriptNames = new Map<string, number>();
        const scriptLookup = new Map<number, ScriptFile>();

        let loaded = 0;
        for (let id = 0; id < entries; id++) {
            const size = idx.g4s();
            if (size === 0) {
                continue;
            }

            try {
                const data: Uint8Array = new Uint8Array(size);
                dat.gdata(data, 0, data.length);
                const script = ScriptFile.decode(id, new Packet(data));
                scripts[id] = script;
                scriptNames.set(script.name, id);

                // add the script to lookup table if the value isn't -1
                if (script.info.lookupKey !== 0xffffffff) {
                    scriptLookup.set(script.info.lookupKey, script);
                }

                loaded++;
            } catch (err) {
                console.error(err);
                printWarning(`Warning: Failed to load script ${id}, something may have been partially written`);
                return -1;
            }
        }

        ScriptProvider.scripts = scripts;
        ScriptProvider.scriptNames = scriptNames;
        ScriptProvider.scriptLookup = scriptLookup;
        return loaded;
    }

    /**
     * Finds a script by `id`.
     * @param id The script id to find.
     * @returns The script.
     */
    static get(id: number): ScriptFile | undefined {
        return this.scripts[id];
    }

    /**
     * Finds a script by `name`.
     * @param name The script name to find.
     * @returns The script.
     */
    static getByName(name: string): ScriptFile | undefined {
        const id = ScriptProvider.scriptNames.get(name);
        if (id === undefined) {
            return undefined;
        }
        return ScriptProvider.scripts[id];
    }

    /**
     * Used to look up a script by the `type` and `category`.
     *
     * This function will attempt to search for a script given the specific `type`,
     * if one is not found it attempts one for `category`, and if still not found
     * it will attempt for the global script.
     *
     * @param trigger The script trigger to find.
     * @param type The script subject type id.
     * @param category The script subject category id.
     */
    static getByTrigger(trigger: TargetOp, type: number = -1, category: number = -1): ScriptFile | undefined {
        let script = ScriptProvider.scriptLookup.get(trigger | (0x2 << 8) | (type << 10));
        if (script) {
            return script;
        }
        script = ScriptProvider.scriptLookup.get(trigger | (0x1 << 8) | (category << 10));
        if (script) {
            return script;
        }
        return ScriptProvider.scriptLookup.get(trigger);
    }

    /**
     * Used to look up a script by a specific combo. Does not attempt any other combinations.
     *
     * If `type` is not `-1`, only the `type` specific script will be looked up. Likewise
     * for `category`. If both `type` and `category` are `-1`, then only the global script
     * will be looked up.
     *
     * @param trigger The script trigger to find.
     * @param type The script subject type id.
     * @param category The script subject category id.
     */
    static getByTriggerSpecific(trigger: ServerTriggerType, type: number = -1, category: number = -1): ScriptFile | undefined {
        if (type !== -1) {
            return ScriptProvider.scriptLookup.get(trigger | (0x2 << 8) | (type << 10));
        } else if (category !== -1) {
            return ScriptProvider.scriptLookup.get(trigger | (0x1 << 8) | (category << 10));
        }
        return ScriptProvider.scriptLookup.get(trigger);
    }
}
