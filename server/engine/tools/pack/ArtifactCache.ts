import { zipSync, unzipSync } from 'fflate';

import { fileExists, fileStats, readBinaryFile, readTextFile, stableMtimeMs, writeFileIfChanged } from '#tools/pack/FsCache.js';

export type ArtifactManifest = Record<string, string>;

function artifactPath(name: string, suffix: string) {
    return `data/pack/.cache/${name}${suffix}`;
}

function equalsData(a: Uint8Array, b: Uint8Array) {
    if (a.length !== b.length) {
        return false;
    }

    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }

    return true;
}

export class ArtifactStore {
    private entries: Record<string, Uint8Array>;
    private dirty = false;
    private readonly zipPath: string;

    constructor(name: string, recreate = false) {
        this.zipPath = artifactPath(name, '.zip');
        this.entries = {};

        if (!recreate && fileExists(this.zipPath)) {
            this.entries = unzipSync(readBinaryFile(this.zipPath));
        }
    }

    has(key: string) {
        return typeof this.entries[key] !== 'undefined';
    }

    read(key: string) {
        return this.entries[key] ?? null;
    }

    write(key: string, data: Uint8Array) {
        const next = new Uint8Array(data);
        const current = this.entries[key];
        if (current && equalsData(current, next)) {
            return false;
        }

        this.entries[key] = next;
        this.dirty = true;
        return true;
    }

    save() {
        if (!this.dirty && fileExists(this.zipPath)) {
            return false;
        }

        writeFileIfChanged(this.zipPath, zipSync(this.entries, { level: 0 }));
        this.dirty = false;
        return true;
    }
}

export function getArtifactManifestPath(name: string) {
    return artifactPath(name, '.manifest.json');
}

export function openArtifactStore(name: string, recreate = false) {
    return new ArtifactStore(name, recreate);
}

export function loadArtifactManifest(name: string, recreate = false): ArtifactManifest {
    if (recreate) {
        return {};
    }

    const manifestPath = getArtifactManifestPath(name);
    if (!fileExists(manifestPath)) {
        return {};
    }

    try {
        return JSON.parse(readTextFile(manifestPath)) as ArtifactManifest;
    } catch {
        return {};
    }
}

export function saveArtifactManifest(name: string, manifest: ArtifactManifest) {
    writeFileIfChanged(getArtifactManifestPath(name), JSON.stringify(manifest));
}

export function getArtifactSourceStamp(filePath: string) {
    if (!fileExists(filePath)) {
        return '0';
    }

    const stats = fileStats(filePath);
    return `${stats.size}:${stableMtimeMs(stats.mtimeMs)}`;
}
