# Local Database and Login Setup

The storefront, customer accounts, and admin dashboard use a same-origin Node.js API backed by a local SQLite database. Customer and admin accounts have separate sign-in pages and sessions. SQLite is included with Node.js; no MySQL or other database server is required.

## Requirements

- Node.js 22.5 or newer

## Start the app

1. Install project dependencies with `npm install`.
2. Initialize the local database and seed the catalog with `npm run db:setup`. This creates `database/glg-meat-trading.sqlite`.
3. Copy `.env.example` to `.env` and set a unique admin email and password. Use at least 12 characters for the password.
4. Create or update the admin account with `npm run admin:create`.
5. Start the server with `npm start`, then open `http://127.0.0.1:3000`.
6. Customers can create an account from `http://127.0.0.1:3000/customer.html`. Admins sign in separately at `http://127.0.0.1:3000/admin.html`. Orders placed while signed in are linked to that customer's order history.

Keep `.env` and the SQLite database file private. The database file is excluded from Git. For production, use HTTPS and protect the host and its database backups.

`npm test` runs the automated test suite.
