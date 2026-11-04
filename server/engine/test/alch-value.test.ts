import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('NPC re-given quest items alch for 1gp', () => {
    const dir = mkdtempSync(join(tmpdir(), 'alch-value-'));
    try {
        // Runs the packed alchemy scripts; isolate engine workers/database from the main suite.
        const result = Bun.spawnSync([process.execPath, 'test', join(import.meta.dir, 'fixtures/alch-value.ts')], {
            cwd: join(import.meta.dir, '..'),
            env: { ...process.env, GE_DATABASE: join(dir, 'market.sqlite') },
            stdout: 'pipe',
            stderr: 'pipe'
        });
        if (result.exitCode !== 0) throw new Error(result.stdout.toString() + result.stderr.toString());
        expect(result.stdout.toString()).toContain('alch cost checks passed');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}, 60000);
