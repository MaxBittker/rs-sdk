import fs from 'fs';
import { basename, dirname } from 'path';

import Environment from '#/util/Environment.js';
import { PackFile } from '#tools/pack/PackFileBase.js';
import { listFilesExt, loadDirExtFull } from '#tools/pack/Parse.js';
import { didFileSetChange, fileExists, fileStats } from '#tools/pack/FsCache.js';
import { SourceSnapshot } from '#tools/pack/SourceSnapshot.js';
import { printDebug, printError } from '#/util/Logger.js';
// import { printWarning } from '#/util/Logger.js';

type RevalidateContext = {
    snapshot: SourceSnapshot;
    toolChanged: boolean;
};

let currentRevalidateContext: RevalidateContext | null = null;

function getPackFilePath(type: string) {
    return `${Environment.build.srcDir}/pack/${type}.pack`;
}

function shouldRevalidatePackFile(pack: PackFile, sources: { path: string; ext: string }[]) {
    const packFile = getPackFilePath(pack.type);
    if (!fileExists(packFile)) {
        return true;
    }

    if (currentRevalidateContext?.toolChanged) {
        return true;
    }

    const packTimestamp = fileStats(packFile).mtimeMs;
    for (const source of sources) {
        if (currentRevalidateContext) {
            if (currentRevalidateContext.snapshot.isNewer(source.path, source.ext, packTimestamp)) {
                return true;
            }
        } else if (shouldBuild(source.path, source.ext, packFile)) {
            return true;
        }
    }

    return false;
}

function validateFilesPack(pack: PackFile, paths: string[], ext: string, verify: boolean = true): void {
    const packFile = getPackFilePath(pack.type);
    if (
        !shouldRevalidatePackFile(
            pack,
            paths.map(path => ({ path, ext }))
        )
    ) {
        pack.load(packFile);
        return;
    }

    pack.load(packFile);

    for (const path of paths) {
        const files = listFilesExt(path, ext);

        const fileNames = new Set(files.map(x => basename(x, ext)));
        for (let i = 0; i < files.length; i++) {
            files[i] = files[i].substring(files[i].lastIndexOf('/') + 1); // strip file path
            files[i] = files[i].substring(0, files[i].length - ext.length); // strip extension
            fileNames.add(files[i]);
        }

        if (verify) {
            for (let i = 0; i < files.length; i++) {
                const name = files[i];

                if (!pack.names.has(name)) {
                    throw new Error(`${pack.type}: ${name} is missing an ID line, you may need to edit ${Environment.build.srcDir}/pack/${pack.type}.pack`);
                }
            }

            if (Environment.build.verifyPack) {
                for (const name of pack.names) {
                    if (!fileNames.has(name)) {
                        // printWarning(`${pack.type}: ${name} was not found on your disk`);
                    }
                }
            }
        }
    }

    pack.save();
}

function validateImagePack(pack: PackFile, path: string, ext: string): void {
    const packFile = getPackFilePath(pack.type);
    if (!shouldRevalidatePackFile(pack, [{ path, ext }])) {
        pack.load(packFile);
        return;
    }

    pack.load(packFile);

    const files = listFilesExt(path, ext);

    const fileNames = new Set(files.map(x => basename(x, ext)));
    for (let i = 0; i < files.length; i++) {
        if (basename(dirname(files[i])) === 'meta') {
            continue;
        }

        files[i] = files[i].substring(files[i].lastIndexOf('/') + 1); // strip file path
        files[i] = files[i].substring(0, files[i].length - ext.length); // strip extension
        fileNames.add(files[i]);

        const name = files[i];
        if (!pack.names.has(name)) {
            throw new Error(`${pack.type}: ${name} is missing an ID line, you may need to edit ${Environment.build.srcDir}/pack/${pack.type}.pack`);
        }
    }

    if (Environment.build.verifyPack) {
        for (const name of pack.names) {
            if (!fileNames.has(name)) {
                throw new Error(`${pack.type}: ${name} was not found on your disk, you may need to edit ${Environment.build.srcDir}/pack/${pack.type}.pack`);
            }
        }
    }

    pack.save();
}

function validateConfigPack(pack: PackFile, ext: string, transmitted: boolean = false): void {
    const packFile = getPackFilePath(pack.type);
    if (!shouldRevalidatePackFile(pack, [{ path: `${Environment.build.srcDir}/scripts`, ext }])) {
        pack.load(packFile);
        return;
    }

    const names = crawlConfigNames(ext);
    const configNames = new Set(names);

    pack.load(packFile);

    if (!transmitted || (!Environment.build.verify && transmitted)) {
        for (let i = 0; i < names.length; i++) {
            if (!pack.names.has(names[i])) {
                pack.register(pack.max++, names[i]);
            }
        }

        pack.refreshNames();
    }

    const missing = [];
    for (let i = 0; i < names.length; i++) {
        const name = names[i];

        if (!pack.names.has(name) && !name.startsWith('cert_')) {
            missing.push(name);
        }
    }

    if (Environment.build.verify && missing.length > 0) {
        if (missing.length > 1) {
            printError(`Missing ${pack.type} pack IDs for:`);
        } else {
            printError(`Missing ${pack.type} pack ID for:`);
        }

        for (const name of missing) {
            printDebug(`[${name}]`);
        }

        throw new Error(`You may need to edit ${Environment.build.srcDir}/pack/${pack.type}.pack`);
    }

    if (transmitted) {
        for (const name of pack.names) {
            if (Environment.build.verify && !configNames.has(name) && !name.startsWith('cert_')) {
                throw new Error(`${pack.type}: ${name} was not found in any ${ext} files, you may need to edit ${Environment.build.srcDir}/pack/${pack.type}.pack`);
            }
        }
    }

    if (!transmitted || (!Environment.build.verify && transmitted)) {
        pack.save();
    }
}

function validateCategoryPack(pack: PackFile) {
    const packFile = getPackFilePath(pack.type);
    const shouldRebuild = currentRevalidateContext
        ? currentRevalidateContext.toolChanged ||
          currentRevalidateContext.snapshot.isNewer(`${Environment.build.srcDir}/scripts`, '.loc', fileExists(packFile) ? fileStats(packFile).mtimeMs : 0) ||
          currentRevalidateContext.snapshot.isNewer(`${Environment.build.srcDir}/scripts`, '.npc', fileExists(packFile) ? fileStats(packFile).mtimeMs : 0) ||
          currentRevalidateContext.snapshot.isNewer(`${Environment.build.srcDir}/scripts`, '.obj', fileExists(packFile) ? fileStats(packFile).mtimeMs : 0)
        : false;

    if (
        shouldRebuild ||
        (!currentRevalidateContext &&
            (shouldBuild(`${Environment.build.srcDir}/scripts`, '.loc', packFile) ||
                shouldBuild(`${Environment.build.srcDir}/scripts`, '.npc', packFile) ||
                shouldBuild(`${Environment.build.srcDir}/scripts`, '.obj', packFile) ||
                didFileSetChange(`data/pack/.stamps/revalidate-${pack.type}.txt`, [Environment.runtime.isBun ? __filename : import.meta.filename, 'tools/pack/Parse.ts'])))
    ) {
        const categories = crawlConfigCategories();
        for (let i = 0; i < categories.length; i++) {
            pack.register(i, categories[i]);
        }
        pack.refreshNames();
        pack.save();
    } else {
        pack.load(packFile);
    }
}

function validateInterfacePack(pack: PackFile) {
    const packFile = getPackFilePath(pack.type);
    if (!shouldRevalidatePackFile(pack, [{ path: `${Environment.build.srcDir}/scripts`, ext: '.if' }])) {
        pack.load(packFile);
        return;
    }

    pack.load(packFile);

    loadDirExtFull(`${Environment.build.srcDir}/scripts`, '.if', (lines: string[], file: string) => {
        if (Environment.build.verifyFolder) {
            const parent = basename(dirname(dirname(file)));
            const dir = basename(dirname(file));
            if (dir !== 'interfaces' && parent !== 'interfaces') {
                throw new Error(`Interface file ${file} must be located inside an "interfaces" directory.`);
            }
        }

        const inter = basename(file, '.if');
        if (!pack.names.has(inter)) {
            throw new Error(`${Environment.build.srcDir}/pack/interface.pack is missing ID for interface ${inter} from ${file}`);
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('[')) {
                const com = line.substring(1, line.length - 1);
                const name = `${inter}:${com}`;

                if (!pack.names.has(name)) {
                    throw new Error(`${Environment.build.srcDir}/pack/interface.pack is missing ID for component ${name} from ${file}`);
                }
            }
        }
    });
}

function regenScriptPack(pack: PackFile) {
    const packFile = getPackFilePath(pack.type);

    // todo: would be nice to not crawl scripts on each reload. this checks script.dat against script.pack
    // if (!shouldRevalidatePackFile(pack, [{ path: `${Environment.build.srcDir}/scripts`, ext: '.rs2' }])) {
    //     pack.load(packFile);
    //     return;
    // }

    pack.load(packFile);

    const names = crawlConfigNames('.rs2', true);
    for (let i = 0; i < names.length; i++) {
        if (!pack.names.has(names[i])) {
            pack.register(pack.max++, names[i]);
        }
    }
    pack.refreshNames();
    pack.save();
}

PackFile.suspendAutoReload = true;

export const AnimSetPack = new PackFile('animset', validateFilesPack, [`${Environment.build.srcDir}/models`], '.anim');
export const AnimPack = new PackFile('anim', validateFilesPack, [`${Environment.build.srcDir}/models`], '.frame', false);
export const BasePack = new PackFile('base', validateFilesPack, [`${Environment.build.srcDir}/models`], '.base', false);
export const CategoryPack = new PackFile('category', validateCategoryPack);
export const DbRowPack = new PackFile('dbrow', validateConfigPack, '.dbrow');
export const DbTablePack = new PackFile('dbtable', validateConfigPack, '.dbtable');
export const EnumPack = new PackFile('enum', validateConfigPack, '.enum');
export const FloPack = new PackFile('flo', validateConfigPack, '.flo', true);
export const HuntPack = new PackFile('hunt', validateConfigPack, '.hunt');
export const IdkPack = new PackFile('idk', validateConfigPack, '.idk', true);
export const InterfacePack = new PackFile('interface', validateInterfacePack);
export const InvPack = new PackFile('inv', validateConfigPack, '.inv');
export const LocPack = new PackFile('loc', validateConfigPack, '.loc', true);
export const MesAnimPack = new PackFile('mesanim', validateConfigPack, '.mesanim');
export const MapPack = new PackFile('map', validateFilesPack, [`${Environment.build.srcDir}/maps`], '.jm2', false);
export const MidiPack = new PackFile('midi', validateFilesPack, [`${Environment.build.srcDir}/jingles`, `${Environment.build.srcDir}/songs`], '.mid');
export const ModelPack = new PackFile('model', validateFilesPack, [`${Environment.build.srcDir}/models`], '.ob2');
export const NpcPack = new PackFile('npc', validateConfigPack, '.npc', true);
export const ObjPack = new PackFile('obj', validateConfigPack, '.obj', true);
export const ParamPack = new PackFile('param', validateConfigPack, '.param');
export const ScriptPack = new PackFile('script', regenScriptPack);
export const SeqPack = new PackFile('seq', validateConfigPack, '.seq', true);
export const SynthPack = new PackFile('synth', validateFilesPack, [`${Environment.build.srcDir}/synth`], '.synth');
export const SpotAnimPack = new PackFile('spotanim', validateConfigPack, '.spotanim', true);
export const StructPack = new PackFile('struct', validateConfigPack, '.struct');
export const TexturePack = new PackFile('texture', validateImagePack, `${Environment.build.srcDir}/textures`, '.png');
export const VarpPack = new PackFile('varp', validateConfigPack, '.varp', true);
export const VarbitPack = new PackFile('varbit', validateConfigPack, '.varbit', true);
export const VarnPack = new PackFile('varn', validateConfigPack, '.varn');
export const VarsPack = new PackFile('vars', validateConfigPack, '.vars');

PackFile.suspendAutoReload = false;

export async function revalidatePack() {
    const snapshot = await SourceSnapshot.create([
        {
            path: `${Environment.build.srcDir}/scripts`,
            exts: ['.constant', '.dbrow', '.dbtable', '.enum', '.flo', '.hunt', '.idk', '.if', '.inv', '.loc', '.mesanim', '.npc', '.obj', '.param', '.rs2', '.seq', '.spotanim', '.struct', '.varbit', '.varn', '.varp', '.vars']
        },
        { path: `${Environment.build.srcDir}/models`, exts: ['.anim', '.base', '.frame', '.ob2'] },
        { path: `${Environment.build.srcDir}/maps`, exts: ['.jm2'] },
        { path: `${Environment.build.srcDir}/jingles`, exts: ['.mid'] },
        { path: `${Environment.build.srcDir}/songs`, exts: ['.mid'] },
        { path: `${Environment.build.srcDir}/synth`, exts: ['.synth'] },
        { path: `${Environment.build.srcDir}/textures`, exts: ['.png'] }
    ]);

    currentRevalidateContext = {
        snapshot,
        toolChanged: didFileSetChange('data/pack/.stamps/revalidate-tools.txt', [Environment.runtime.isBun ? __filename : import.meta.filename, 'tools/pack/Parse.ts'])
    };

    try {
        AnimSetPack.reload();
        AnimPack.reload();
        BasePack.reload();
        CategoryPack.reload();
        DbRowPack.reload();
        DbTablePack.reload();
        EnumPack.reload();
        FloPack.reload();
        HuntPack.reload();
        IdkPack.reload();
        InterfacePack.reload();
        InvPack.reload();
        LocPack.reload();
        MesAnimPack.reload();
        MapPack.reload();
        MidiPack.reload();
        ModelPack.reload();
        NpcPack.reload();
        ObjPack.reload();
        ParamPack.reload();
        ScriptPack.reload();
        SeqPack.reload();
        SynthPack.reload();
        SpotAnimPack.reload();
        StructPack.reload();
        TexturePack.reload();
        VarpPack.reload();
        VarnPack.reload();
        VarsPack.reload();
        VarbitPack.reload();
    } finally {
        currentRevalidateContext = null;
    }
}

export function crawlConfigNames(ext: string, includeBrackets = false) {
    const names = new Set<string>();

    loadDirExtFull(`${Environment.build.srcDir}/scripts`, ext, (lines: string[], file: string) => {
        if (file === `${Environment.build.srcDir}/scripts/engine.rs2`) {
            // these command signatures are specifically for the compiler to have type information
            return;
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('[')) {
                let name = line.substring(0, line.indexOf(']') + 1);
                if (!includeBrackets) {
                    name = name.substring(1, name.length - 1);
                }

                if (Environment.build.verifyFolder) {
                    const parentParent = basename(dirname(dirname(dirname(file))));
                    const parent = basename(dirname(dirname(file)));
                    const dir = basename(dirname(file));
                    if (dir !== '_unpack' && parent !== '_unpack' && parentParent !== '_unpack' && ext !== '.flo') {
                        if (ext === '.rs2' && dir !== 'scripts' && parent !== 'scripts') {
                            throw new Error(`Script file ${file} must be located inside a "scripts" directory.`);
                        } else if (ext !== '.rs2' && dir !== 'configs' && parent !== 'configs') {
                            throw new Error(`Config file ${file} must be located inside a "configs" directory.`);
                        }
                    }
                }

                names.add(name);
            }
        }
    });

    return Array.from(names);
}

function crawlConfigCategories() {
    const names = new Set<string>();

    loadDirExtFull(`${Environment.build.srcDir}/scripts`, '.loc', (lines: string[]) => {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('category=')) {
                names.add(line.substring('category='.length));
            }
        }
    });

    loadDirExtFull(`${Environment.build.srcDir}/scripts`, '.npc', (lines: string[]) => {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('category=')) {
                names.add(line.substring('category='.length));
            }
        }
    });

    loadDirExtFull(`${Environment.build.srcDir}/scripts`, '.obj', (lines: string[]) => {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('category=')) {
                names.add(line.substring('category='.length));
            }
        }
    });

    return Array.from(names);
}

export function getModified(path: string) {
    if (!fileExists(path)) {
        return 0;
    }

    const stats = fileStats(path);
    return stats.mtimeMs;
}

export function getLatestModified(path: string, ext: string) {
    const files = listFilesExt(path, ext);

    let latest = 0;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const stats = fileStats(file);

        if (stats.mtimeMs > latest) {
            latest = stats.mtimeMs;
        }
    }

    return latest;
}

export function shouldBuild(path: string, ext: string, out: string) {
    if (!fileExists(out)) {
        return true;
    }

    const stats = fileStats(out);
    const latest = getLatestModified(path, ext);

    return stats.mtimeMs < latest;
}

export function shouldBuildFile(src: string, dest: string) {
    if (!fileExists(dest)) {
        return true;
    }

    const stats = fileStats(dest);
    const srcStats = fileStats(src);

    return stats.mtimeMs < srcStats.mtimeMs;
}

export function shouldBuildFileAny(path: string, dest: string) {
    if (!fileExists(dest)) {
        return true;
    }

    if (!fileExists(path)) {
        return false;
    }

    const entries = fs.readdirSync(path, { withFileTypes: true });

    for (const entry of entries) {
        const target = `${entry.parentPath}/${entry.name}`;

        if (entry.isDirectory()) {
            const subdir = shouldBuildFileAny(target, dest);
            if (subdir) {
                return true;
            }
        } else {
            if (shouldBuildFile(target, dest)) {
                return true;
            }
        }
    }

    return false;
}

export function shouldBuildFileList(files: string[], dest: string) {
    if (!fileExists(dest)) {
        return true;
    }

    const stats = fileStats(dest);
    for (const file of files) {
        if (fileExists(file) && fileStats(file).mtimeMs > stats.mtimeMs) {
            return true;
        }
    }

    return false;
}
