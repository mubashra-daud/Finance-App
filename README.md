# Smart Personal Finance & Budgeting Platform

A polished app that:
- Tracks income/expenses
- Predicts monthly burn (simple ML-style heuristic)
- Provides visual dashboards
- Offers automatic categorization rules

## Stack
- Frontend: Next.js (App Router, TypeScript, Tailwind)
- Backend: FastAPI + SQLAlchemy (Python 3.12+)
- DB: SQLite by default (Postgres ready via `DATABASE_URL`)
- Worker: RQ/Redis optional (categorization logic is synchronous by default)

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

## Using Postgres + Redis
```powershell
# start Postgres
docker compose up -d db

# use Postgres URL
set DATABASE_URL=postgresql://user:password@127.0.0.1:5432/finance
.\.venv\Scripts\python backend\create_tables.py
.\.venv\Scripts\python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# optional worker (if Redis running on REDIS_URL)
cd worker
python -m pip install -r requirements.txt
python worker.py
```

## API
- `POST /api/transactions` – add a transaction (auto-categorizes if no category provided)
- `GET /api/transactions` – list recent transactions
- `GET /api/dashboard` – balance, totals, predicted monthly burn, category rollups, recent items
- `GET /api/prediction` – monthly burn estimate

## Notes
- Categorization uses simple keyword rules (see `backend/main.py`).
- Monthly burn prediction uses a lightweight heuristic over recent expenses.
- Dev table creation drops/recreates tables; avoid in production or wire migrations.