import "dotenv/config";
import { createApp } from "./app.js";
import { createPool } from "./database.js";

const pool = createPool();
try {
    await pool.query("SELECT 1");
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
