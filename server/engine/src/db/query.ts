import { Kysely, MysqlDialect } from 'kysely';
import type { Dialect, LogEvent } from 'kysely';
import { createPool } from 'mysql2';

import { DB } from '#/db/types.js';
import Environment from '#/util/Environment.js';

let dialect: Dialect;

if (Environment.db.backend === 'sqlite') {
    // rs-sdk: Bun has no node:sqlite — pick the dialect for the active runtime.
    if (typeof Bun !== 'undefined') {
        const { BunSqliteDialect } = await import('#/db/dialect/BunSqliteDialect.js');
        const { Database } = await import('bun:sqlite');

        dialect = new BunSqliteDialect({
            database: new Database('db.sqlite')
        });
    } else {
        const { NodeSqliteDialect } = await import('#/db/dialect/NodeSqliteDialect.js');
        const { DatabaseSync } = await import('node:sqlite');

        dialect = new NodeSqliteDialect({
            database: new DatabaseSync('db.sqlite')
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
