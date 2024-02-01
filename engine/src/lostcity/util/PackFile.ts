import fs from 'fs';
import { basename, dirname } from 'path';

import { codeTimer } from '#lostcity/util/CodeTimer.js';
import { listFilesExt, loadDirExtFull, loadFile } from '#lostcity/util/Parse.js';

export function loadOrder(path: string): number[] {
    if (!fs.existsSync(path)) {
        return [];
    }

    const lines = loadFile(path);
    const order: number[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length === 0) {
            continue;
        }

        const num = parseInt(line);
        if (!isNaN(num)) {
            order.push(num);
        }
    }

    return order;
}

export function loadPack(path: string): string[] {
    if (!fs.existsSync(path)) {
        return [];
    }

    const lines = loadFile(path);
    const pack: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length === 0) {
            continue;
        }

        const index = line.substring(0, line.indexOf('='));
        const name = line.substring(line.indexOf('=') + 1);

        if (index.length === 0 || name.length === 0) {
            continue;
        }

        const num = parseInt(index);
        if (!isNaN(num)) {
            pack[num] = name;
        }
    }

    return pack;
}

export function getLatestModified(path: string, ext: string) {
    const files = listFilesExt(path, ext);

    let latest = 0;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const stats = fs.statSync(file);

        if (stats.mtimeMs > latest) {
            latest = stats.mtimeMs;
        }
    }

    return latest;
}

export function shouldBuild(path: string, ext: string, out: string) {
    if (!fs.existsSync(out)) {
        return true;
    }

    const stats = fs.statSync(out);
    const latest = getLatestModified(path, ext);

    return stats.mtimeMs < latest;
}

export function shouldBuildFile(src: string, dest: string) {
    if (!fs.existsSync(dest)) {
        return true;
    }

    const stats = fs.statSync(dest);
    const srcStats = fs.statSync(src);

    return stats.mtimeMs < srcStats.mtimeMs;
}

export function crawlConfigNames(ext: string, includeBrackets = false) {
    const names: string[] = [];

    loadDirExtFull('data/src/scripts', ext, (lines: string[], file: string) => {
        if (file === 'data/src/scripts/engine.rs2') {
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

                const parent = basename(dirname(dirname(file)));
                const dir = basename(dirname(file));
                if (dir !== '_unpack' && ext !== '.flo') {
                    if (ext === '.rs2' && dir !== 'scripts' && parent !== 'scripts') {
                        throw new Error(`Script file ${file} must be located inside a "scripts" directory.`);
                    } else if (ext !== '.rs2' && dir !== 'configs' && parent !== 'configs') {
                        throw new Error(`Config file ${file} must be located inside a "configs" directory.`);
                    }
                }

                if (names.indexOf(name) === -1) {
                    names.push(name);
                }
            }
        }
    });

    return names;
}

export function crawlConfigCategories() {
    const names: string[] = [];

    loadDirExtFull('data/src/scripts', '.loc', (lines: string[]) => {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('category=')) {
                const name = line.substring('category='.length);

                if (names.indexOf(name) === -1) {
                    names.push(name);
                }
            }
        }
    });

    loadDirExtFull('data/src/scripts', '.npc', (lines: string[]) => {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('category=')) {
                const name = line.substring('category='.length);

                if (names.indexOf(name) === -1) {
                    names.push(name);
                }
            }
        }
    });

    loadDirExtFull('data/src/scripts', '.obj', (lines: string[]) => {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('category=')) {
                const name = line.substring('category='.length);

                if (names.indexOf(name) === -1) {
                    names.push(name);
                }
            }
        }
    });

    return names;
}

export function regenPack(pack: string[], names: string[], reduce = false, reuse = false, recycle = false): string[] {
    const reuseIds = [];

    if (reduce) {
        // remove missing ids (shifts ids)
        pack = pack.filter(x => x);

        // remove missing names (shifts ids)
        for (let i = 0; i < pack.length; i++) {
            if (names.indexOf(pack[i]) === -1) {
                pack.splice(i--, 1);
            }
        }
    } else if (reuse) {
        // if something was deleted, prioritize placing new names in those deleted slots
        for (let i = 0; i < pack.length; i++) {
            if (names.indexOf(pack[i]) === -1) {
                reuseIds.push(i);
            }
        }
    } else if (recycle) {
        // completely scorched earth (resets ids)
        pack = [];
    }

    for (let i = 0; i < names.length; i++) {
        const name = names[i];

        if (pack.indexOf(name) === -1) {
            if (reuseIds.length > 0) {
                pack[reuseIds.shift()!] = name;
            } else {
                pack.push(name);
            }
        }
    }

    return pack;
}

export function packToFile(pack: string[], path: string) {
    fs.writeFileSync(path, pack.map((x, i) => `${i}=${x}`).join('\n') + '\n');
}

export function validateFilesPack(packPath: string, srcPath: string, ext: string, regen = false, reduce = false, reuse = false, recycle = false): string[] {
    console.log(`[validateFilesPack] ${packPath} (${srcPath}/*${ext})`);
    const timer = codeTimer('validateFilesPack');

    const names = listFilesExt(srcPath, ext).map(x => basename(x, ext));
    let pack = loadPack(packPath);
    if (regen) {
        pack = regenPack(pack, names, reduce, reuse, recycle);
        packToFile(pack, packPath);
    }

    // check if we've got something in the pack file that's missing a config
    for (let i = 0; i < pack.length; i++) {
        if (typeof pack[i] === 'undefined') {
            continue;
        }

        if (!names.includes(pack[i])) {
            throw new Error(`Missing file ${pack[i]} tracked in ${packPath}`);
        }
    }

    // check if we've got a config created that's not in the pack file
    for (let i = 0; i < names.length; i++) {
        if (!pack.includes(names[i])) {
            throw new Error(`Missing ID for ${names[i]} in ${packPath}`);
        }
    }

    timer.stop();

    return pack;
}

export function validateConfigPack(packPath: string, ext: string, regen = false, reduce = false, reuse = false, recycle = false): string[] {
    console.log(`[validateConfigPack] ${packPath} (data/src/scripts/*${ext})`);
    const timer = codeTimer('validateConfigPack');

    const names = crawlConfigNames(ext);
    let pack = loadPack(packPath);
    if (regen) {
        pack = regenPack(pack, names, reduce, reuse, recycle);
        packToFile(pack, packPath);
    }

    // check if we've got something in the pack file that's missing a config
    for (let i = 0; i < pack.length; i++) {
        if (!names.includes(pack[i]) && !pack[i].startsWith('cert_')) {
            console.error(`\n${packPath}:${i + 1}`);
            console.error(`${pack[i]} was defined in the pack file, but it's missing a config`);
            process.exit(1);
        }
    }

    // check if we've got a config created that's not in the pack file
    for (let i = 0; i < names.length; i++) {
        if (!pack.includes(names[i])) {
            console.error(`\n${packPath}`);
            console.error(`${names[i]} is missing from the .pack file`);
            process.exit(1);
        }
    }

    timer.stop();

    return pack;
}

export function validateCategoryPack() {
    console.log('[validateCategoryPack] data/pack/category.pack (data/src/scripts/*.(loc|npc|obj))');
    const timer = codeTimer('validateCategoryPack');

    if (shouldBuild('data/src/scripts', '.loc', 'data/pack/category.pack') || shouldBuild('data/src/scripts', '.npc', 'data/pack/category.pack') || shouldBuild('data/src/scripts', '.obj', 'data/pack/category.pack')) {
        const names = crawlConfigCategories();
        const pack = regenPack(loadPack('data/pack/category.pack'), names);
        packToFile(pack, 'data/pack/category.pack');

        timer.stop();

        return pack;
    } else {
        const pack = loadPack('data/pack/category.pack');

        timer.stop();

        return pack;
    }
}

export function validateInterfacePack() {
    console.log('[validateInterfacePack] data/pack/interface.pack (data/src/scripts/*.if)');
    const timer = codeTimer('validateInterfacePack');

    const names: string[] = [];

    loadDirExtFull('data/src/scripts', '.if', (lines: string[], file: string) => {
        const parent = basename(dirname(dirname(file)));
        const dir = basename(dirname(file));
        if (dir !== 'interfaces' && parent !== 'interfaces') {
            throw new Error(`Interface file ${file} must be located inside an "interfaces" directory.`);
        }

        const inter = basename(file, '.if');
        names.push(inter);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('[')) {
                const com = line.substring(1, line.length - 1);
                const name = `${inter}:${com}`;

                if (names.indexOf(name) === -1) {
                    names.push(name);
                }
            }
        }
    });

    const pack = loadPack('data/pack/interface.pack');
    // const pack = regenPack(loadPack('data/pack/interface.pack'), names);
    // packToFile(pack, 'data/pack/interface.pack');

    timer.stop();

    return pack;
}

export function validateScriptPack() {
    console.log('[validateScriptPack] data/pack/script.pack (data/src/scripts/*.rs2)');
    const timer = codeTimer('validateScriptPack');

    const names = crawlConfigNames('.rs2', true);
    const pack = regenPack(loadPack('data/pack/script.pack'), names);
    packToFile(pack, 'data/pack/script.pack');

    timer.stop();

    return pack;
}
