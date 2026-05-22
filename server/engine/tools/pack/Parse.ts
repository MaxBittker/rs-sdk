import fs from 'fs';

import Environment from '#/util/Environment.js';
import { listDir, listFiles, readTextFile } from '#tools/pack/FsCache.js';

// simple! just reads the file as-is
export function loadFile(path: string): string[] {
    if (!fs.existsSync(path)) {
        return [];
    }

    return readTextFile(path).split(/\r?\n/);
}

// fully-featured! strips out comments
export function loadFileFull(path: string) {
    const text = loadFile(path);
    const lines = [];

    let multiCommentStart = 0;
    let multiLineComments = 0;
    for (let i = 0; i < text.length; i++) {
        let line = text[i].trim();
        if (multiLineComments > 0) {
            let commentStart = line.indexOf('/*');
            while (commentStart !== -1) {
                line = line.substring(commentStart + 2).trimStart();
                multiLineComments++;
                commentStart = line.indexOf('/*');
            }

            let commentEnd = line.indexOf('*/');
            while (commentEnd !== -1 && multiLineComments > 0) {
                line = line.substring(commentEnd + 2).trimStart();
                multiLineComments--;
                commentEnd = line.indexOf('*/');
            }

            if (multiLineComments > 0) {
                continue;
            }
        }

        if (line.length === 0) {
            continue;
        }

        // if a line contains a single-line comment, strip it out
        const comment = line.indexOf('//');
        if (comment !== -1) {
            line = line.substring(0, comment).trimEnd();
            if (line.length === 0) {
                continue;
            }
        }

        // if a line contains a multi-line comment, strip it out
        const commentStart = line.indexOf('/*');
        const commentEnd = line.indexOf('*/');
        if (commentStart !== -1) {
            if (commentEnd !== -1) {
                // comment ends on this line!
                line = line.substring(0, commentStart) + line.substring(commentEnd + 2);
            } else {
                // comment continues to another line
                line = line.substring(0, commentStart);
                multiLineComments++;

                if (multiCommentStart === 0) {
                    multiCommentStart = i + 1;
                }
            }

            if (line.length === 0) {
                continue;
            }
        }

        lines.push(line);
    }

    if (multiLineComments > 0) {
        throw new Error(`${path} has an unclosed multi-line comment! Line: ${multiCommentStart}`);
    }

    return lines;
}

// ----

export type LoadDirCallback = (lines: string[], file: string) => void;

// Read all files inside a directory
export function loadDir(path: string, callback: LoadDirCallback) {
    const files = listFiles(path);

    for (let i = 0; i < files.length; i++) {
        callback(loadFile(files[i]), files[i].substring(files[i].lastIndexOf('/') + 1));
    }
}

// Read all files inside a directory with extra features
export function loadDirFull(path: string, callback: LoadDirCallback) {
    const files = listFiles(path);

    for (let i = 0; i < files.length; i++) {
        callback(loadFileFull(files[i]), files[i].substring(files[i].lastIndexOf('/') + 1));
    }
}

// ----

// Generate a list of files inside a directory with a specific extension
export function listFilesExt(path: string, ext: string): string[] {
    if (!fs.existsSync(path)) {
        return [];
    }

    return listDir(path).filter(x => x.endsWith(ext));
}

// Read all files inside a directory with a specific extension
export function loadDirExt(path: string, ext: string, callback: LoadDirCallback) {
    const files = listFilesExt(path, ext);

    for (let i = 0; i < files.length; i++) {
        callback(loadFile(files[i]), files[i]);
    }
}

// Read all files inside a directory with a specific extension with extra features
export function loadDirExtFull(path: string, ext: string, callback: LoadDirCallback) {
    const files = listFilesExt(path, ext);

    for (let i = 0; i < files.length; i++) {
        callback(loadFileFull(files[i]), files[i]);
    }
}

// ----

export function readConfigs(ext: string) {
    const configs = new Map<string, string[]>();

    loadDirExtFull(`${Environment.build.srcDir}/scripts`, ext, (lines: string[], file: string) => {
        let current: string = '';
        let config: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('[')) {
                if (current.length) {
                    if (configs.has(current)) {
                        throw new Error(`Duplicate config found in ${file}: ${current}`);
                    }

                    configs.set(current, config);
                }

                current = line.substring(1, line.length - 1);
                config = [];
                continue;
            }

            config.push(line);
        }

        if (current.length) {
            if (configs.has(current)) {
                throw new Error(`Duplicate config found in ${file}: ${current}`);
            }

            configs.set(current, config);
        }
    });

    return configs;
}
