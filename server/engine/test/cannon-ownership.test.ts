import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('a decayed cannon leaves its owner no claim on the next cannon set up on that tile', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cannon-ownership-'));
    try {
        // Runs against the built script pack; isolate engine workers/database from the main suite.
        const result = Bun.spawnSync([process.execPath, 'test', join(import.meta.dir, 'fixtures/cannon-ownership.ts')], {
            cwd: join(import.meta.dir, '..'),
            env: { ...process.env, GE_DATABASE: join(dir, 'market.sqlite') },
            stdout: 'pipe',
            stderr: 'pipe'
        });
        if (result.exitCode !== 0) throw new Error(result.stdout.toString() + result.stderr.toString());
        expect(result.stdout.toString()).toContain('cannon ownership checks passed');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}, 60000);
