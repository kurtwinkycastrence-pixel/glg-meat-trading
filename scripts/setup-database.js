import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createPool } from "../server/database.js";
import { defaultSiteContent } from "../js/site-content.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export async function setupDatabase(pool) {
    const schema = await readFile(path.join(root, "database", "schema.sql"), "utf8");
    await pool.exec(schema);

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [catalogMigrations] = await connection.execute(
            "SELECT migration_key FROM app_migrations WHERE migration_key = ?",
            ["catalog-2026-11"]
        );
        if (catalogMigrations.length === 0) {
            for (const product of defaultSiteContent.products) {
                await connection.execute(
                    "INSERT INTO products (id, name, category, price, unit, image, description) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category, price = excluded.price, unit = excluded.unit, image = excluded.image, description = excluded.description",
                    [product.id, product.name, product.category, product.price, product.unit, product.image, product.desc]
                );
            }
            await connection.execute(
                "INSERT INTO app_migrations (migration_key) VALUES (?)",
                ["catalog-2026-11"]
            );
        } else {
            for (const product of defaultSiteContent.products) {
                await connection.execute(
                    "INSERT OR IGNORE INTO products (id, name, category, price, unit, image, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [product.id, product.name, product.category, product.price, product.unit, product.image, product.desc]
                );
            }
        }

        const [contactMigrations] = await connection.execute(
            "SELECT migration_key FROM app_migrations WHERE migration_key = ?",
            ["whatsapp-number-2026-11"]
        );
        if (contactMigrations.length === 0) {
            for (const key of ["phoneValue", "whatsAppNumber"]) {
                await connection.execute(
                    "INSERT INTO site_content (content_key, content_value) VALUES (?, ?) ON CONFLICT(content_key) DO UPDATE SET content_value = excluded.content_value",
                    [key, String(defaultSiteContent[key])]
                );
            }
            await connection.execute(
                "INSERT INTO app_migrations (migration_key) VALUES (?)",
                ["whatsapp-number-2026-11"]
            );
        }

        for (const [key, value] of Object.entries(defaultSiteContent)) {
            if (key === "products") continue;
            await connection.execute(
                "INSERT OR IGNORE INTO site_content (content_key, content_value) VALUES (?, ?)",
                [key, String(value)]
            );
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const pool = createPool();
    try {
        await setupDatabase(pool);
        console.log("SQLite tables and default storefront data are ready.");
    } finally {
        await pool.end();
    }
}
