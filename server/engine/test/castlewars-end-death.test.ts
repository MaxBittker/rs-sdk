import { expect, test } from 'bun:test';
import { join } from 'node:path';

test('dying on the tick a Castle Wars game ends is a Castle Wars death', () => {
    // Runs against the compiled scripts in data/pack (bun run build) with the real map, in its own process.
    const result = Bun.spawnSync([process.execPath, join(import.meta.dir, 'fixtures/castlewars-end-death.ts')], {
        cwd: join(import.meta.dir, '..'),
        stdout: 'pipe',
        stderr: 'pipe'
    });
    const output = result.stdout.toString() + result.stderr.toString();
    if (result.exitCode !== 0) throw new Error(output);
    expect(output).toContain('castlewars-end-death ok');
}, 120000);
