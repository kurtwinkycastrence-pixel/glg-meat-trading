import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { defaultSiteContent } from "../js/site-content.js";
import {
    validateInquiry,
    validateOrder,
    validateSiteContent
} from "./validation.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sessionCookieName = "glg_admin_session";
const customerSessionCookieName = "glg_customer_session";
const dummyPasswordHash = bcrypt.hashSync("invalid-admin-password", 12);
const publicOrderLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many submissions. Please try again later." }
});
const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Please try again later." }
});

function digestToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

function parseCookies(header = "") {
    return Object.fromEntries(header.split(";").map(part => {
        const separator = part.indexOf("=");
        if (separator < 0) return ["", ""];
        const name = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        try {
            return [name, decodeURIComponent(value)];
        } catch {
            return [name, ""];
        }
    }).filter(([name]) => name));
}

function setSessionCookie(response, token, secure, sessionHours, cookieName = sessionCookieName) {
    const attributes = [
        `${cookieName}=${encodeURIComponent(token)}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
        `Max-Age=${sessionHours * 60 * 60}`
    ];
    if (secure) attributes.push("Secure");
    response.setHeader("Set-Cookie", attributes.join("; "));
}

function clearSessionCookie(response, secure, cookieName = sessionCookieName) {
    const attributes = [
        `${cookieName}=`,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
        "Max-Age=0"
    ];
    if (secure) attributes.push("Secure");
    response.setHeader("Set-Cookie", attributes.join("; "));
}

function normalizeProduct(row) {
    return {
        id: Number(row.id),
        name: row.name,
        category: row.category,
        price: Number(row.price),
        wholesalePrice: row.wholesale_price === null || row.wholesale_price === undefined
            ? null
            : Number(row.wholesale_price),
        unit: row.unit,
        image: row.image,
        desc: row.description,
        stockQuantity: row.stock_quantity === null || row.stock_quantity === undefined
            ? null
            : Number(row.stock_quantity)
    };
}

function normalizeOrder(row) {
    return {
        id: Number(row.id),
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        orderType: row.order_type,
        paymentMethod: row.payment_method || "Cash",
        totalAmount: Number(row.total_amount),
        status: row.status,
        createdAt: row.created_at,
        items: row.items || []
    };
}

function handleError(response, error) {
    if (error.status) {
        response.status(error.status).json({ error: error.message });
        return;
    }
    console.error(error);
    response.status(500).json({ error: "The request could not be completed. Please try again." });
}

function requireSameOriginJson(request, response, next) {
    const origin = request.get("origin");
    if (origin) {
        try {
            if (new URL(origin).host !== request.get("host")) {
                response.status(403).json({ error: "This request is not allowed." });
                return;
            }
        } catch {
            response.status(403).json({ error: "This request is not allowed." });
            return;
        }
    }
    if (request.get("x-requested-with") !== "XMLHttpRequest"
        || !request.is("application/json")) {
        response.status(403).json({ error: "This request is not allowed." });
        return;
    }
    next();
}

export function createApp({
    pool,
    env = process.env,
    passwordCompare = bcrypt.compare,
    passwordHash = bcrypt.hash
}) {
    const app = express();
    const secureCookie = env.NODE_ENV === "production";
    const sessionHours = Number(env.SESSION_HOURS || 8);

    app.disable("x-powered-by");
    app.use(express.json({ limit: "100kb", strict: true }));
    app.use((request, response, next) => {
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "same-origin");
        response.setHeader("X-Frame-Options", "DENY");
        next();
    });

    app.get("/api/health", async (request, response) => {
        try {
            await pool.query("SELECT 1");
            response.json({ status: "ok" });
        } catch (error) {
            handleError(response, error);
        }
    });

    app.get("/api/storefront", async (request, response) => {
        try {
            const [contentRows] = await pool.execute(
                "SELECT content_key, content_value FROM site_content"
            );
            const [productRows] = await pool.execute(
                "SELECT id, name, category, price, wholesale_price, unit, image, description, stock_quantity FROM products ORDER BY id"
            );
            const content = { ...defaultSiteContent, products: productRows.map(normalizeProduct) };
            for (const row of contentRows) content[row.content_key] = row.content_value;
            response.setHeader("Cache-Control", "no-store");
            response.json(content);
        } catch (error) {
            handleError(response, error);
        }
    });

    async function saveOrder(order, items, totalAmount, customerId = null) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [insertResult] = await connection.execute(
                "INSERT INTO orders (customer_id, customer_name, customer_phone, order_type, payment_method, total_amount, status) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
                [customerId, order.customerName, order.customerPhone, order.orderType, order.paymentMethod || "Cash", totalAmount, order.orderType === "Quick Inquiry" ? "Pending Inquiry" : "Pending"]
            );
            for (const item of items) {
                await connection.execute(
                    "INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)",
                    [insertResult.insertId, item.productId, item.name, item.quantity, item.price]
                );
            }
            await connection.commit();
            return insertResult.insertId;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async function attachOptionalCustomer(request, response, next) {
        const token = parseCookies(request.headers.cookie)[customerSessionCookieName];
        if (!token) {
            next();
            return;
        }
        if (!/^[a-f0-9]{64}$/.test(token)) {
            clearSessionCookie(response, secureCookie, customerSessionCookieName);
            response.status(401).json({ error: "Your customer session has expired. Please sign in again." });
            return;
        }
        try {
            const [rows] = await pool.execute(
                "SELECT customers.id, customers.full_name, customers.phone, customers.email FROM customer_sessions JOIN customers ON customers.id = customer_sessions.customer_id WHERE customer_sessions.token_hash = ? AND customer_sessions.expires_at > CURRENT_TIMESTAMP LIMIT 1",
                [digestToken(token)]
            );
            if (!rows.length) {
                clearSessionCookie(response, secureCookie, customerSessionCookieName);
                response.status(401).json({ error: "Your customer session has expired. Please sign in again." });
                return;
            }
            request.customer = rows[0];
            next();
        } catch (error) {
            next(error);
        }
    }

    app.post("/api/orders", attachOptionalCustomer, publicOrderLimit, async (request, response) => {
        let order;
        try {
            order = validateOrder(request.body);
        } catch (error) {
            response.status(400).json({ error: error.message });
            return;
        }
        try {
            const productIds = [...new Set(order.items.map(item => item.id))];
            const placeholders = productIds.map(() => "?").join(", ");
            const [rows] = await pool.execute(
                `SELECT id, name, price, wholesale_price FROM products WHERE id IN (${placeholders})`,
                productIds
            );
            const products = new Map(rows.map(row => [Number(row.id), row]));
            if (products.size !== productIds.length) {
                response.status(400).json({ error: "One or more selected products are no longer available." });
                return;
            }
            const items = order.items.map(item => {
                const product = products.get(item.id);
                const qualifiesForAutomaticWholesale = ["Hungarian Cheese", "Hungarian Spicy"].includes(product.name)
                    && item.quantity >= 10;
                return {
                    productId: item.id,
                    name: product.name,
                    quantity: item.quantity,
                    price: (order.orderType === "Wholesale" || qualifiesForAutomaticWholesale)
                        && product.wholesale_price !== null
                        ? Number(product.wholesale_price)
                        : Number(product.price)
                };
            });
            const totalCents = items.reduce(
                (total, item) => total + Math.round(item.price * 100) * item.quantity,
                0
            );
            if (totalCents > 999999999999) {
                response.status(400).json({ error: "The order total is too large to process." });
                return;
            }
            const totalAmount = totalCents / 100;
            const orderId = await saveOrder({
                ...order,
                customerName: request.customer?.full_name || order.customerName,
                customerPhone: request.customer?.phone || order.customerPhone
            }, items, totalAmount, request.customer?.id ?? null);
            response.status(201).json({ id: Number(orderId) });
        } catch (error) {
            handleError(response, error);
        }
    });

    app.post("/api/inquiries", attachOptionalCustomer, publicOrderLimit, async (request, response) => {
        let inquiry;
        try {
            inquiry = validateInquiry(request.body);
        } catch (error) {
            response.status(400).json({ error: error.message });
            return;
        }
        try {
            const orderId = await saveOrder({
                ...inquiry,
                customerName: request.customer?.full_name || inquiry.customerName,
                customerPhone: request.customer?.phone || inquiry.customerPhone,
                orderType: "Quick Inquiry"
            }, [{
                productId: null,
                name: `Inquiry: ${inquiry.message}`,
                quantity: 1,
                price: 0
            }], 0, request.customer?.id ?? null);
            response.status(201).json({ id: Number(orderId) });
        } catch (error) {
            handleError(response, error);
        }
    });

    const customerAuthLimit = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: { error: "Too many account attempts. Please try again later." }
    });

    app.post("/api/customer/register", requireSameOriginJson, customerAuthLimit, async (request, response) => {
        const fullName = typeof request.body?.fullName === "string" ? request.body.fullName.trim() : "";
        const phone = typeof request.body?.phone === "string" ? request.body.phone.trim() : "";
        const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
        const password = typeof request.body?.password === "string" ? request.body.password : "";
        if (!fullName || fullName.length > 180
            || !phone || phone.length > 80
            || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
            || email.length > 254
            || password.length < 12
            || password.length > 200) {
            response.status(400).json({ error: "Enter your name, phone, a valid email address, and a password with at least 12 characters." });
            return;
        }
        try {
            const hashedPassword = await passwordHash(password, 12);
            const [result] = await pool.execute(
                "INSERT INTO customers (full_name, phone, email, password_hash) VALUES (?, ?, ?, ?) RETURNING id",
                [fullName, phone, email, hashedPassword]
            );
            const customer = { id: result.insertId, full_name: fullName, phone, email };
            const token = randomBytes(32).toString("hex");
            const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000).toISOString();
            await pool.execute(
                "INSERT INTO customer_sessions (token_hash, customer_id, expires_at) VALUES (?, ?, ?)",
                [digestToken(token), customer.id, expiresAt]
            );
            setSessionCookie(response, token, secureCookie, sessionHours, customerSessionCookieName);
            response.status(201).json({ id: Number(customer.id), fullName, phone, email });
        } catch (error) {
            if (error.code === "ER_DUP_ENTRY") {
                response.status(409).json({ error: "An account with this email already exists." });
                return;
            }
            handleError(response, error);
        }
    });

    app.post("/api/customer/login", requireSameOriginJson, customerAuthLimit, async (request, response) => {
        const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
        const password = typeof request.body?.password === "string" ? request.body.password : "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
            || email.length > 254
            || !password
            || password.length > 200) {
            response.status(400).json({ error: "Enter a valid email address and password." });
            return;
        }
        try {
            const [customers] = await pool.execute(
                "SELECT id, full_name, phone, email, password_hash FROM customers WHERE email = ? LIMIT 1",
                [email]
            );
            const customer = customers[0];
            const passwordMatches = await passwordCompare(password, customer?.password_hash || dummyPasswordHash);
            if (!passwordMatches || !customer) {
                response.status(401).json({ error: "Incorrect email or password." });
                return;
            }
            const token = randomBytes(32).toString("hex");
            const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000).toISOString();
            await pool.execute(
                "INSERT INTO customer_sessions (token_hash, customer_id, expires_at) VALUES (?, ?, ?)",
                [digestToken(token), customer.id, expiresAt]
            );
            setSessionCookie(response, token, secureCookie, sessionHours, customerSessionCookieName);
            response.json({
                id: Number(customer.id),
                fullName: customer.full_name,
                phone: customer.phone,
                email: customer.email
            });
        } catch (error) {
            handleError(response, error);
        }
    });

    const customer = express.Router();
    customer.use((request, response, next) => {
        if (request.method !== "GET" && request.method !== "HEAD") {
            requireSameOriginJson(request, response, next);
            return;
        }
        next();
    });
    customer.use(async (request, response, next) => {
        const token = parseCookies(request.headers.cookie)[customerSessionCookieName];
        if (!token || !/^[a-f0-9]{64}$/.test(token)) {
            response.status(401).json({ error: "Please sign in to your customer account." });
            return;
        }
        try {
            const [rows] = await pool.execute(
                "SELECT customers.id, customers.full_name, customers.phone, customers.email FROM customer_sessions JOIN customers ON customers.id = customer_sessions.customer_id WHERE customer_sessions.token_hash = ? AND customer_sessions.expires_at > CURRENT_TIMESTAMP LIMIT 1",
                [digestToken(token)]
            );
            if (!rows.length) {
                clearSessionCookie(response, secureCookie, customerSessionCookieName);
                response.status(401).json({ error: "Your customer session has expired. Please sign in again." });
                return;
            }
            request.customer = rows[0];
            next();
        } catch (error) {
            next(error);
        }
    });

    customer.get("/session", (request, response) => {
        response.json({
            id: Number(request.customer.id),
            fullName: request.customer.full_name,
            phone: request.customer.phone,
            email: request.customer.email
        });
    });

    customer.post("/logout", async (request, response) => {
        try {
            const token = parseCookies(request.headers.cookie)[customerSessionCookieName];
            if (token) {
                await pool.execute("DELETE FROM customer_sessions WHERE token_hash = ?", [digestToken(token)]);
            }
            clearSessionCookie(response, secureCookie, customerSessionCookieName);
            response.json({ success: true });
        } catch (error) {
            handleError(response, error);
        }
    });

    customer.get("/orders", async (request, response) => {
        try {
            const [rows] = await pool.execute(
                "SELECT orders.id, orders.customer_name, orders.customer_phone, orders.order_type, orders.payment_method, orders.total_amount, orders.status, orders.created_at, order_items.product_name, order_items.quantity, order_items.unit_price FROM orders LEFT JOIN order_items ON order_items.order_id = orders.id WHERE orders.customer_id = ? ORDER BY orders.created_at DESC, orders.id DESC",
                [request.customer.id]
            );
            const orders = new Map();
            for (const row of rows) {
                let order = orders.get(Number(row.id));
                if (!order) {
                    order = normalizeOrder({ ...row, items: [] });
                    orders.set(order.id, order);
                }
                if (row.product_name !== null) {
                    order.items.push({
                        name: row.product_name,
                        qty: Number(row.quantity),
                        price: Number(row.unit_price)
                    });
                }
            }
            response.json([...orders.values()]);
        } catch (error) {
            handleError(response, error);
        }
    });

    app.use("/api/customer", customer);

    app.post("/api/admin/login", requireSameOriginJson, loginLimit, async (request, response) => {
        const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
        const password = typeof request.body?.password === "string" ? request.body.password : "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
            || email.length > 254
            || !password
            || password.length > 200) {
            response.status(400).json({ error: "Enter a valid email address and password." });
            return;
        }
        try {
            const [admins] = await pool.execute(
                "SELECT id, email, password_hash FROM admins WHERE email = ? LIMIT 1",
                [email]
            );
            const admin = admins[0];
            const passwordMatches = await passwordCompare(password, admin?.password_hash || dummyPasswordHash);
            if (!passwordMatches || !admin) {
                response.status(401).json({ error: "Incorrect email or password." });
                return;
            }
            const token = randomBytes(32).toString("hex");
            const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000).toISOString();
            await pool.execute(
                "INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)",
                [digestToken(token), admin.id, expiresAt]
            );
            setSessionCookie(response, token, secureCookie, sessionHours);
            response.json({ email: admin.email });
        } catch (error) {
            handleError(response, error);
        }
    });

    const admin = express.Router();
    admin.use((request, response, next) => {
        if (request.method !== "GET" && request.method !== "HEAD") {
            requireSameOriginJson(request, response, next);
            return;
        }
        next();
    });
    admin.use(async (request, response, next) => {
        const token = parseCookies(request.headers.cookie)[sessionCookieName];
        if (!token || !/^[a-f0-9]{64}$/.test(token)) {
            response.status(401).json({ error: "Please sign in to continue." });
            return;
        }
        try {
            const [rows] = await pool.execute(
                "SELECT admins.id, admins.email FROM admin_sessions JOIN admins ON admins.id = admin_sessions.admin_id WHERE admin_sessions.token_hash = ? AND admin_sessions.expires_at > CURRENT_TIMESTAMP LIMIT 1",
                [digestToken(token)]
            );
            if (!rows.length) {
                clearSessionCookie(response, secureCookie);
                response.status(401).json({ error: "Your session has expired. Please sign in again." });
                return;
            }
            request.admin = rows[0];
            next();
        } catch (error) {
            next(error);
        }
    });

    admin.get("/session", (request, response) => {
        response.json({ email: request.admin.email });
    });

    admin.post("/logout", async (request, response) => {
        try {
            const token = parseCookies(request.headers.cookie)[sessionCookieName];
            if (token) {
                await pool.execute("DELETE FROM admin_sessions WHERE token_hash = ?", [digestToken(token)]);
            }
            clearSessionCookie(response, secureCookie);
            response.json({ success: true });
        } catch (error) {
            handleError(response, error);
        }
    });

    admin.get("/content", async (request, response) => {
        try {
            const [contentRows] = await pool.execute(
                "SELECT content_key, content_value FROM site_content"
            );
            const [productRows] = await pool.execute(
                "SELECT id, name, category, price, wholesale_price, unit, image, description, stock_quantity FROM products ORDER BY id"
            );
            const content = { ...defaultSiteContent, products: productRows.map(normalizeProduct) };
            for (const row of contentRows) content[row.content_key] = row.content_value;
            response.json(content);
        } catch (error) {
            handleError(response, error);
        }
    });

    admin.put("/content", async (request, response) => {
        let validated;
        try {
            validated = validateSiteContent(request.body);
        } catch (error) {
            error.status = 400;
            handleError(response, error);
            return;
        }
        const { content, products } = validated;
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.execute("DELETE FROM site_content");
            for (const [key, value] of Object.entries(content)) {
                await connection.execute(
                    "INSERT INTO site_content (content_key, content_value) VALUES (?, ?)",
                    [key, value]
                );
            }
            for (const product of products) {
                await connection.execute(
                    "INSERT INTO products (id, name, category, price, wholesale_price, unit, image, description, stock_quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category, price = excluded.price, wholesale_price = excluded.wholesale_price, unit = excluded.unit, image = excluded.image, description = excluded.description",
                    [product.id, product.name, product.category, product.price, product.wholesalePrice, product.unit, product.image, product.desc, product.stockQuantity]
                );
            }
            const productIds = products.map(product => product.id);
            await connection.execute(
                `DELETE FROM products WHERE id NOT IN (${productIds.map(() => "?").join(", ")})`,
                productIds
            );
            await connection.commit();
            response.json({ success: true });
        } catch (error) {
            await connection.rollback();
            handleError(response, error);
        } finally {
            connection.release();
        }
    });

    admin.get("/inventory", async (request, response) => {
        try {
            const [rows] = await pool.execute(
                "SELECT id, name, unit, stock_quantity FROM products ORDER BY id"
            );
            response.json(rows.map(row => ({
                id: Number(row.id),
                name: row.name,
                unit: row.unit,
                stockQuantity: row.stock_quantity === null ? null : Number(row.stock_quantity)
            })));
        } catch (error) {
            handleError(response, error);
        }
    });

    admin.put("/inventory/:id", async (request, response) => {
        const id = Number(request.params.id);
        const quantity = request.body?.stockQuantity;
        if (!Number.isInteger(id) || id < 1
            || (quantity !== null
                && (typeof quantity !== "number"
                    || !Number.isFinite(quantity)
                    || quantity < 0
                    || quantity > 999999999.999))) {
            response.status(400).json({ error: "Enter a valid product and stock quantity." });
            return;
        }
        try {
            const [result] = await pool.execute(
                "UPDATE products SET stock_quantity = ? WHERE id = ?",
                [quantity, id]
            );
            if (!result.affectedRows) {
                const [rows] = await pool.execute(
                    "SELECT id FROM products WHERE id = ?",
                    [id]
                );
                if (!rows.length) {
                    response.status(404).json({ error: "Product not found." });
                    return;
                }
            }
            response.json({ success: true });
        } catch (error) {
            handleError(response, error);
        }
    });

    admin.get("/orders", async (request, response) => {
        try {
            const [rows] = await pool.execute(
                "SELECT orders.id, orders.customer_name, orders.customer_phone, orders.order_type, orders.payment_method, orders.total_amount, orders.status, orders.created_at, order_items.product_name, order_items.quantity, order_items.unit_price FROM orders LEFT JOIN order_items ON order_items.order_id = orders.id ORDER BY orders.created_at DESC, orders.id DESC"
            );
            const orders = new Map();
            for (const row of rows) {
                let order = orders.get(Number(row.id));
                if (!order) {
                    order = normalizeOrder({ ...row, items: [] });
                    orders.set(order.id, order);
                }
                if (row.product_name !== null) {
                    order.items.push({
                        name: row.product_name,
                        qty: Number(row.quantity),
                        price: Number(row.unit_price)
                    });
                }
            }
            response.json([...orders.values()]);
        } catch (error) {
            handleError(response, error);
        }
    });

    app.use("/api/admin", admin);

    app.get("/api/*path", (request, response) => {
        response.status(404).json({ error: "API endpoint not found." });
    });

    app.use("/assets", express.static(path.join(root, "assets"), { dotfiles: "deny", fallthrough: false }));
    app.use("/css", express.static(path.join(root, "database", "css"), { dotfiles: "deny", fallthrough: false }));
    app.use("/js", express.static(path.join(root, "js"), { dotfiles: "deny", fallthrough: false }));
    app.get(["/", "/index.html", "/admin.html", "/customer.html"], (request, response) => {
        const fileName = request.path === "/admin.html"
            ? "admin.html"
            : request.path === "/customer.html" ? "customer.html" : "index.html";
        response.sendFile(path.join(root, fileName));
    });
    app.use((error, request, response, next) => {
        if (response.headersSent) {
            next(error);
            return;
        }
        if (error.type === "entity.parse.failed") {
            response.status(400).json({ error: "Request body must be valid JSON." });
            return;
        }
        console.error(error);
        response.status(500).json({ error: "The request could not be completed. Please try again." });
    });

    return app;
}
