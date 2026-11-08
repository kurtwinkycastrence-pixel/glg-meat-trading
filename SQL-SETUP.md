# Customer Accounts and Local Database

The storefront, customer accounts, and admin dashboard use a same-origin Node.js API backed by embedded PostgreSQL. The database runs locally inside the Node.js app; a separate PostgreSQL server or account is not needed. Customer and admin accounts have separate sign-in pages and sessions.

## Requirements

- Node.js 22.5 or newer

## Start the app

1. Install project dependencies with `npm install`.
2. Keep `DATABASE_PATH` set to `database/postgres-data` in `.env`.
3. Initialize the database and seed the catalog with `npm run db:setup`.
4. Start the app with `npm start`.
5. Open `http://127.0.0.1:3000/customer.html` and select **Create an account**. Do not open `customer.html` directly as a file.
6. To sign in as an admin, set a unique admin email and a password of at least 12 characters in `.env`, then run `npm run admin:create`. Open `http://127.0.0.1:3000/admin.html`.

The local database is stored in `database/postgres-data` and excluded from Git. Keep `.env` private and protect database backups. Existing data from an earlier database is not imported automatically.

`npm test` runs the automated test suite, including a local database integration test.
