import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('medium clue challenge rejects answers after the clue is dropped mid-dialog', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trail-challenge-drop-'));
    try {
        // Runs against the compiled scripts in data/pack (bun run build); isolated process like the other script fixtures.
        const result = Bun.spawnSync([process.execPath, 'test', join(import.meta.dir, 'fixtures/trail-challenge-drop.ts')], {
            cwd: join(import.meta.dir, '..'),
            env: { ...process.env, GE_DATABASE: join(dir, 'market.sqlite'), TRAIL_TEST_OUTPUT: dir },
            stdout: 'pipe',
            stderr: 'pipe'
        });
        if (result.exitCode !== 0) throw new Error(result.stdout.toString() + result.stderr.toString());
        expect(result.stdout.toString() + result.stderr.toString()).toContain('Trail challenge checks passed');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}, 60000);
