import fs from 'fs';
import readline from 'readline';

import Packet from '#/io/Packet.js';
import Environment from '#/util/Environment.js';
import { loadDir } from '#tools/pack/NameMap.js';
import { fileExists } from '#tools/pack/FsCache.js';
import { ParamPack, VarnPack, VarpPack, VarsPack, shouldBuild, CategoryPack, shouldBuildFile, shouldBuildFileList, VarbitPack } from '#tools/pack/PackFile.js';
import FileStream from '#/io/FileStream.js';

export function isConfigBoolean(input: string): boolean {
    return input === 'yes' || input === 'no' || input === 'true' || input === 'false' || input === '1' || input === '0';
}

export function getConfigBoolean(input: string): boolean {
    return input === 'yes' || input === 'true' || input === '1';
}

export class PackedData {
    dat: Packet;
    idx: Packet;
    size: number = 0;
    marker: number;

    constructor(size: number) {
        this.dat = Packet.alloc(5);
        this.idx = Packet.alloc(3);
        this.size = size;

        this.dat.p2(size);
        this.idx.p2(size);
        this.marker = 2;
    }

    next() {
        this.dat.p1(0);
        this.idx.p2(this.dat.pos - this.marker);
        this.marker = this.dat.pos;
    }

    p1(value: number) {
        this.dat.p1(value);
    }

    pbool(value: boolean) {
        this.dat.pbool(value);
    }

    p2(value: number) {
        this.dat.p2(value);
    }

    p3(value: number) {
        this.dat.p3(value);
    }

    p4(value: number) {
        this.dat.p4(value);
    }

    pjstr(value: string) {
        this.dat.pjstr(value);
    }
}

export const CONSTANTS = new Map<string, string>();
const dirTreeFilesCache = new WeakMap<Set<string>, Map<string, Set<string>>>();
const moduleCache = new Map<string, Promise<any>>();
const PARAM_LOOKUP_PACKS = ['category', 'enum', 'interface', 'inv', 'loc', 'npc', 'obj', 'param', 'seq', 'synth', 'spotanim', 'struct', 'varp', 'dbrow', 'midi'];

type ConfigDependencySpec = {
    packTypes?: string[];
    toolFiles?: string[];
};

const CONFIG_DEPENDENCIES: Record<string, ConfigDependencySpec> = {
    '.param': { packTypes: [...PARAM_LOOKUP_PACKS], toolFiles: ['ParamConfig.ts'] },
    '.dbtable': { packTypes: ['dbtable', ...PARAM_LOOKUP_PACKS], toolFiles: ['DbTableConfig.ts', 'ParamConfig.ts'] },
    '.dbrow': { packTypes: ['dbrow', 'dbtable', ...PARAM_LOOKUP_PACKS], toolFiles: ['DbRowConfig.ts', 'ParamConfig.ts'] },
    '.enum': { packTypes: ['enum', ...PARAM_LOOKUP_PACKS], toolFiles: ['EnumConfig.ts', 'ParamConfig.ts'] },
    '.flo': { packTypes: ['flo', 'texture'], toolFiles: ['FloConfig.ts'] },
    '.hunt': { packTypes: ['category', 'hunt', 'inv', 'loc', 'npc', 'obj', 'param', 'varn', 'varp'], toolFiles: ['HuntConfig.ts'] },
    '.idk': { packTypes: ['idk', 'model'], toolFiles: ['IdkConfig.ts'] },
    '.inv': { packTypes: ['inv', 'obj'], toolFiles: ['InvConfig.ts'] },
    '.loc': { packTypes: ['category', 'loc', 'model', 'seq', 'texture', ...PARAM_LOOKUP_PACKS], toolFiles: ['LocConfig.ts', 'ParamConfig.ts'] },
    '.mesanim': { packTypes: ['mesanim', 'seq'], toolFiles: ['MesAnimConfig.ts'] },
    '.npc': { packTypes: ['category', 'hunt', 'model', 'npc', 'seq', ...PARAM_LOOKUP_PACKS], toolFiles: ['NpcConfig.ts', 'ParamConfig.ts'] },
    '.obj': { packTypes: ['category', 'model', 'obj', 'seq', ...PARAM_LOOKUP_PACKS], toolFiles: ['ObjConfig.ts', 'ParamConfig.ts'] },
    '.seq': { packTypes: ['anim', 'obj', 'seq'], toolFiles: ['SeqConfig.ts'] },
    '.spotanim': { packTypes: ['model', 'seq', 'spotanim'], toolFiles: ['SpotAnimConfig.ts'] },
    '.struct': { packTypes: ['struct', ...PARAM_LOOKUP_PACKS], toolFiles: ['StructConfig.ts', 'ParamConfig.ts'] },
    '.varbit': { packTypes: ['varbit', 'varp'], toolFiles: ['VarbitConfig.ts'] },
    '.varn': { packTypes: ['varn'], toolFiles: ['VarnConfig.ts'] },
    '.varp': { packTypes: ['varp'], toolFiles: ['VarpConfig.ts'] },
    '.vars': { packTypes: ['vars'], toolFiles: ['VarsConfig.ts'] }
};

function uniqueFiles(files: string[]) {
    return Array.from(new Set(files));
}

function getConfigDependencyFiles(ext: string) {
    const spec = CONFIG_DEPENDENCIES[ext];
    if (!spec) {
        return ['tools/pack/config/PackShared.ts'];
    }

    const files = ['tools/pack/config/PackShared.ts'];
    for (const toolFile of spec.toolFiles ?? []) {
        files.push(`tools/pack/config/${toolFile}`);
    }
    for (const packType of spec.packTypes ?? []) {
        files.push(`${Environment.build.srcDir}/pack/${packType}.pack`);
    }

    return uniqueFiles(files);
}

async function importCached<T = any>(specifier: string): Promise<T> {
    let pending = moduleCache.get(specifier);
    if (!pending) {
        pending = import(specifier);
        moduleCache.set(specifier, pending);
    }

    return pending as Promise<T>;
}

export function readDirTree(dirTree: Set<string>, path: string) {
    const entries = fs.readdirSync(path, { withFileTypes: true });

    for (const entry of entries) {
        const target = `${entry.parentPath}/${entry.name}`;

        if (entry.isDirectory()) {
            readDirTree(dirTree, target);
        } else {
            dirTree.add(target);
        }
    }
}

export function findFiles(dirTree: Set<string>, extension: string) {
    let extCache = dirTreeFilesCache.get(dirTree);
    if (!extCache) {
        extCache = new Map();
        dirTreeFilesCache.set(dirTree, extCache);
    }

    let results = extCache.get(extension);
    if (!results) {
        results = new Set<string>();
        for (const entry of dirTree) {
            if (entry.endsWith(extension)) {
                results.add(entry);
            }
        }

        extCache.set(extension, results);
    }

    return results;
}

export function parseStepError(file: string, lineNumber: number, message: string) {
    return new Error(`\nError during parsing - see ${file}:${lineNumber + 1}\n${message}`);
}

export function packStepError(debugname: string, message: string) {
    return new Error(`\nError during packing - [${debugname}]\n${message}`);
}

export type ParamValue = {
    id: number;
    type: number;
    value: string | number | boolean;
};
export type LocModelShape = { model: number; shape: number };
export type HuntCheckInv = { inv: number; obj: number; condition: string; val: number };
export type HuntCheckInvParam = { inv: number; param: number; condition: string; val: number };
export type HuntCheckVar = { varp: number; condition: string; val: number };
export type ConfigValue = string | number | boolean | number[] | LocModelShape[] | ParamValue | HuntCheckInv | HuntCheckInvParam | HuntCheckVar;
export type ConfigLine = { key: string; value: ConfigValue };

// we're using null for invalid values, undefined for invalid keys
export type ConfigParseCallback = (key: string, value: string) => ConfigValue | null | undefined;
export type ConfigDatIdx = { client: PackedData; server: PackedData };
export type ConfigPackCallback = (configs: Map<string, ConfigLine[]>, modelFlags: number[]) => ConfigDatIdx;
export type ConfigSaveCallback = (dat: Packet, idx: Packet) => void;
export type ConfigValidateCallback = (server: Packet, client: Packet) => boolean;

export async function readConfigs(
    dirTree: Set<string>,
    extension: string,
    requiredProperties: string[],
    modelFlags: number[],
    parse: ConfigParseCallback,
    pack: ConfigPackCallback,
    saveClient: ConfigSaveCallback,
    saveServer: ConfigSaveCallback,
    validate?: ConfigValidateCallback
) {
    const files = findFiles(dirTree, extension);

    const configs = new Map<string, ConfigLine[]>();
    for (const file of files) {
        const reader = readline.createInterface({
            input: fs.createReadStream(file)
        });

        let debugname: string | null = null;
        let config: ConfigLine[] = [];

        let lineNumber = 0;
        for await (const line of reader) {
            lineNumber++;

            if (line.length === 0 || line.startsWith('//')) {
                continue;
            }

            if (line.startsWith('[')) {
                if (!line.endsWith(']')) {
                    throw parseStepError(file, lineNumber, `Missing closing bracket: ${line}`);
                }

                if (debugname !== null) {
                    if (requiredProperties.length > 0) {
                        // check config keys against requiredProperties
                        for (let i = 0; i < requiredProperties.length; i++) {
                            if (!config.some(value => value.key === requiredProperties[i])) {
                                throw parseStepError(file, -1, `Missing required property: ${requiredProperties[i]}`);
                            }
                        }
                    }

                    configs.set(debugname, config);
                }

                debugname = line.substring(1, line.length - 1); // TODO: .toLowerCase();
                if (!debugname.length) {
                    throw parseStepError(file, lineNumber, 'No config name');
                }

                if (configs.has(debugname)) {
                    throw parseStepError(file, lineNumber, `Duplicate config found: ${debugname}`);
                }

                config = [];
                continue;
            }

            const separator = line.indexOf('=');
            if (separator === -1) {
                throw parseStepError(file, lineNumber, `Missing property separator: ${line}`);
            }

            const key = line.substring(0, separator);
            let value = line.substring(separator + 1);

            for (let i = 0; i < value.length; i++) {
                // check the value for a constant starting with ^ and ending with a \r, \n, comma, or otherwise end of string
                // then replace just that substring with CONSTANTS.get(value) if CONSTANTS.has(value) returns true

                if (value[i] === '^') {
                    const start = i;
                    let end = i + 1;

                    while (end < value.length) {
                        if (value[end] === '\r' || value[end] === '\n' || value[end] === ',' || value[end] === ' ') {
                            break;
                        }

                        end++;
                    }

                    const constant = value.substring(start + 1, end);
                    if (CONSTANTS.has(constant)) {
                        value = value.substring(0, start) + CONSTANTS.get(constant) + value.substring(end);
                    }

                    i = end;
                }
            }

            const parsed = parse(key, value);
            if (parsed === null) {
                throw parseStepError(file, lineNumber, `Invalid property value: ${line}`);
            } else if (typeof parsed === 'undefined') {
                throw parseStepError(file, lineNumber, `Invalid property key: ${line}`);
            }

            config.push({ key, value: parsed });
        }

        if (debugname !== null) {
            if (requiredProperties.length > 0) {
                // check config keys against requiredProperties
                for (let i = 0; i < requiredProperties.length; i++) {
                    if (!config.some(value => value.key === requiredProperties[i])) {
                        throw parseStepError(file, -1, `Missing required property: ${requiredProperties[i]}`);
                    }
                }
            }

            configs.set(debugname, config);
        }
    }

    const { client, server } = pack(configs, modelFlags);

    if (Environment.build.verify && validate && !validate(client.dat, server.dat)) {
        throw new Error(`${extension} checksum mismatch!\nYou can disable this safety check by setting BUILD_VERIFY=false`);
    }

    saveClient(client.dat, client.idx);
    saveServer(server.dat, server.idx);
}

function noOp() {}

export function shouldBuildConfigOutput(ext: string, out: string) {
    return shouldBuild(`${Environment.build.srcDir}/scripts`, '.constant', out) || shouldBuild(`${Environment.build.srcDir}/scripts`, ext, out) || shouldBuildFileList(getConfigDependencyFiles(ext), out);
}

export async function packConfigs(cache: FileStream, modelFlags: number[]) {
    let rebuildParam = shouldBuildConfigOutput('.param', 'data/pack/server/param.dat');
    const rebuildCategory = shouldBuildFile(`${Environment.build.srcDir}/pack/category.pack`, 'data/pack/server/category.dat') || shouldBuild('tools/pack/config', '.ts', 'data/pack/server/category.dat');
    const rebuildDbTables = shouldBuildConfigOutput('.dbtable', 'data/pack/server/dbtable.dat');
    const rebuildDbRows = shouldBuildConfigOutput('.dbrow', 'data/pack/server/dbrow.dat');
    const rebuildEnum = shouldBuildConfigOutput('.enum', 'data/pack/server/enum.dat');
    const rebuildInv = shouldBuildConfigOutput('.inv', 'data/pack/server/inv.dat');
    const rebuildMesanim = shouldBuildConfigOutput('.mesanim', 'data/pack/server/mesanim.dat');
    const rebuildStruct = shouldBuildConfigOutput('.struct', 'data/pack/server/struct.dat');
    const rebuildSeq = shouldBuildConfigOutput('.seq', 'data/pack/server/seq.dat');
    const rebuildLoc = shouldBuildConfigOutput('.loc', 'data/pack/server/loc.dat');
    const rebuildFlo = shouldBuildConfigOutput('.flo', 'data/pack/server/flo.dat');
    const rebuildSpotanim = shouldBuildConfigOutput('.spotanim', 'data/pack/server/spotanim.dat');
    const rebuildNpc = shouldBuildConfigOutput('.npc', 'data/pack/server/npc.dat');
    const rebuildObj = shouldBuildConfigOutput('.obj', 'data/pack/server/obj.dat');
    const rebuildIdk = shouldBuildConfigOutput('.idk', 'data/pack/server/idk.dat');
    const rebuildVarp = shouldBuildConfigOutput('.varp', 'data/pack/server/varp.dat');
    const rebuildVarbit = shouldBuildConfigOutput('.varbit', 'data/pack/server/varbit.dat');
    const rebuildHunt = shouldBuildConfigOutput('.hunt', 'data/pack/server/hunt.dat');
    const rebuildVarn = shouldBuildConfigOutput('.varn', 'data/pack/server/varn.dat');
    const rebuildVars = shouldBuildConfigOutput('.vars', 'data/pack/server/vars.dat');

    if (!rebuildParam && fileExists('data/pack/server/param.dat') && ParamPack.max > 0) {
        const paramDat = Packet.load('data/pack/server/param.dat');
        if (paramDat.length >= 2 && paramDat.g2() === 0) {
            rebuildParam = true;
        }
    }

    const missingClientConfig = !fileExists('data/pack/client/config');
    const rebuildClientSeq = missingClientConfig || rebuildSeq;
    const rebuildClientLoc = missingClientConfig || rebuildLoc;
    const rebuildClientFlo = missingClientConfig || rebuildFlo;
    const rebuildClientSpotanim = missingClientConfig || rebuildSpotanim;
    const rebuildClientNpc = missingClientConfig || rebuildNpc;
    const rebuildClientObj = missingClientConfig || rebuildObj;
    const rebuildClientIdk = missingClientConfig || rebuildIdk;
    const rebuildClientVarp = missingClientConfig || rebuildVarp;
    const rebuildClientVarbit = missingClientConfig || rebuildVarbit;
    const rebuildClientArchive = rebuildClientSeq || rebuildClientLoc || rebuildClientFlo || rebuildClientSpotanim || rebuildClientNpc || rebuildClientObj || rebuildClientIdk || rebuildClientVarp || rebuildClientVarbit;

    const needsAnyConfigPackWork =
        rebuildParam ||
        rebuildDbTables ||
        rebuildDbRows ||
        rebuildEnum ||
        rebuildInv ||
        rebuildMesanim ||
        rebuildStruct ||
        rebuildSeq ||
        rebuildLoc ||
        rebuildFlo ||
        rebuildSpotanim ||
        rebuildNpc ||
        rebuildObj ||
        rebuildIdk ||
        rebuildVarp ||
        rebuildVarbit ||
        rebuildHunt ||
        rebuildVarn ||
        rebuildVars ||
        rebuildClientArchive;
    if (!needsAnyConfigPackWork && !rebuildCategory && cache.has(0, 2)) {
        return;
    }

    if (rebuildCategory) {
        const dat = Packet.alloc(1);
        dat.p2(CategoryPack.size);
        for (let i = 0; i < CategoryPack.size; i++) {
            dat.p1(1);
            dat.pjstr(CategoryPack.getById(i));

            dat.p1(0);
        }
        dat.save('data/pack/server/category.dat');
        dat.release();
    }

    if (!needsAnyConfigPackWork) {
        cache.write(0, 2, fs.readFileSync('data/pack/client/config'));
        return;
    }

    CONSTANTS.clear();

    loadDir(`${Environment.build.srcDir}/scripts`, '.constant', src => {
        for (let i = 0; i < src.length; i++) {
            if (!src[i] || src[i].startsWith('//')) {
                continue;
            }

            const parts = src[i].split('=');

            if (parts.length !== 2) {
                throw new Error(`Bad constant declaration on line: ${src[i]}`);
            }

            let name = parts[0].trim();
            const value = parts[1].trim();

            if (name.startsWith('^')) {
                name = name.substring(1);
            }

            if (CONSTANTS.has(name)) {
                throw new Error(`Duplicate constant found: ${name}`);
            }

            CONSTANTS.set(name, value);
        }
    });

    // var domains are global, so we need to check for conflicts
    const names = new Set<string>();
    for (const [name, _id] of VarpPack.names.entries()) {
        if (names.has(name)) {
            throw new Error(`Non-unique var name found: ${name}`);
        }
        names.add(name);
    }
    for (const [name, _id] of VarbitPack.names.entries()) {
        if (names.has(name)) {
            throw new Error(`Non-unique var name found: ${name}`);
        }
        names.add(name);
    }
    for (const [name, _id] of VarnPack.names.entries()) {
        if (names.has(name)) {
            throw new Error(`Non-unique var name found: ${name}`);
        }
        names.add(name);
    }
    for (const [name, _id] of VarsPack.names.entries()) {
        if (names.has(name)) {
            throw new Error(`Non-unique var name found: ${name}`);
        }
        names.add(name);
    }

    const dirTree = new Set<string>();
    readDirTree(dirTree, `${Environment.build.srcDir}/scripts`);

    // We have to pack params for other configs to parse correctly
    if (rebuildParam) {
        const { packParamConfigs, parseParamConfig } = await importCached('#tools/pack/config/ParamConfig.js');
        await readConfigs(
            dirTree,
            '.param',
            ['type'],
            modelFlags,
            parseParamConfig,
            packParamConfigs,
            () => {},
            (dat: Packet, idx: Packet) => {
                dat.save('data/pack/server/param.dat');
                idx.save('data/pack/server/param.idx');
                dat.release();
                idx.release();
            }
        );
    }

    // Now that they're up to date, load them for us to use elsewhere during this process
    if (
        rebuildDbTables ||
        rebuildDbRows ||
        rebuildEnum ||
        rebuildInv ||
        rebuildMesanim ||
        rebuildStruct ||
        rebuildSeq ||
        rebuildLoc ||
        rebuildFlo ||
        rebuildSpotanim ||
        rebuildNpc ||
        rebuildObj ||
        rebuildIdk ||
        rebuildVarp ||
        rebuildVarbit ||
        rebuildHunt ||
        rebuildVarn ||
        rebuildVars ||
        rebuildClientLoc ||
        rebuildClientFlo ||
        rebuildClientSpotanim ||
        rebuildClientNpc ||
        rebuildClientObj ||
        rebuildClientIdk ||
        rebuildClientVarp ||
        rebuildClientVarbit
    ) {
        const { default: ParamType } = await importCached('#/cache/config/ParamType.js');
        ParamType.load('data/pack');
    }

    const jag = rebuildClientArchive ? (fileExists('data/pack/client/config') ? (await importCached('#/io/Jagfile.js')).default.load('data/pack/client/config') : (await importCached('#/io/Jagfile.js')).default.new()) : null;

    // ----

    // todo: rebuild when any referenceable type changes
    if (rebuildDbRows || rebuildDbTables) {
        const { packDbTableConfigs, parseDbTableConfig } = await importCached('#tools/pack/config/DbTableConfig.js');
        await readConfigs(dirTree, '.dbtable', [], modelFlags, parseDbTableConfig, packDbTableConfigs, noOp, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/dbtable.dat');
            idx.save('data/pack/server/dbtable.idx');
            dat.release();
            idx.release();
        });

        const { default: DbTableType } = await importCached('#/cache/config/DbTableType.js');
        DbTableType.load('data/pack'); // dbrow needs to access it

        const { packDbRowConfigs, parseDbRowConfig } = await importCached('#tools/pack/config/DbRowConfig.js');
        await readConfigs(dirTree, '.dbrow', [], modelFlags, parseDbRowConfig, packDbRowConfigs, noOp, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/dbrow.dat');
            idx.save('data/pack/server/dbrow.idx');
            dat.release();
            idx.release();
        });
    }

    if (rebuildEnum) {
        const { packEnumConfigs, parseEnumConfig } = await importCached('#tools/pack/config/EnumConfig.js');
        await readConfigs(dirTree, '.enum', [], modelFlags, parseEnumConfig, packEnumConfigs, noOp, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/enum.dat');
            idx.save('data/pack/server/enum.idx');
            dat.release();
            idx.release();
        });
    }

    if (rebuildInv) {
        const { packInvConfigs, parseInvConfig } = await importCached('#tools/pack/config/InvConfig.js');
        await readConfigs(dirTree, '.inv', [], modelFlags, parseInvConfig, packInvConfigs, noOp, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/inv.dat');
            idx.save('data/pack/server/inv.idx');
            dat.release();
            idx.release();
        });
    }

    if (rebuildMesanim) {
        const { packMesAnimConfigs, parseMesAnimConfig } = await importCached('#tools/pack/config/MesAnimConfig.js');
        await readConfigs(dirTree, '.mesanim', [], modelFlags, parseMesAnimConfig, packMesAnimConfigs, noOp, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/mesanim.dat');
            idx.save('data/pack/server/mesanim.idx');
            dat.release();
            idx.release();
        });
    }

    if (rebuildStruct) {
        const { packStructConfigs, parseStructConfig } = await importCached('#tools/pack/config/StructConfig.js');
        await readConfigs(dirTree, '.struct', [], modelFlags, parseStructConfig, packStructConfigs, noOp, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/struct.dat');
            idx.save('data/pack/server/struct.idx');
            dat.release();
            idx.release();
        });
    }

    // ----

    if (rebuildClientSeq) {
        const { packSeqConfigs, parseSeqConfig } = await importCached('#tools/pack/config/SeqConfig.js');
        await readConfigs(
            dirTree,
            '.seq',
            [],
            modelFlags,
            parseSeqConfig,
            packSeqConfigs,
            (dat: Packet, idx: Packet) => {
                jag?.write('seq.dat', dat);
                jag?.write('seq.idx', idx);
            },
            (dat: Packet, idx: Packet) => {
                dat.save('data/pack/server/seq.dat');
                idx.save('data/pack/server/seq.idx');
                dat.release();
                idx.release();
            },
            (client: Packet, _server: Packet): boolean => {
                return Packet.checkcrc(client.data, 0, client.pos, -753410077);
            }
        );
    }

    if (rebuildClientLoc) {
        const { packLocConfigs, parseLocConfig } = await importCached('#tools/pack/config/LocConfig.js');
        await readConfigs(
            dirTree,
            '.loc',
            [],
            modelFlags,
            parseLocConfig,
            packLocConfigs,
            (dat: Packet, idx: Packet) => {
                jag?.write('loc.dat', dat);
                jag?.write('loc.idx', idx);
            },
            (dat: Packet, idx: Packet) => {
                dat.save('data/pack/server/loc.dat');
                idx.save('data/pack/server/loc.idx');
                dat.release();
                idx.release();
            },
            (client: Packet, _server: Packet): boolean => {
                return Packet.checkcrc(client.data, 0, client.pos, 452815002);
            }
        );
    }

    if (rebuildClientFlo) {
        const { packFloConfigs, parseFloConfig } = await importCached('#tools/pack/config/FloConfig.js');
        await readConfigs(
            dirTree,
            '.flo',
            [],
            modelFlags,
            parseFloConfig,
            packFloConfigs,
            (dat: Packet, idx: Packet) => {
                jag?.write('flo.dat', dat);
                jag?.write('flo.idx', idx);
            },
            (dat: Packet, idx: Packet) => {
                dat.save('data/pack/server/flo.dat');
                idx.save('data/pack/server/flo.idx');
                dat.release();
                idx.release();
            },
            (client: Packet, _server: Packet): boolean => {
                return Packet.checkcrc(client.data, 0, client.pos, 960212554);
            }
        );
    }

    if (rebuildClientSpotanim) {
        const { packSpotAnimConfigs, parseSpotAnimConfig } = await importCached('#tools/pack/config/SpotAnimConfig.js');
        await readConfigs(
            dirTree,
            '.spotanim',
            [],
            modelFlags,
            parseSpotAnimConfig,
            packSpotAnimConfigs,
            (dat: Packet, idx: Packet) => {
                jag?.write('spotanim.dat', dat);
                jag?.write('spotanim.idx', idx);
            },
            (dat: Packet, idx: Packet) => {
                dat.save('data/pack/server/spotanim.dat');
                idx.save('data/pack/server/spotanim.idx');
                dat.release();
                idx.release();
            },
            (client: Packet, _server: Packet): boolean => {
                return Packet.checkcrc(client.data, 0, client.pos, -1587698939);
            }
        );
    }

    if (rebuildClientNpc) {
        const { packNpcConfigs, parseNpcConfig } = await importCached('#tools/pack/config/NpcConfig.js');
        await readConfigs(
            dirTree,
            '.npc',
            [],
            modelFlags,
            parseNpcConfig,
            packNpcConfigs,
            (dat: Packet, idx: Packet) => {
                jag?.write('npc.dat', dat);
                jag?.write('npc.idx', idx);
            },
            (dat: Packet, idx: Packet) => {
                dat.save('data/pack/server/npc.dat');
                idx.save('data/pack/server/npc.idx');
                dat.release();
                idx.release();
            },
            (client: Packet, _server: Packet): boolean => {
                return Packet.checkcrc(client.data, 0, client.pos, -1249602232);
            }
        );
    }

    if (rebuildClientObj) {
        const { packObjConfigs, parseObjConfig } = await importCached('#tools/pack/config/ObjConfig.js');
        await readConfigs(
            dirTree,
            '.obj',
            [],
            modelFlags,
            parseObjConfig,
            packObjConfigs,
            (dat: Packet, idx: Packet) => {
                jag?.write('obj.dat', dat);
                jag?.write('obj.idx', idx);
            },
            (dat: Packet, idx: Packet) => {
                dat.save('data/pack/server/obj.dat');
                idx.save('data/pack/server/obj.idx');
                dat.release();
                idx.release();
            },
            (client: Packet, _server: Packet): boolean => {
                return Packet.checkcrc(client.data, 0, client.pos, 128627047);
            }
        );
    }

    if (rebuildClientIdk) {
        const { packIdkConfigs, parseIdkConfig } = await importCached('#tools/pack/config/IdkConfig.js');
        await readConfigs(
            dirTree,
            '.idk',
            [],
            modelFlags,
            parseIdkConfig,
            packIdkConfigs,
            (dat: Packet, idx: Packet) => {
                jag?.write('idk.dat', dat);
                jag?.write('idk.idx', idx);
            },
            (dat: Packet, idx: Packet) => {
                dat.save('data/pack/server/idk.dat');
                idx.save('data/pack/server/idk.idx');
                dat.release();
                idx.release();
            },
            (client: Packet, _server: Packet): boolean => {
                return Packet.checkcrc(client.data, 0, client.pos, -359342366);
            }
        );
    }

    if (rebuildClientVarp) {
        const { packVarpConfigs, parseVarpConfig } = await importCached('#tools/pack/config/VarpConfig.js');
        await readConfigs(
            dirTree,
            '.varp',
            [],
            modelFlags,
            parseVarpConfig,
            packVarpConfigs,
            (dat: Packet, idx: Packet) => {
                jag?.write('varp.dat', dat);
                jag?.write('varp.idx', idx);
            },
            (dat: Packet, idx: Packet) => {
                dat.save('data/pack/server/varp.dat');
                idx.save('data/pack/server/varp.idx');
                dat.release();
                idx.release();
            },
            (client: Packet, _server: Packet): boolean => {
                return Packet.checkcrc(client.data, 0, client.pos, 703279713);
            }
        );
    }

    if (rebuildClientVarbit) {
        const { packVarbitConfigs, parseVarbitConfig } = await importCached('#tools/pack/config/VarbitConfig.js');
        await readConfigs(
            dirTree,
            '.varbit',
            ['basevar', 'startbit', 'endbit'],
            modelFlags,
            parseVarbitConfig,
            packVarbitConfigs,
            (dat: Packet, idx: Packet) => {
                jag?.write('varbit.dat', dat);
                jag?.write('varbit.idx', idx);
            },
            (dat: Packet, idx: Packet) => {
                dat.save('data/pack/server/varbit.dat');
                idx.save('data/pack/server/varbit.idx');
                dat.release();
                idx.release();
            },
            (client: Packet, _server: Packet): boolean => {
                return Packet.checkcrc(client.data, 0, client.pos, -234977015);
            }
        );
    }

    if (rebuildHunt) {
        const { packHuntConfigs, parseHuntConfig } = await importCached('#tools/pack/config/HuntConfig.js');
        await readConfigs(dirTree, '.hunt', [], modelFlags, parseHuntConfig, packHuntConfigs, noOp, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/hunt.dat');
            idx.save('data/pack/server/hunt.idx');
            dat.release();
            idx.release();
        });
    }

    if (rebuildVarn) {
        const { packVarnConfigs, parseVarnConfig } = await importCached('#tools/pack/config/VarnConfig.js');
        await readConfigs(dirTree, '.varn', [], modelFlags, parseVarnConfig, packVarnConfigs, noOp, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/varn.dat');
            idx.save('data/pack/server/varn.idx');
            dat.release();
            idx.release();
        });
    }

    if (rebuildVars) {
        const { packVarsConfigs, parseVarsConfig } = await importCached('#tools/pack/config/VarsConfig.js');
        await readConfigs(dirTree, '.vars', [], modelFlags, parseVarsConfig, packVarsConfigs, noOp, (dat: Packet, idx: Packet) => {
            dat.save('data/pack/server/vars.dat');
            idx.save('data/pack/server/vars.idx');
            dat.release();
            idx.release();
        });
    }

    if (rebuildClientArchive) {
        // todo: check the CRC of config.jag as well? (as long as bz2 is identical)
        jag?.save('data/pack/client/config');
    }

    cache.write(0, 2, fs.readFileSync('data/pack/client/config'));
}
