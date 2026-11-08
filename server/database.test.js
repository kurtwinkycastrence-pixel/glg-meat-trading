import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { createPool } from "./database.js";
import { setupDatabase } from "../scripts/setup-database.js";
import { defaultSiteContent } from "../js/site-content.js";

test("SQLite setup seeds the store and supports separate customer and admin logins", async t => {
    const pool = createPool({ DATABASE_PATH: ":memory:" });
    let server;
    t.after(async () => {
        if (server?.listening) {
            await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        }
        await pool.end();
    });

    await setupDatabase(pool);
    await setupDatabase(pool);
    const [products] = await pool.execute("SELECT id, name FROM products ORDER BY id");
    assert.equal(products.length, defaultSiteContent.products.length);

    await pool.execute(
        "INSERT INTO admins (email, password_hash) VALUES (?, ?)",
        ["admin@example.com", "hash:admin-password"]
    );

    server = createServer(createApp({
        pool,
        env: { NODE_ENV: "test", SESSION_HOURS: "1" },
        passwordHash: async password => `hash:${password}`,
        passwordCompare: async (password, hash) => hash === `hash:${password}`
    }));
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const jsonHeaders = {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Origin: baseUrl
    };

    const registration = await fetch(`${baseUrl}/api/customer/register`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
            fullName: "SQLite Customer",
            phone: "09123456789",
            email: "customer@example.com",
            password: "customer-password"
        })
    });
    assert.equal(registration.status, 201);
    const customerCookie = registration.headers.get("set-cookie").split(";")[0];

    const duplicateRegistration = await fetch(`${baseUrl}/api/customer/register`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
            fullName: "SQLite Customer",
            phone: "09123456789",
            email: "customer@example.com",
            password: "customer-password"
        })
    });
    assert.equal(duplicateRegistration.status, 409);

    const customerSession = await fetch(`${baseUrl}/api/customer/session`, {
        headers: { Cookie: customerCookie }
    });
    assert.equal(customerSession.status, 200);

    const orderResponse = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: { ...jsonHeaders, Cookie: customerCookie },
        body: JSON.stringify({
            customerName: "Ignored Name",
            customerPhone: "000",
            orderType: "Retail",
            items: [{ id: 1, quantity: 2 }]
        })
    });
    assert.equal(orderResponse.status, 201);
    const orderHistory = await fetch(`${baseUrl}/api/customer/orders`, {
        headers: { Cookie: customerCookie }
    });
    const customerOrders = await orderHistory.json();
    assert.equal(orderHistory.status, 200);
    assert.equal(customerOrders.length, 1);
    assert.equal(customerOrders[0].customerName, "SQLite Customer");
    assert.equal(customerOrders[0].items[0].qty, 2);

    const adminLogin = await fetch(`${baseUrl}/api/admin/login`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ email: "admin@example.com", password: "admin-password" })
    });
    assert.equal(adminLogin.status, 200);
    const adminCookie = adminLogin.headers.get("set-cookie").split(";")[0];

    assert.equal((await fetch(`${baseUrl}/api/admin/session`, {
        headers: { Cookie: adminCookie }
    })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/admin/session`, {
        headers: { Cookie: customerCookie }
    })).status, 401);
});
