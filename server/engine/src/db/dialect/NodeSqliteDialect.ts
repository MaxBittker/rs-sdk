import { type DatabaseIntrospector, type Dialect, type DialectAdapter, type Driver, type Kysely, type QueryCompiler, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely';

import type { NodeSqliteDialectConfig } from './NodeSqliteDialectConfig.js';
import { NodeSqliteDriver } from './NodeSqliteDriver.js';

export class NodeSqliteDialect implements Dialect {
    readonly #config: NodeSqliteDialectConfig;

    constructor(config: NodeSqliteDialectConfig) {
        this.#config = { ...config };
    }

    createDriver(): Driver {
        return new NodeSqliteDriver(this.#config);
    }

    createQueryCompiler(): QueryCompiler {
        return new SqliteQueryCompiler();
    }

    createAdapter(): DialectAdapter {
        return new SqliteAdapter();
    }

    createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
        return new SqliteIntrospector(db);
    }
}
