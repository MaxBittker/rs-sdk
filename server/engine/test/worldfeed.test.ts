import { expect, test } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('world feed streams players to subscribers', () => {
    // Isolate worker mocks and engine config I/O, like reconnect.test.ts.
    const dir = mkdtempSync(join(tmpdir(), 'worldfeed-'));
    try {
        mkdirSync(join(dir, 'data/config'), { recursive: true });
        copyFileSync(join(import.meta.dir, '../data/config/private.pem'), join(dir, 'data/config/private.pem'));
        const result = Bun.spawnSync([process.execPath, 'test', join(import.meta.dir, 'fixtures/worldfeed.ts')], {
            cwd: dir,
            env: { ...process.env, WORLD_FEED: 'true', WORLD_FEED_TOKEN: '', GE_DATABASE: join(dir, 'market.sqlite') }
        });
        if (result.exitCode !== 0) {
            throw new Error(result.stdout.toString() + result.stderr.toString());
        }
        expect(result.exitCode).toBe(0);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}, 15000);
