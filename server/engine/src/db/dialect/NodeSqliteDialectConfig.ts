import type { DatabaseConnection } from 'kysely';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Config for the SQLite dialect.
 */
export interface NodeSqliteDialectConfig {
    /**
     * A node:sqlite DatabaseSync instance.
     */
    database: DatabaseSync;

    /**
     * Called once when the first query is executed.
     */
    onCreateConnection?: (connection: DatabaseConnection) => Promise<void>;
}
