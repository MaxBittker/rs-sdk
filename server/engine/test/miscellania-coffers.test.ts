import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('compiled Miscellania money handlers conserve coins across dialog inputs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'miscellania-coffers-'));
    try {
        // Compile into a disposable cache and isolate engine workers/database from the main suite.
        const result = Bun.spawnSync([process.execPath, 'test', join(import.meta.dir, 'fixtures/miscellania-coffers.ts')], {
            cwd: join(import.meta.dir, '..'),
            env: { ...process.env, GE_DATABASE: join(dir, 'market.sqlite'), MISCELLANIA_TEST_OUTPUT: dir },
            stdout: 'pipe',
            stderr: 'pipe'
        });
        if (result.exitCode !== 0) throw new Error(result.stdout.toString() + result.stderr.toString());
        expect(result.stdout.toString()).toContain('Miscellania coffer checks passed');
        expect(result.stdout.toString()).toContain('Miscellania collection checks passed');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}, 60000);
