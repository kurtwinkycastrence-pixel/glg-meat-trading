import "dotenv/config";
import bcrypt from "bcryptjs";
import { createPool } from "../server/database.js";

const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
const missingEnvironment = Object.entries({ ADMIN_EMAIL, ADMIN_PASSWORD })
    .filter(([, value]) => !value)
    .map(([key]) => key);

if (missingEnvironment.length) {
    throw new Error(`Missing required environment variables: ${missingEnvironment.join(", ")}`);
}
if (ADMIN_PASSWORD.length < 12 || ADMIN_PASSWORD.length > 200) {
    throw new Error("ADMIN_PASSWORD must contain between 12 and 200 characters.");
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL.trim())) {
    throw new Error("ADMIN_EMAIL must be a valid email address.");
}

const pool = createPool();
try {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await pool.execute(
        "INSERT INTO admins (email, password_hash) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash",
        [ADMIN_EMAIL.trim().toLowerCase(), passwordHash]
    );
    console.log(`Admin account ${ADMIN_EMAIL.trim().toLowerCase()} is ready.`);
} finally {
    await pool.end();
}
