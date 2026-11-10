export async function migrateWholesalePrices(connection) {
    const [migrations] = await connection.execute(
        "SELECT migration_key FROM app_migrations WHERE migration_key = ?",
        ["hungarian-sausage-prices-2026-11"]
    );
    if (migrations.length > 0) return;

    await connection.execute(
        "UPDATE products SET price = ?, wholesale_price = ?, unit = ?, description = ? WHERE name IN (?, ?)",
        [350, 300, "1 kg", "Retail ₱350 per kg; wholesale ₱300 per kg from 10 kg.", "Hungarian Cheese", "Hungarian Spicy"]
    );
    await connection.execute(
        "INSERT INTO app_migrations (migration_key) VALUES (?)",
        ["hungarian-sausage-prices-2026-11"]
    );
}
