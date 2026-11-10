import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { defaultSiteContent } from "../js/site-content.js";

const orders = [];
const sessionHashes = new Set();
const customerSessionHashes = new Map();
const customers = [];
const stockQuantities = new Map(defaultSiteContent.products.map(product => [product.id, null]));
let nextOrderId = 1;
let nextCustomerId = 1;
const pool = {
    async query() {
        return [[{ ready: 1 }]];
    },
    async execute(sql, values = []) {
        if (sql.includes("FROM site_content")) return [[], []];
        if (sql.includes("SELECT id, name, category, price, wholesale_price, unit, image, description, stock_quantity FROM products")) {
            return [defaultSiteContent.products.map(product => ({
                id: product.id,
                name: product.name,
                category: product.category,
                price: product.price,
                wholesale_price: product.wholesalePrice ?? null,
                unit: product.unit,
                image: product.image,
                description: product.desc,
                stock_quantity: stockQuantities.get(product.id)
            })), []];
        }
        if (sql.includes("SELECT id, name, unit, stock_quantity FROM products")) {
            return [defaultSiteContent.products.map(product => ({
                id: product.id,
                name: product.name,
                unit: product.unit,
                stock_quantity: stockQuantities.get(product.id)
            })), []];
        }
        if (sql.includes("UPDATE products SET stock_quantity")) {
            const [quantity, id] = values;
            const currentQuantity = stockQuantities.get(id);
            if (currentQuantity === undefined) return [{ affectedRows: 0 }, []];
            stockQuantities.set(id, quantity);
            return [{ affectedRows: currentQuantity === quantity ? 0 : 1 }, []];
        }
        if (sql.includes("SELECT id FROM products WHERE id = ?")) {
            return [stockQuantities.has(values[0]) ? [{ id: values[0] }] : [], []];
        }
        if (sql.includes("SELECT id, name, price, wholesale_price FROM products")) {
            return [defaultSiteContent.products
                .filter(product => values.includes(product.id))
                .map(product => ({
                    id: product.id,
                    name: product.name,
                    price: product.id === 1 ? 950 : product.price,
                    wholesale_price: product.wholesalePrice ?? null
                })), []];
        }
        if (sql.includes("SELECT id, email, password_hash FROM admins")) {
            return [[{ id: 1, email: "admin@example.com", password_hash: "test-hash" }], []];
        }
        if (sql.includes("INSERT INTO customers")) {
            const [fullName, phone, email, passwordHash] = values;
            if (customers.some(customer => customer.email === email)) {
                const error = new Error("Duplicate customer email");
                error.code = "ER_DUP_ENTRY";
                throw error;
            }
            const customer = { id: nextCustomerId++, full_name: fullName, phone, email, password_hash: passwordHash };
            customers.push(customer);
            return [{ insertId: customer.id, affectedRows: 1 }, []];
        }
        if (sql.includes("SELECT id, full_name, phone, email, password_hash FROM customers")) {
            return [customers.filter(customer => customer.email === values[0]), []];
        }
        if (sql.includes("INSERT INTO customer_sessions")) {
            customerSessionHashes.set(values[0], values[1]);
            return [{ affectedRows: 1 }, []];
        }
        if (sql.includes("FROM customer_sessions JOIN customers")) {
            const customer = customers.find(item => item.id === customerSessionHashes.get(values[0]));
            return [customer ? [{
                id: customer.id,
                full_name: customer.full_name,
                phone: customer.phone,
                email: customer.email
            }] : [], []];
        }
        if (sql.includes("DELETE FROM customer_sessions")) {
            customerSessionHashes.delete(values[0]);
            return [{ affectedRows: 1 }, []];
        }
        if (sql.includes("WHERE orders.customer_id = ?")) {
            const customerOrders = orders.filter(order => order.customerId === values[0]);
            return [customerOrders.map(order => ({
                id: order.id,
                customer_name: order.customerName,
                customer_phone: order.customerPhone,
                order_type: order.orderType,
                payment_method: order.paymentMethod,
                total_amount: order.totalAmount,
                status: order.status,
                created_at: new Date(),
                product_name: null,
                quantity: null,
                unit_price: null
            })), []];
        }
        if (sql.includes("INSERT INTO admin_sessions")) {
            sessionHashes.add(values[0]);
            return [{ affectedRows: 1 }, []];
        }
        if (sql.includes("FROM admin_sessions JOIN admins")) {
            return [sessionHashes.has(values[0]) ? [{ id: 1, email: "admin@example.com" }] : [], []];
        }
        if (sql.includes("DELETE FROM admin_sessions")) {
            sessionHashes.delete(values[0]);
            return [{ affectedRows: 1 }, []];
        }
        if (sql.includes("FROM orders LEFT JOIN order_items")) return [[], []];
        throw new Error(`Unexpected SQL in test: ${sql}`);
    },
    async getConnection() {
        return {
            async beginTransaction() {},
            async commit() {},
            async rollback() {},
            release() {},
            async execute(sql, values = []) {
                if (sql.startsWith("INSERT INTO orders")) {
                    const id = nextOrderId++;
                    orders.push({
                        id,
                        customerId: values[0],
                        customerName: values[1],
                        customerPhone: values[2],
                        orderType: values[3],
                        paymentMethod: values[4],
                        totalAmount: values[5],
                        status: values[6],
                        items: []
                    });
                    return [{ insertId: id }, []];
                }
                if (sql.startsWith("INSERT INTO order_items")) {
                    const order = orders.find(item => item.id === values[0]);
                    order.items.push(values);
                    return [{ insertId: 1 }, []];
                }
                throw new Error(`Unexpected transaction SQL in test: ${sql}`);
            }
        };
    }
};

const server = createServer(createApp({
    pool,
    env: { NODE_ENV: "test", SESSION_HOURS: "1" },
    passwordHash: async () => "customer-hash",
    passwordCompare: async (password, hash) =>
        (password === "correct-password" && hash === "test-hash")
        || (password === "customer-password" && hash === "customer-hash")
}));
let baseUrl;

before(async () => {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test("serves the seeded storefront through the API", async () => {
    const response = await fetch(`${baseUrl}/api/storefront`);
    const content = await response.json();
    assert.equal(response.status, 200);
    assert.equal(content.products.length, defaultSiteContent.products.length);
    assert.equal(content.brandName, defaultSiteContent.brandName);
    assert.equal(content.products[0].stockQuantity, null);
});

test("serves the separate customer account page", async () => {
    const response = await fetch(`${baseUrl}/customer.html`);
    const page = await response.text();
    assert.equal(response.status, 200);
    assert.match(page, /customer-login-form/);
    assert.match(page, /customer-register-form/);
    assert.match(page, /My Order History/);
});

test("rejects malformed order data and calculates order totals from stored prices", async () => {
    const invalid = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            customerName: "Customer",
            customerPhone: "09123456789",
            orderType: "Retail",
            items: [{ id: 1, quantity: 0 }]
        })
    });
    assert.equal(invalid.status, 400);

    const response = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            customerName: "Customer",
            customerPhone: "09123456789",
            orderType: "Retail",
            paymentMethod: "GCash",
            totalAmount: 0,
            items: [{ id: 1, quantity: 2, price: 0 }]
        })
    });
    const result = await response.json();
    assert.equal(response.status, 201);
    assert.equal(orders.at(-1).totalAmount, 1900);
    assert.equal(orders.at(-1).customerId, null);
    assert.equal(orders.at(-1).paymentMethod, "GCash");
    assert.equal(result.id, orders.at(-1).id);
});

test("applies retail and wholesale prices to Hungarian sausages", async () => {
    for (const [orderType, quantity, expectedTotal] of [
        ["Retail", 9, 3150],
        ["Retail", 10, 3000],
        ["Wholesale", 1, 300],
        ["Bulk Ton Order", 10, 3000]
    ]) {
        const response = await fetch(`${baseUrl}/api/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                customerName: "Customer",
                customerPhone: "09123456789",
                orderType,
                items: [{ id: 3, quantity }]
            })
        });
        assert.equal(response.status, 201);
        assert.equal(orders.at(-1).totalAmount, expectedTotal);
    }

    const splitProducts = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            customerName: "Customer",
            customerPhone: "09123456789",
            orderType: "Retail",
            items: [{ id: 3, quantity: 5 }, { id: 4, quantity: 5 }]
        })
    });
    assert.equal(splitProducts.status, 201);
    assert.equal(orders.at(-1).totalAmount, 3500);
});

test("keeps customer accounts separate and links signed-in orders to customer history", async () => {
    const originHeaders = {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Origin: baseUrl
    };
    const registration = await fetch(`${baseUrl}/api/customer/register`, {
        method: "POST",
        headers: originHeaders,
        body: JSON.stringify({
            fullName: "Customer One",
            phone: "09123456789",
            email: "customer@example.com",
            password: "a-secure-password"
        })
    });
    assert.equal(registration.status, 201);
    let customerCookie = registration.headers.get("set-cookie").split(";")[0];
    assert.match(customerCookie, /^glg_customer_session=/);
    const sessionHash = createHash("sha256").update(customerCookie.split("=")[1]).digest("hex");
    assert.ok(customerSessionHashes.has(sessionHash));

    const customerSession = await fetch(`${baseUrl}/api/customer/session`, {
        headers: { Cookie: customerCookie }
    });
    assert.equal(customerSession.status, 200);
    assert.equal((await customerSession.json()).email, "customer@example.com");
    assert.equal((await fetch(`${baseUrl}/api/admin/session`, {
        headers: { Cookie: customerCookie }
    })).status, 401);

    const orderResponse = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: { ...originHeaders, Cookie: customerCookie },
        body: JSON.stringify({
            customerName: "Changed Name",
            customerPhone: "000",
            orderType: "Retail",
            items: [{ id: 1, quantity: 1 }]
        })
    });
    assert.equal(orderResponse.status, 201);
    assert.equal(orders.at(-1).customerId, 1);
    assert.equal(orders.at(-1).customerName, "Customer One");
    assert.equal(orders.at(-1).customerPhone, "09123456789");

    const history = await fetch(`${baseUrl}/api/customer/orders`, {
        headers: { Cookie: customerCookie }
    });
    assert.equal(history.status, 200);
    const customerOrders = await history.json();
    assert.equal(customerOrders.length, 1);
    assert.equal(customerOrders[0].customerName, "Customer One");

    const customerLogout = await fetch(`${baseUrl}/api/customer/logout`, {
        method: "POST",
        headers: { ...originHeaders, Cookie: customerCookie },
        body: "{}"
    });
    assert.equal(customerLogout.status, 200);
    const customerLogin = await fetch(`${baseUrl}/api/customer/login`, {
        method: "POST",
        headers: originHeaders,
        body: JSON.stringify({ email: "customer@example.com", password: "customer-password" })
    });
    assert.equal(customerLogin.status, 200);
    customerCookie = customerLogin.headers.get("set-cookie").split(";")[0];
    assert.match(customerCookie, /^glg_customer_session=/);

    const adminLogin = await fetch(`${baseUrl}/api/admin/login`, {
        method: "POST",
        headers: originHeaders,
        body: JSON.stringify({ email: "admin@example.com", password: "correct-password" })
    });
    assert.equal(adminLogin.status, 200);
    const adminCookie = adminLogin.headers.get("set-cookie").split(";")[0];
    assert.match(adminCookie, /^glg_admin_session=/);
    assert.equal((await fetch(`${baseUrl}/api/customer/session`, {
        headers: { Cookie: adminCookie }
    })).status, 401);
});

test("requires a same-origin authenticated session for admin APIs", async () => {
    const blocked = await fetch(`${baseUrl}/api/admin/orders`);
    assert.equal(blocked.status, 401);

    const originHeaders = {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Origin: baseUrl
    };
    const login = await fetch(`${baseUrl}/api/admin/login`, {
        method: "POST",
        headers: originHeaders,
        body: JSON.stringify({ email: "admin@example.com", password: "correct-password" })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const sessionHash = createHash("sha256").update(cookie.split("=")[1]).digest("hex");
    assert.ok(sessionHashes.has(sessionHash));

    const session = await fetch(`${baseUrl}/api/admin/session`, { headers: { Cookie: cookie } });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).email, "admin@example.com");

    const inventory = await fetch(`${baseUrl}/api/admin/inventory`, { headers: { Cookie: cookie } });
    assert.equal(inventory.status, 200);
    assert.equal((await inventory.json())[0].stockQuantity, null);

    const inventoryHeaders = { ...originHeaders, Cookie: cookie };
    const savedInventory = await fetch(`${baseUrl}/api/admin/inventory/1`, {
        method: "PUT",
        headers: inventoryHeaders,
        body: JSON.stringify({ stockQuantity: 12.5 })
    });
    assert.equal(savedInventory.status, 200);
    assert.equal(stockQuantities.get(1), 12.5);

    const unchangedInventory = await fetch(`${baseUrl}/api/admin/inventory/1`, {
        method: "PUT",
        headers: inventoryHeaders,
        body: JSON.stringify({ stockQuantity: 12.5 })
    });
    assert.equal(unchangedInventory.status, 200);

    const invalidInventory = await fetch(`${baseUrl}/api/admin/inventory/1`, {
        method: "PUT",
        headers: inventoryHeaders,
        body: JSON.stringify({ stockQuantity: -1 })
    });
    assert.equal(invalidInventory.status, 400);

    const rejectedMutation = await fetch(`${baseUrl}/api/admin/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(defaultSiteContent)
    });
    assert.equal(rejectedMutation.status, 403);
});
