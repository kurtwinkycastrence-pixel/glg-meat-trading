import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function normalizeError(error) {
    if (error.code === "ERR_SQLITE_ERROR"
        && /UNIQUE constraint failed|PRIMARY KEY constraint failed/i.test(error.message)) {
        error.code = "ER_DUP_ENTRY";
    }
    return error;
}

export function createPool(env = process.env) {
    const databasePath = env.DATABASE_PATH || path.join(root, "database", "glg-meat-trading.sqlite");
    const resolvedPath = databasePath === ":memory:" ? databasePath : path.resolve(root, databasePath);
    if (resolvedPath !== ":memory:") mkdirSync(path.dirname(resolvedPath), { recursive: true });

    const database = new DatabaseSync(resolvedPath);
    database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

    let lock = Promise.resolve();
    let closed = false;
    const acquire = async () => {
        let unlock;
        const previous = lock;
        lock = new Promise(resolve => { unlock = resolve; });
        await previous;
        return unlock;
    };

    function run(sql, values = []) {
        try {
            const statement = database.prepare(sql);
            if (statement.columns().length) {
                return [statement.all(...values), []];
            }
            const result = statement.run(...values);
            return [{
                affectedRows: Number(result.changes),
                insertId: Number(result.lastInsertRowid)
            }, []];
        } catch (error) {
            throw normalizeError(error);
        }
    }

    async function execute(sql, values = []) {
        const unlock = await acquire();
        try {
            if (closed) throw new Error("The SQLite database is closed.");
            return run(sql, values);
        } finally {
            unlock();
        }
    }

    return {
        execute,
        query: execute,
        async exec(sql) {
            const unlock = await acquire();
            try {
                if (closed) throw new Error("The SQLite database is closed.");
                database.exec(sql);
            } catch (error) {
                throw normalizeError(error);
            } finally {
                unlock();
            }
        },
        async getConnection() {
            let unlock;
            let transactionOpen = false;
            return {
                async beginTransaction() {
                    if (transactionOpen) throw new Error("A transaction is already active.");
                    unlock = await acquire();
                    try {
                        if (closed) throw new Error("The SQLite database is closed.");
                        database.exec("BEGIN");
                        transactionOpen = true;
                    } catch (error) {
                        unlock();
                        unlock = undefined;
                        throw normalizeError(error);
                    }
                },
                async execute(sql, values = []) {
                    if (!transactionOpen) return execute(sql, values);
                    if (closed) throw new Error("The SQLite database is closed.");
                    return run(sql, values);
                },
                async commit() {
                    if (!transactionOpen) return;
                    try {
                        database.exec("COMMIT");
                    } finally {
                        transactionOpen = false;
                        unlock();
                        unlock = undefined;
                    }
                },
                async rollback() {
                    if (!transactionOpen) return;
                    try {
                        database.exec("ROLLBACK");
                    } finally {
                        transactionOpen = false;
                        unlock();
                        unlock = undefined;
                    }
                },
                release() {}
            };
        },
        async end() {
            const unlock = await acquire();
            try {
                if (!closed) {
                    database.close();
                    closed = true;
                }
            } finally {
                unlock();
            }
        }
    };
}
