import { setTimeout as sleep } from 'node:timers/promises';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

import { CompiledQuery, type DatabaseConnection, type Driver, type QueryResult } from 'kysely';

import type { NodeSqliteDialectConfig } from './NodeSqliteDialectConfig.js';

type NodeSqliteError = Error & {
    code?: string;
    errcode?: number;
    errstr?: string;
};

function isSqliteBusyError(err: unknown): err is NodeSqliteError {
    return typeof err === 'object' && err !== null && (err as NodeSqliteError).code === 'ERR_SQLITE_ERROR' && (err as NodeSqliteError).errcode === 5;
}

function isSqliteError(err: unknown): err is NodeSqliteError {
    return typeof err === 'object' && err !== null && (err as NodeSqliteError).code === 'ERR_SQLITE_ERROR';
}

function bindParameters(parameters: readonly unknown[]): SQLInputValue[] {
    return parameters as SQLInputValue[];
}

export class NodeSqliteDriver implements Driver {
    readonly #config: NodeSqliteDialectConfig;
    readonly #connectionMutex = new ConnectionMutex();

    #db?: DatabaseSync;
    #connection?: DatabaseConnection;

    constructor(config: NodeSqliteDialectConfig) {
        this.#config = { ...config };
    }

    async init(): Promise<void> {
        this.#db = this.#config.database;

        this.#connection = new NodeSqliteConnection(this.#db);

        if (this.#config.onCreateConnection) {
            await this.#config.onCreateConnection(this.#connection);
        }
    }

    async acquireConnection(): Promise<DatabaseConnection> {
        // SQLite only has one single connection. We use a mutex here to wait
        // until the single connection has been released.
        await this.#connectionMutex.lock();
        return this.#connection!;
    }

    async beginTransaction(connection: DatabaseConnection): Promise<void> {
        await connection.executeQuery(CompiledQuery.raw('begin'));
    }

    async commitTransaction(connection: DatabaseConnection): Promise<void> {
        await connection.executeQuery(CompiledQuery.raw('commit'));
    }

    async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
        await connection.executeQuery(CompiledQuery.raw('rollback'));
    }

    async releaseConnection(): Promise<void> {
        this.#connectionMutex.unlock();
    }

    async destroy(): Promise<void> {
        this.#db?.close();
    }
}

class NodeSqliteConnection implements DatabaseConnection {
    readonly #db: DatabaseSync;

    constructor(db: DatabaseSync) {
        this.#db = db;
    }

    async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
        for (let retry = 0; retry < 3; retry++) {
            try {
                const { sql, parameters } = compiledQuery;
                const stmt = this.#db.prepare(sql);
                const bind = bindParameters(parameters);

                if (stmt.columns().length > 0) {
                    return {
                        rows: stmt.all(...bind) as O[]
                    };
                }

                const results = stmt.run(...bind);

                return {
                    insertId: BigInt(results.lastInsertRowid),
                    numAffectedRows: BigInt(results.changes),
                    rows: []
                };
            } catch (err) {
                if (isSqliteBusyError(err)) {
                    await sleep(100);
                    continue;
                } else if (isSqliteError(err)) {
                    console.error(err.message);
                    break;
                } else {
                    console.error(err);
                    break;
                }
            }
        }

        console.warn('executeQuery failed');
        return {
            insertId: 0n,
            numAffectedRows: 0n,
            rows: []
        };
    }

    async *streamQuery<R>(compiledQuery: CompiledQuery): AsyncIterableIterator<QueryResult<R>> {
        const { sql, parameters } = compiledQuery;
        const stmt = this.#db.prepare(sql);
        const bind = bindParameters(parameters);

        for (const row of stmt.iterate(...bind)) {
            yield { rows: [row as R] };
        }
    }
}

class ConnectionMutex {
    #promise?: Promise<void>;
    #resolve?: () => void;

    async lock(): Promise<void> {
        while (this.#promise) {
            await this.#promise;
        }

        this.#promise = new Promise(resolve => {
            this.#resolve = resolve;
        });
    }

    unlock(): void {
        const resolve = this.#resolve;

        this.#promise = undefined;
        this.#resolve = undefined;

        resolve?.();
    }
}
