import { DB } from '#lostcity/db/types.js';
import { createPool } from 'mysql2';
import { Kysely, MysqlDialect } from 'kysely';

import Environment from '#lostcity/util/Environment.js';

const dialect = new MysqlDialect({
    pool: async () =>
        createPool({
            database: Environment.DB_NAME as string,
            host: Environment.DB_HOST as string,
            user: Environment.DB_USER as string,
            password: Environment.DB_PASS as string
        })
});

export const db = new Kysely<DB>({
    dialect
});
