import { Kysely, MysqlDialect, SqliteDialect } from 'kysely';
import type { Dialect, LogEvent } from 'kysely';
import { createPool } from 'mysql2';

import { DB } from '#/db/types.js';
import Environment from '#/util/Environment.js';

let dialect: Dialect;

if (Environment.db.backend === 'sqlite') {
    if (Environment.runtime.isBun) {
        const { BunSqliteDialect } = await import('./dialect/BunSqliteDialect.js');
        const { Database } = await import('bun:sqlite');

        dialect = new BunSqliteDialect({
            database: new Database('db.sqlite')
        });
    } else {
        const { default: Database } = await import('better-sqlite3');

        dialect = new SqliteDialect({
            database: new Database('db.sqlite')
        });
    }
} else {
    dialect = new MysqlDialect({
        pool: async () =>
            createPool({
                database: Environment.db.name,
                host: Environment.db.host,
                port: Environment.db.port,
                user: Environment.db.user,
                password: Environment.db.pass,
                timezone: 'Z'
            })
    });
}

function logVerbose(event: LogEvent) {
    if (event.level === 'query') {
        console.log(event.query.sql);
        console.log(event.query.parameters);
    }
}

export const db = new Kysely<DB>({
    dialect,
    log: Environment.db.verbose ? logVerbose : []
});

export function toDbDate(date: Date | string | number) {
    if (typeof date === 'string' || typeof date === 'number') {
        date = new Date(date);
    }

    return date.toISOString().slice(0, 19).replace('T', ' ');
}
