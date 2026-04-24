# Smart Personal Finance & Budgeting Platform

Full-stack app for tracking income/expenses, predicting monthly burn, and visualizing trends in real time.

## Features
- Track income and expenses with keyword-based auto-categorization.
- 30-day rolling burn prediction (daily-average heuristic).
- Dashboards: KPIs, recent activity table, cashflow line chart, category bar chart.
- Secure JWT auth (register/login) with per-user data isolation.
- Ready for Postgres and optional Redis/RQ worker for scaling.

## Stack
- Frontend: Next.js (App Router, TypeScript, Tailwind, Recharts)
- Backend: FastAPI + SQLAlchemy (Python 3.12+)
- DB: SQLite by default; Postgres via `DATABASE_URL`
- Worker: RQ/Redis optional

## Quickstart (local, SQLite)
```powershell
# from repo root
python -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -r backend\requirements.txt

# Recreate tables (dev only; drops existing)
set DATABASE_URL=sqlite:///./finance.db
.\.venv\Scripts\python backend\create_tables.py

# Start backend (port 8000)
set DATABASE_URL=sqlite:///./finance.db
.\.venv\Scripts\python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# In new shell, start frontend (port 3000)
cd frontend
npm install
set NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

Open http://localhost:3000 to use the dashboard. API docs: http://localhost:8000/docs
First action: register a user in the UI (or via `POST /auth/register`) then login to see data.

## Using Postgres + Redis
```powershell
# start Postgres (and Redis if desired)
docker compose up -d db redis

# use Postgres URL
set DATABASE_URL=postgresql://user:password@127.0.0.1:5432/finance
.\.venv\Scripts\python backend\create_tables.py
.\.venv\Scripts\python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# optional worker (categorization/jobs) if Redis running on REDIS_URL
cd worker
python -m pip install -r requirements.txt
python worker.py
```

## API
- `POST /auth/register` - create user, returns JWT
- `POST /auth/login` - OAuth2 password flow, returns JWT
- `POST /api/transactions` - add a transaction (auto-categorizes if no category provided)
- `GET /api/transactions` - list recent transactions
- `GET /api/dashboard` - balance, totals, predicted monthly burn, category rollups, recent items, 30-day cashflow series
- `GET /api/prediction` - monthly burn estimate
- `GET/POST /api/category-rules` - list or create keyword->category rules (user-scoped or global)

## Notes
- Categorization keywords live in `backend/main.py` (`KEYWORD_CATEGORIES`).
- Burn prediction uses the last 30 days of expenses; sparse data still yields a forecast.
- Dev table creation drops/recreates tables; avoid in production or wire migrations.
