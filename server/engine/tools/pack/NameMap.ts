import fs from 'fs';
import { listDir, readTextFile } from '#tools/pack/FsCache.js';

export function loadOrder(path: string) {
    if (!fs.existsSync(path)) {
        return [];
    }

    return readTextFile(path, 'ascii')
        .split(/\r?\n/)
        .filter(x => x)
        .map(x => parseInt(x));
}

// TODO (jkm) use Record<..> here rather than string-typed arrays

export function loadPack(path: string) {
    if (!fs.existsSync(path)) {
        return [] as string[];
    }

    return readTextFile(path, 'ascii')
        .split(/\r?\n/)
        .filter(x => x)
        .reduce((acc, x) => {
            const [id, name] = x.split('=');
            acc[id as unknown as number] = name;
            return acc;
        }, [] as string[]);
}

export function loadDir(path: string, extension: string, callback: (src: string[], file: string, path: string) => void) {
    const files = listDir(path);

    for (const file of files) {
        if (file.endsWith(extension)) {
            callback(
                readTextFile(file, 'ascii')
                    .split(/\r?\n/)
                    .filter(x => x),
                file.substring(file.lastIndexOf('/') + 1),
                file.substring(0, file.lastIndexOf('/'))
            );
        }
    }
}

export function loadDirExact(path: string, extension: string, callback: (src: string[], file: string, path: string) => void) {
    const files = listDir(path);

    for (const file of files) {
        if (file.endsWith(extension)) {
            callback(readTextFile(file, 'ascii').split(/\r?\n/), file.substring(file.lastIndexOf('/') + 1), file.substring(0, file.lastIndexOf('/')));
        }
    }
}
