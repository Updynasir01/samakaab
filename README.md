# Samakaab Supermarket — Credit & Customer Management

A web app for small supermarkets to track **customer credit**, **payments**, **balances**, **overdue follow-ups**, and **reports**. Built with **React (Vite)**, **Node.js (Express)**, and **MongoDB**.

## Features

- **Customers** — Profile: name, phone, optional address, notes
- **Credit entries** — Amount, description, credit date, expected pay date
- **Payments** — Amount and date; balance = total credit − total payments
- **Dashboard** — Total owed, debtors count, overdue alerts, charts
- **Reports** — Monthly and yearly summaries; PDF download
- **Roles** — **Admin** (full access including delete and user creation); **Staff** (add data, no delete)
- **Search** — Customers by text; credit lines by item/description

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ (recommended)
- [MongoDB](https://www.mongodb.com/) running locally, or a connection string (e.g. MongoDB Atlas)

## Quick start

### 1. Clone or open the project

```bash
cd XisaabHaye
```

### 2. Backend (`server/`)

```bash
cd server
npm install
```

Copy environment file and adjust if needed:

```bash
copy .env.example .env
```

On Windows PowerShell you can use:

```powershell
Copy-Item .env.example .env
```

Edit `.env`:

| Variable       | Description                          |
|----------------|--------------------------------------|
| `PORT`         | API port (default `5000`)            |
| `MONGODB_URI`  | MongoDB connection string            |
| `JWT_SECRET`   | Secret for signing auth tokens (use a long random string in production) |

Create the first admin user (only runs if the database has no users yet):

```bash
npm run seed
```

Default seed credentials:

- **Username:** `admin`  
- **Password:** `admin123`  

Change the password after first login by adding another admin in **Settings** (or by updating the database).

Start the API:

```bash
npm run dev
```

API base: `http://localhost:5000` — health check: `GET http://localhost:5000/api/health`

### 3. Frontend (`client/`)

In a second terminal:

```bash
cd client
npm install
npm run dev
```

Open the URL shown (usually `http://localhost:5173`). The dev server proxies `/api` to the backend on port `5000`.

### 4. Production build (frontend)

```bash
cd client
npm run build
npm run preview
```

Serve the `client/dist` folder with any static host and configure it to proxy API requests to your Express server, or deploy API and SPA separately with CORS and correct `VITE_*` / API base URL if you add one later.

## Project structure

```
XisaabHaye/
├── client/          # React (Vite) SPA
│   └── src/
│       ├── pages/     # Dashboard, Customers, Reports, Login, Settings
│       ├── api.js     # Fetch helpers
│       └── auth.jsx   # Auth context
├── server/          # Express API
│   └── src/
│       ├── models/    # User, Customer, CreditEntry, PaymentEntry
│       ├── routes/    # auth, customers, credits, payments, reports, dashboard
│       └── services/  # Balance calculations
└── README.md
```

## API overview

| Prefix            | Purpose                    |
|-------------------|----------------------------|
| `/api/auth`       | Login, register (admin), me |
| `/api/customers`  | CRUD customers             |
| `/api/credits`    | Credit lines, search       |
| `/api/payments`   | Payment lines              |
| `/api/reports`    | Monthly / yearly reports   |
| `/api/dashboard`  | Dashboard summary          |

Authenticated routes expect: `Authorization: Bearer <token>`.

## Security notes

- Use a strong `JWT_SECRET` in production.
- Run MongoDB with authentication and network rules appropriate for your environment.
- Replace default seed credentials before going live.

## License

Private / project use unless you specify otherwise.
