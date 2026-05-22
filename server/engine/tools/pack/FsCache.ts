import fs from 'fs';
import path from 'path';

const dirCache: Map<string, string[]> = new Map();
const existsCache: Map<string, boolean> = new Map();
const statsCache: Map<string, fs.Stats> = new Map();
const textCache: Map<string, string> = new Map();
const binaryCache: Map<string, Buffer> = new Map();

export function stableMtimeMs(mtimeMs: number): number {
    // Bun and Node/tsx report different fractional precision for the same file.
    // Normalize to integer milliseconds so cache stamp files stay runtime-agnostic.
    return Math.trunc(mtimeMs);
}

export function clearFsCache() {
    dirCache.clear();
    existsCache.clear();
    statsCache.clear();
    textCache.clear();
    binaryCache.clear();
}

export function fileExists(path: string): boolean {
    if (existsCache.has(path)) {
        return existsCache.get(path)!;
    }

    const exists = fs.existsSync(path);
    existsCache.set(path, exists);
    return exists;
}

export function fileStats(path: string): fs.Stats {
    if (statsCache.has(path)) {
        return statsCache.get(path)!;
    }

    const exists = fs.statSync(path);
    statsCache.set(path, exists);
    return exists;
}

export function listDir(path: string): string[] {
    if (path.endsWith('/')) {
        path = path.substring(0, path.length - 1);
    }

    let files: string[] | undefined = dirCache.get(path);

    if (typeof files === 'undefined') {
        if (!fs.existsSync(path)) {
            return [];
        }

        const entries = fs.readdirSync(path, { withFileTypes: true });

        files = [];
        for (const entry of entries) {
            if (entry.isDirectory()) {
                files.push(`${entry.name}/`);
            } else {
                files.push(entry.name);
            }
        }

        dirCache.set(path, files);
    }

    const all: string[] = [];
    for (let i = 0; i < files.length; i++) {
        all.push(`${path}/${files[i]}`);

        if (files[i].endsWith('/')) {
            all.push(...listDir(`${path}/${files[i]}`));
        }
    }

    return all;
}

export function listFiles(path: string, out: string[] = []) {
    const files = listDir(path);

    for (const file of files) {
        out.push(file);
    }

    return out;
}

export function readTextFile(filePath: string, encoding: BufferEncoding = 'utf8'): string {
    const key = `${encoding}:${filePath}`;
    const cached = textCache.get(key);
    if (typeof cached !== 'undefined') {
        return cached;
    }

    const text = fs.readFileSync(filePath, encoding);
    textCache.set(key, text);
    return text;
}

export function readBinaryFile(filePath: string): Buffer {
    const cached = binaryCache.get(filePath);
    if (typeof cached !== 'undefined') {
        return cached;
    }

    const data = fs.readFileSync(filePath);
    binaryCache.set(filePath, data);
    return data;
}

function ensureParentDir(filePath: string) {
    const dir = path.resolve(path.dirname(filePath));
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

export function writeFileIfChanged(filePath: string, data: string | Uint8Array, encoding: BufferEncoding = 'utf8'): boolean {
    if (typeof data === 'string') {
        if (fileExists(filePath) && readTextFile(filePath, encoding) === data) {
            return false;
        }

        ensureParentDir(filePath);
        fs.writeFileSync(filePath, data, encoding);
        textCache.set(`${encoding}:${filePath}`, data);
        binaryCache.delete(filePath);
        existsCache.set(filePath, true);
        statsCache.delete(filePath);
        return true;
    }

    if (fileExists(filePath)) {
        const current = readBinaryFile(filePath);
        if (current.length === data.length) {
            let same = true;
            for (let i = 0; i < current.length; i++) {
                if (current[i] !== data[i]) {
                    same = false;
                    break;
                }
            }

            if (same) {
                return false;
            }
        }
    }

    ensureParentDir(filePath);
    const next = Buffer.from(data);
    fs.writeFileSync(filePath, next);
    binaryCache.set(filePath, next);
    textCache.delete(`utf8:${filePath}`);
    textCache.delete(`ascii:${filePath}`);
    existsCache.set(filePath, true);
    statsCache.delete(filePath);
    return true;
}

export function didFileSetChange(stampPath: string, files: string[]): boolean {
    const state = files.map(file => `${file}=${fileExists(file) ? stableMtimeMs(fileStats(file).mtimeMs) : 0}`).join('\n');

    if (fileExists(stampPath) && readTextFile(stampPath) === state) {
        return false;
    }

    writeFileIfChanged(stampPath, state);
    return true;
}
