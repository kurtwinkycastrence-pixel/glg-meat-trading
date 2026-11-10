import "dotenv/config";
import { createApp } from "./app.js";
import { createPool } from "./database.js";
import { migrateWholesalePrices } from "./migrations.js";

const pool = createPool();
try {
    await pool.query("SELECT 1");
    await pool.exec("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'GCash', 'PayMaya'))");
    await pool.exec("ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(12, 2) CHECK (wholesale_price IS NULL OR wholesale_price >= 0)");
    const migrationConnection = await pool.getConnection();
    try {
        await migrationConnection.beginTransaction();
        await migrateWholesalePrices(migrationConnection);
        await migrationConnection.commit();
    } catch (error) {
        await migrationConnection.rollback();
        throw error;
    } finally {
        migrationConnection.release();
    }
} catch (error) {
    console.error("Could not connect to PostgreSQL.", error.message);
    process.exit(1);
}

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const server = createApp({ pool }).listen(port, host, () => {
    console.log(`GLG Meat Trading is listening at http://${host}:${port}`);
});

async function shutdown() {
    server.close(async () => {
        await pool.end();
        process.exit(0);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
