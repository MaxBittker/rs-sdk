import { expect, test } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('reconnect transfers ownership and stale socket closes cannot detach the replacement', () => {
    // Isolate worker mocks and all engine cache/config I/O from other tests and saves.
    const dir = mkdtempSync(join(tmpdir(), 'reconnect-lifecycle-'));
    try {
        mkdirSync(join(dir, 'data/config'), { recursive: true });
        copyFileSync(join(import.meta.dir, '../data/config/private.pem'), join(dir, 'data/config/private.pem'));
        const result = Bun.spawnSync([process.execPath, 'test', join(import.meta.dir, 'fixtures/reconnect-lifecycle.ts')], {
            cwd: dir,
            env: { ...process.env, GE_DATABASE: join(dir, 'market.sqlite') }
        });
        if (result.exitCode !== 0) {
            throw new Error(result.stdout.toString() + result.stderr.toString());
        }
        expect(result.exitCode).toBe(0);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}, 15000);
