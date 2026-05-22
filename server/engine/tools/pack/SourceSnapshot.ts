import { Dirent } from 'fs';
import fs from 'fs/promises';
import path from 'path';

type RootSpec = {
    path: string;
    exts: string[];
};

function makeKey(root: string, ext: string) {
    return `${root}|${ext}`;
}

export class SourceSnapshot {
    private latest = new Map<string, number>();

    static async create(roots: RootSpec[]) {
        const snapshot = new SourceSnapshot();
        await Promise.all(roots.map(root => snapshot.scanRoot(root)));
        return snapshot;
    }

    private async scanRoot(root: RootSpec) {
        for (const ext of root.exts) {
            this.latest.set(makeKey(root.path, ext), 0);
        }

        await this.walk(root.path, new Set(root.exts), root.path);
    }

    private async walk(dir: string, exts: Set<string>, root: string) {
        let entries: Awaited<Dirent[]>;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        await Promise.all(
            entries.map(async entry => {
                const target = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    await this.walk(target, exts, root);
                    return;
                }

                const ext = path.extname(entry.name);
                if (!exts.has(ext)) {
                    return;
                }

                const key = makeKey(root, ext);
                const current = this.latest.get(key) ?? 0;
                const modified = (await fs.stat(target)).mtimeMs;
                if (modified > current) {
                    this.latest.set(key, modified);
                }
            })
        );
    }

    isNewer(root: string, ext: string, timestamp: number) {
        return (this.latest.get(makeKey(root, ext)) ?? 0) > timestamp;
    }
}
