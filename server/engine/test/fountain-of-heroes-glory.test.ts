import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Fountain of Heroes and deferred Op*U interactions reject moved inventory slots', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fountain-of-heroes-glory-'));
    try {
        const result = Bun.spawnSync([process.execPath, 'test', join(import.meta.dir, 'fixtures/fountain-of-heroes-glory.ts')], {
            cwd: join(import.meta.dir, '..'),
            env: { ...process.env, GE_DATABASE: join(dir, 'market.sqlite'), FOUNTAIN_GLORY_TEST_OUTPUT: dir },
            stdout: 'pipe',
            stderr: 'pipe'
        });
        if (result.exitCode !== 0) throw new Error(result.stdout.toString() + result.stderr.toString());
        expect(result.stdout.toString()).toContain('Fountain of Heroes glory checks passed');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}, 60000);
