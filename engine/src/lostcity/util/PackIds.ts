import fs from 'fs';

import { loadDir } from '#lostcity/util/NameMap.js';

export function getLatestModified(path: string, extension: string) {
    const files = fs.readdirSync(path);

    let mTimeMs = 0;
    for (const file of files) {
        if (fs.statSync(`${path}/${file}`).isDirectory()) {
            mTimeMs = Math.max(mTimeMs, getLatestModified(`${path}/${file}`, extension));
        } else if (file.endsWith(extension)) {
            mTimeMs = Math.max(mTimeMs, fs.statSync(`${path}/${file}`).mtimeMs);
        }
    }

    return mTimeMs;
}

export function shouldBuild(dir: string, ext: string, output: string) {
    if (!fs.existsSync(output)) {
        return true;
    }

    const mTimeMsSource = getLatestModified(dir, ext);
    const mTimeMsOutput = fs.statSync(output).mtimeMs;

    return mTimeMsSource > mTimeMsOutput;
}

export function shouldBuildFile(input: string, output: string) {
    if (!fs.existsSync(output)) {
        return true;
    }

    const mTimeMs1 = fs.statSync(input).mtimeMs;
    const mTimeMs2 = fs.statSync(output).mtimeMs;

    return mTimeMs1 > mTimeMs2;
}

export function crawlConfigNames(ext: string, includeBrackets = false) {
    const names: string[] = [];

    loadDir('data/src/scripts', ext, (src, file) => {
        if (file === 'engine.rs2') {
            // these command signatures are specifically for the compiler to have type information
            return;
        }

        for (let i = 0; i < src.length; i++) {
            const line = src[i];
            if (line.startsWith('//')) {
                continue;
            }

            if (line.startsWith('[')) {
                let name = line.substring(0, line.indexOf(']') + 1);
                if (!includeBrackets) {
                    name = name.substring(1, name.length - 1);
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

    loadDir('data/src/scripts', '.loc', src => {
        for (let i = 0; i < src.length; i++) {
            const line = src[i];

            if (line.startsWith('category=')) {
                const name = line.substring('category='.length);

                if (names.indexOf(name) === -1) {
                    names.push(name);
                }
            }
        }
    });

    loadDir('data/src/scripts', '.npc', src => {
        for (let i = 0; i < src.length; i++) {
            const line = src[i];

            if (line.startsWith('category=')) {
                const name = line.substring('category='.length);

                if (names.indexOf(name) === -1) {
                    names.push(name);
                }
            }
        }
    });

    loadDir('data/src/scripts', '.obj', src => {
        for (let i = 0; i < src.length; i++) {
            const line = src[i];

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

export function regenPack(pack: string[], names: string[], reduce = false, reuse = false, recycle = false) {
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
        let id = pack.indexOf(name);

        if (id === -1) {
            if (reuseIds.length) {
                // ! is safe because we know reuseIds.length > 0
                id = reuseIds.shift()!;
                pack[id] = name;
            } else {
                pack.push(name);
            }
        }
    }

    return (
        pack
            .map((name, id) => `${id}=${name}`)
            .filter(x => x)
            .join('\n') + '\n'
    );
}
