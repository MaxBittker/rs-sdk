import fs from 'fs';
import path from 'path';

import { Kysely, sql } from 'kysely';

import { db } from '#/db/query.js';
import { DB } from '#/db/types.js';
import Environment from '#/util/Environment.js';
import { printInfo } from '#/util/Logger.js';

// rs-sdk: the append-only log tables live outside db.sqlite, one SQLite file per UTC
// day (logs/logs-2026-11-15.sqlite). They grow by several GB a day; db.sqlite keeps
// only live game state, so it stays small enough for continuous Litestream backup.
// Each finished day is compressed, uploaded to R2 once, and deleted from the server
// after LOG_KEEP_DAYS (server/deploy/ovh/archive-logs.sh).
//
// The tables keep their db.sqlite schema (db.sqlite still carries them empty, for
// prisma). Ids stay unique across files: a new day starts its sqlite_sequence at the
// highest of the newest earlier file and db.sqlite, plus ID_GAP. The gap leaves room
// for inserts still landing in the old file at rollover: batches already in flight,
// and telemetry compaction, which rewrites raw rows within the file they're in. The
// new floor is written back to db.sqlite's sqlite_sequence, so it survives the old
// files being archived away. A row is filed by when the logger received it.
//
// Only the logger thread writes these files. With LOG_DB_DIR unset they sit in logs/
// next to the real db.sqlite (prod: /opt/server/data/logs). MySQL deployments keep
// everything in the main database.

export type LogDB = Pick<DB, 'session_log' | 'session_wealth' | 'player_telemetry' | 'player_telemetry_segment' | 'player_skills_log'>;

const SCHEMA = [
    `CREATE TABLE IF NOT EXISTS "session_log" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "session_uuid" TEXT NOT NULL,
        "timestamp" DATETIME NOT NULL,
        "coord" INTEGER NOT NULL,
        "event" TEXT NOT NULL,
        "event_type" INTEGER NOT NULL DEFAULT -1
    )`,
    `CREATE TABLE IF NOT EXISTS "session_wealth" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "session_uuid" TEXT NOT NULL,
        "timestamp" DATETIME NOT NULL,
        "coord" INTEGER NOT NULL,
        "event_type" INTEGER NOT NULL DEFAULT -1,
        "account_items" TEXT NOT NULL,
        "account_value" INTEGER NOT NULL,
        "recipient_session" TEXT,
        "recipient_items" TEXT,
        "recipient_value" INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS "player_telemetry" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "timestamp" DATETIME NOT NULL,
        "username" TEXT NOT NULL,
        "session_uuid" TEXT,
        "x" INTEGER NOT NULL,
        "z" INTEGER NOT NULL,
        "level" INTEGER NOT NULL,
        "ip" TEXT,
        "total_xp" INTEGER NOT NULL DEFAULT 0,
        "skills" TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS "player_telemetry_username_timestamp_idx" ON "player_telemetry"("username", "timestamp")',
    'CREATE INDEX IF NOT EXISTS "player_telemetry_timestamp_idx" ON "player_telemetry"("timestamp")',
    `CREATE TABLE IF NOT EXISTS "player_telemetry_segment" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "username" TEXT NOT NULL,
        "session_uuid" TEXT,
        "ip" TEXT,
        "start_time" DATETIME NOT NULL,
        "end_time" DATETIME NOT NULL,
        "sample_count" INTEGER NOT NULL,
        "data" BLOB NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS "player_telemetry_segment_username_start_time_idx" ON "player_telemetry_segment"("username", "start_time")',
    'CREATE INDEX IF NOT EXISTS "player_telemetry_segment_start_time_idx" ON "player_telemetry_segment"("start_time")',
    `CREATE TABLE IF NOT EXISTS "player_skills_log" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "timestamp" DATETIME NOT NULL,
        "username" TEXT NOT NULL,
        "total_xp" INTEGER NOT NULL,
        "skills" TEXT NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS "player_skills_log_username_timestamp_idx" ON "player_skills_log"("username", "timestamp")'
];

export const LOG_TABLES = ['session_log', 'session_wealth', 'player_telemetry', 'player_telemetry_segment', 'player_skills_log'] as const;

const ID_GAP = 1_000_000;
const DAY_MS = 86_400_000;
// telemetry traces read up to a week back
const KEEP_OPEN_DAYS = 9;

const PRAGMAS = 'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 10000;';

const split = Environment.db.backend === 'sqlite';

export function logDir(): string {
    if (process.env.LOG_DB_DIR) {
        return process.env.LOG_DB_DIR;
    }
    // next to the real db.sqlite: in the image db.sqlite is a symlink onto the volume
    let main = path.resolve('db.sqlite');
    try {
        main = fs.realpathSync(main);
    } catch {
        // no db.sqlite yet: logs/ beside where it will be
    }
    return path.join(path.dirname(main), 'logs');
}

/** UTC day key, e.g. 2026-11-15 */
export function dayOf(date: Date | number): string {
    return new Date(date).toISOString().slice(0, 10);
}

export function logFile(day: string): string {
    return path.join(logDir(), `logs-${day}.sqlite`);
}

const FILE_RE = /^logs-(\d{4}-\d{2}-\d{2})\.sqlite$/;

/** Days with a log file on disk, oldest first. */
export function localLogDays(): string[] {
    if (!fs.existsSync(logDir())) {
        return [];
    }
    return fs
        .readdirSync(logDir())
        .map(f => FILE_RE.exec(f)?.[1])
        .filter((d): d is string => !!d)
        .sort();
}

type SeqRow = { name: string; seq: number };

async function openSqlite(file: string): Promise<{ kysely: Kysely<LogDB>; run: (sql: string) => void; all: (sql: string) => SeqRow[] }> {
    if (typeof Bun !== 'undefined') {
        const { BunSqliteDialect } = await import('#/db/dialect/BunSqliteDialect.js');
        const { Database } = await import('bun:sqlite');
        const database = new Database(file, { create: true });
        database.exec(PRAGMAS);
        return {
            kysely: new Kysely<LogDB>({ dialect: new BunSqliteDialect({ database }) }),
            run: s => database.exec(s),
            all: s => database.query(s).all() as SeqRow[]
        };
    }
    const { NodeSqliteDialect } = await import('#/db/dialect/NodeSqliteDialect.js');
    const { DatabaseSync } = await import('node:sqlite');
    const database = new DatabaseSync(file);
    database.exec(PRAGMAS);
    return {
        kysely: new Kysely<LogDB>({ dialect: new NodeSqliteDialect({ database }) }),
        run: s => database.exec(s),
        all: s => database.prepare(s).all() as unknown as SeqRow[]
    };
}

function isLogTable(name: string): boolean {
    return (LOG_TABLES as readonly string[]).includes(name);
}

// first id - 1 for each table in a new day's file
async function seedSequences(day: string): Promise<Map<string, number>> {
    const seeds = new Map<string, number>();
    const take = (rows: SeqRow[]) => {
        for (const { name, seq } of rows) {
            if (isLogTable(name) && Number.isSafeInteger(Number(seq))) {
                seeds.set(name, Math.max(seeds.get(name) ?? 0, Number(seq)));
            }
        }
    };
    take((await sql<SeqRow>`SELECT name, seq FROM sqlite_sequence`.execute(db)).rows);
    const prev = localLogDays().filter(d => d < day).pop();
    if (prev) {
        const handle = await openSqlite(logFile(prev));
        try {
            take(handle.all('SELECT name, seq FROM sqlite_sequence'));
        } finally {
            await handle.kysely.destroy();
        }
    }
    for (const [name, seq] of seeds) {
        if (seq > 0) {
            seeds.set(name, seq + ID_GAP);
        }
    }
    return seeds;
}

const open = new Map<string, Promise<Kysely<LogDB>>>();

async function openDay(day: string): Promise<Kysely<LogDB>> {
    const file = logFile(day);
    const exists = fs.existsSync(file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const seeds = exists ? new Map<string, number>() : await seedSequences(day);
    const handle = await openSqlite(file);
    handle.run(`BEGIN; ${SCHEMA.join(';\n')};`);
    for (const [name, seq] of seeds) {
        handle.run(`INSERT INTO sqlite_sequence (name, seq) VALUES ('${name}', ${seq})`);
    }
    handle.run('COMMIT;');
    if (!exists) {
        // db.sqlite's (empty) log tables carry the id floor from here on
        for (const [name, seq] of seeds) {
            const updated = await sql`UPDATE sqlite_sequence SET seq = ${seq} WHERE name = ${name} AND seq < ${seq}`.execute(db);
            if (!Number(updated.numAffectedRows)) {
                await sql`INSERT INTO sqlite_sequence (name, seq) SELECT ${name}, ${seq} WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = ${name})`.execute(db);
            }
        }
        printInfo(`Log store: created ${file}`);
    }
    return handle.kysely;
}

function getDay(day: string, create: boolean): Promise<Kysely<LogDB> | null> {
    const cached = open.get(day);
    if (cached) {
        return cached;
    }
    if (!create && !fs.existsSync(logFile(day))) {
        return Promise.resolve(null);
    }
    const opening = openDay(day);
    open.set(day, opening);
    opening.catch(() => open.delete(day));
    return opening;
}

let currentDay = '';

/** Where new log rows go: today's (UTC) file. */
export async function currentLogDb(): Promise<Kysely<LogDB>> {
    if (!split) {
        return db as unknown as Kysely<LogDB>;
    }
    const day = dayOf(Date.now());
    if (day !== currentDay) {
        currentDay = day;
        // close files that fell out of every window we read
        const oldest = dayOf(Date.now() - KEEP_OPEN_DAYS * DAY_MS);
        for (const [d, k] of open) {
            if (d < oldest) {
                open.delete(d);
                k.then(x => x.destroy()).catch(() => {});
            }
        }
    }
    return (await getDay(day, true))!;
}

/** Log files on disk covering [since, now], oldest first; today's is created if missing. */
export async function logDbsSince(since: Date | number): Promise<Kysely<LogDB>[]> {
    if (!split) {
        return [db as unknown as Kysely<LogDB>];
    }
    const today = dayOf(Date.now());
    const first = dayOf(since);
    const out: Kysely<LogDB>[] = [];
    for (const day of localLogDays().filter(d => d >= first && d < today)) {
        const k = await getDay(day, false);
        if (k) {
            out.push(k);
        }
    }
    out.push(await currentLogDb());
    return out;
}

/** Today's and yesterday's files: raw telemetry waiting for compaction can sit in either. */
export function recentLogDbs(): Promise<Kysely<LogDB>[]> {
    return logDbsSince(Date.now() - DAY_MS);
}
