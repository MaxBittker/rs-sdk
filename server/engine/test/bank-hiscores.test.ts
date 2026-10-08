import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseBankSnapshots, rankMatchingBanks } from '../src/web/pages/BankHiscores.js';

const item = (name: string, value: number, count = 100) => ({ name, value, count });
const row = (username: string, items: ReturnType<typeof item>[], value = 1000000) => ({ username, value, items: JSON.stringify(items) });

test('matches literal substrings ignoring case and sums full stack values once', () => {
    const banks = parseBankSnapshots([row('wealthy', [item('Lobster', 1000000), item('Shrimps', 20)]), row('shrimp-holder', [item('Raw shrimps', 400), item('Shrimps', 600), item('Lobster', 100)], 1100), row('unrelated', [item('Lobster', 5000000)])]);
    const matches = rankMatchingBanks(banks, '  ShRiMp  ');
    expect(matches.map(match => [match.username, match.value])).toEqual([
        ['shrimp-holder', 1000],
        ['wealthy', 20]
    ]);
    expect(JSON.parse(matches[0].items).map((entry: { name: string }) => entry.name)).toEqual(['Shrimps', 'Raw shrimps']);
    expect(rankMatchingBanks(banks, 'nonexistent')).toEqual([]);
    const literal = parseBankSnapshots([row('literal', [item('100%_rare [fish]', 7)]), row('ordinary', [item('Rare fish', 8)])]);
    expect(rankMatchingBanks(literal, '%_')[0]?.username).toBe('literal');
    expect(rankMatchingBanks(literal, '[fish]')[0]?.username).toBe('literal');
});

test('searches beyond the overall top 50 and sums every matching item before limiting results', () => {
    const banks = parseBankSnapshots([
        ...Array.from({ length: 60 }, (_, index) => row(`rich-${index}`, [item('Logs', 1000000)])),
        row(
            'small-bank',
            Array.from({ length: 8 }, (_, index) => item(`Shrimp ${index}`, 10)),
            80
        )
    ]);
    expect(rankMatchingBanks(banks, 'shrimp').map(match => [match.username, match.value])).toEqual([['small-bank', 80]]);
    const tied = parseBankSnapshots(Array.from({ length: 60 }, (_, index) => row(`user-${String(59 - index).padStart(2, '0')}`, [item('Shrimps', 10)])));
    const matches = rankMatchingBanks(tied, 'shrimp');
    expect(matches).toHaveLength(50);
    expect(matches[0].username).toBe('user-00');
    expect(matches[49].username).toBe('user-49');
});

test('skips damaged banks and invalid entries while retaining zero-value matching items', () => {
    const banks = parseBankSnapshots([
        { username: 'broken', value: 0, items: '{broken' },
        { username: 'not-array', value: 0, items: '{}' },
        { username: 'mixed', value: 0, items: JSON.stringify([null, 'shrimp', { name: 'Shrimp', value: 'bad', count: 1 }, item('Shrimp', 0, 1)]) }
    ]);
    expect(rankMatchingBanks(banks, 'shrimp').map(match => [match.username, match.value])).toEqual([['mixed', 0]]);
});

test('bank search HTTP page uses eligible banks, preserves profiles, and escapes searches', () => {
    // Isolate the real database module so the shared test process never opens a player's DB.
    const dir = mkdtempSync(join(tmpdir(), 'bank-hiscores-'));
    try {
        const result = Bun.spawnSync([process.execPath, join(import.meta.dir, 'fixtures/bank-hiscores.ts')], {
            cwd: dir,
            env: { ...process.env, DB_BACKEND: 'sqlite', HISCORES_HIDDEN_NAMES: 'private', HISCORES_CACHE_MS: '60000' },
            stdout: 'pipe',
            stderr: 'pipe'
        });
        expect(result.stderr.toString()).toBe('');
        expect(result.exitCode).toBe(0);
        expect(result.stdout.toString()).toContain('Bank hiscores HTTP checks passed');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
