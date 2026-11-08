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

## Deploy the live app

GitHub Pages only hosts static files and cannot run the account API or database. The included `render.yaml` configures the complete Node.js app for Render, including a persistent disk for customer accounts and orders.

1. In Render, create a **Blueprint** from this GitHub repository and approve the `glg-meat-trading` web service.
2. The service uses Render's Starter plan because the database needs a persistent disk. Review Render's current pricing before approving; the disk is mounted at `/var/data`.
3. Wait for the first deployment to pass its `/api/health` check. Render runs the database setup before starting the server.
4. Open the Render service URL (for example, `https://glg-meat-trading.onrender.com`) and use `/customer.html` to create an account. Use this deployed app URL instead of the GitHub Pages URL; GitHub Pages remains static and its account API will not work.

Do not add `.env` or passwords to this repository. Configure any deployment secrets through Render's environment settings.
