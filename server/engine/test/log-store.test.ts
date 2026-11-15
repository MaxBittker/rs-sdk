import { afterAll, expect, setSystemTime, test } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { sql } from 'kysely';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-store-'));
process.env.LOG_DB_DIR = path.join(dir, 'logs');
// query.ts opens ./db.sqlite: give it a scratch one, not the dev database
const cwd = process.cwd();
process.chdir(dir);

const { db } = await import('#/db/query.js');
const { currentLogDb, logDbsSince, logFile, recentLogDbs } = await import('#/server/logger/LogStore.js');
await sql`CREATE TABLE session_wealth (id INTEGER PRIMARY KEY AUTOINCREMENT, x)`.execute(db);
await sql`INSERT INTO session_wealth (id, x) VALUES (41, 0)`.execute(db);

afterAll(() => {
    setSystemTime();
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
});

async function seq(k: { selectFrom: unknown }, table: string): Promise<number> {
    const r = await sql<{ seq: number }>`SELECT seq FROM sqlite_sequence WHERE name = ${table}`.execute(k as typeof db);
    return Number(r.rows[0]?.seq ?? 0);
}

function wealthRow() {
    return { session_uuid: 's', timestamp: '2026-10-31 23:59:00', coord: 0, event_type: 1, account_items: '[]', account_value: 0 };
}

test('log rows go to a per-day file whose ids continue past the previous one', async () => {
    const mainSeq = await seq(db, 'session_wealth');

    setSystemTime(new Date('2026-10-31T23:59:00Z'));
    const d1 = await currentLogDb();
    expect(fs.existsSync(logFile('2026-10-31'))).toBe(true);
    const a = await d1.insertInto('session_wealth').values(wealthRow()).executeTakeFirstOrThrow();
    expect(mainSeq).toBe(41);
    expect(Number(a.insertId)).toBe(41 + 1_000_000 + 1);

    // a day with no file (server down) is skipped: seeds come from the newest earlier file
    setSystemTime(new Date('2026-11-02T00:01:00Z'));
    const d3 = await currentLogDb();
    expect(d3).not.toBe(d1);
    expect(fs.existsSync(logFile('2026-11-01'))).toBe(false);
    const b = await d3.insertInto('session_wealth').values(wealthRow()).executeTakeFirstOrThrow();
    expect(Number(b.insertId)).toBe(Number(a.insertId) + 1_000_000 + 1);
    // ...and the floor is recorded in db.sqlite, so it survives the files being archived
    expect(await seq(db, 'session_wealth')).toBe(Number(b.insertId) - 1);

    // same day -> same connection
    expect(await currentLogDb()).toBe(d3);
    // only files that exist are opened; none are created for past days
    expect(await recentLogDbs()).toEqual([d3]);
    expect(await logDbsSince(new Date('2026-10-15T00:00:00Z'))).toEqual([d1, d3]);
    expect(fs.existsSync(logFile('2026-11-01'))).toBe(false);
    const idx = await sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name`.execute(d3);
    expect(idx.rows.map(r => r.name)).toContain('player_telemetry_segment_start_time_idx');
});
