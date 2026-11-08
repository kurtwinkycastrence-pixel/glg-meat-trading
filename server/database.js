import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function normalizeError(error) {
    if (error.code === "23505") error.code = "ER_DUP_ENTRY";
    return error;
}

function normalizeQuery(sql) {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
}

function normalizeResult(result) {
    if (result.command === "SELECT") return [result.rows, []];
    return [{
        affectedRows: result.affectedRows ?? result.rowCount ?? 0,
        insertId: Number(result.rows?.[0]?.id ?? 0)
    }, []];
}

export function createPool(env = process.env) {
    const dataPath = path.resolve(root, env.DATABASE_PATH || "database/postgres-data");
    mkdirSync(dataPath, { recursive: true });

    const database = new PGlite(dataPath);
    const ready = database.waitReady;

    let lock = Promise.resolve();
    let closed = false;
    const acquire = async () => {
        let unlock;
        const previous = lock;
        lock = new Promise(resolve => { unlock = resolve; });
        await previous;
        try {
            await ready;
            if (closed) throw new Error("The PostgreSQL database is closed.");
            return unlock;
        } catch (error) {
            unlock();
            throw error;
        }
    };

    async function run(sql, values = []) {
        try {
            return await database.query(normalizeQuery(sql), values);
        } catch (error) {
            throw normalizeError(error);
        }
    }

    const pool = {
        async query(sql, values = []) {
            const unlock = await acquire();
            try {
                return await run(sql, values);
            } finally {
                unlock();
            }
        },
        async execute(sql, values = []) {
            const unlock = await acquire();
            try {
                return normalizeResult(await run(sql, values));
            } finally {
                unlock();
            }
        },
        async exec(sql) {
            const unlock = await acquire();
            try {
                await database.exec(sql);
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
                        await database.exec("BEGIN");
                        transactionOpen = true;
                    } catch (error) {
                        unlock();
                        unlock = undefined;
                        throw normalizeError(error);
                    }
                },
                async execute(sql, values = []) {
                    if (!transactionOpen) return pool.execute(sql, values);
                    return normalizeResult(await run(sql, values));
                },
                async commit() {
                    if (!transactionOpen) return;
                    try {
                        await database.exec("COMMIT");
                    } finally {
                        transactionOpen = false;
                        unlock();
                        unlock = undefined;
                    }
                },
                async rollback() {
                    if (!transactionOpen) return;
                    try {
                        await database.exec("ROLLBACK");
                    } finally {
                        transactionOpen = false;
                        unlock();
                        unlock = undefined;
                    }
                },
                release() {
                    if (transactionOpen) {
                        void this.rollback();
                    }
                }
            };
        },
        async end() {
            const unlock = await acquire();
            try {
                await database.close();
                closed = true;
            } finally {
                unlock();
            }
        }
    };
    return pool;
}
