from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from .db import get_db, engine
from . import models

app = FastAPI(title="Smart Personal Finance API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TransactionIn(BaseModel):
    date: str = Field(..., description="ISO date, e.g. 2025-12-09")
    description: str
    amount: float
    category: Optional[str] = None
    txn_type: Optional[str] = Field(None, description="income or expense; defaults based on amount sign")
    merchant: Optional[str] = None


class TransactionOut(TransactionIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class DashboardCategory(BaseModel):
    name: str
    total: float


class DashboardResponse(BaseModel):
    balance: float
    total_income: float
    total_expense: float
    monthly_burn_pred: float
    recent: List[TransactionOut]
    categories: List[DashboardCategory]


KEYWORD_CATEGORIES = {
    "grocery": "Food",
    "market": "Food",
    "supermarket": "Food",
    "coffee": "Food",
    "uber": "Transport",
    "lyft": "Transport",
    "gas": "Transport",
    "fuel": "Transport",
    "rent": "Housing",
    "mortgage": "Housing",
    "netflix": "Entertainment",
    "spotify": "Entertainment",
    "movie": "Entertainment",
    "gym": "Health",
    "doctor": "Health",
    "insurance": "Insurance",
    "salary": "Income",
    "payroll": "Income",
    "bonus": "Income",
}


def categorize(description: str, fallback: str = "Uncategorized") -> str:
    desc_l = description.lower()
    for keyword, category in KEYWORD_CATEGORIES.items():
        if keyword in desc_l:
            return category
    return fallback


def predict_monthly_burn(transactions: List[models.Transaction]) -> float:
    # Simple heuristic: average daily expense over last 30 days * 30
    cutoff = datetime.utcnow() - timedelta(days=30)
    expenses = [t.amount for t in transactions if t.txn_type == 'expense']
    if not expenses:
        return 0.0
    avg_daily = sum(expenses) / max(1, len(expenses))
    return round(avg_daily * 30, 2)


@app.on_event("startup")
def startup_event():
    models.Base.metadata.create_all(bind=engine)


@app.post("/api/transactions", response_model=TransactionOut)
def ingest_transaction(payload: TransactionIn, db: Session = Depends(get_db)):
    category = payload.category or categorize(payload.description)
    txn_type = payload.txn_type or ("income" if category == "Income" else "expense")
    tx = models.Transaction(
        date=payload.date,
        description=payload.description,
        amount=payload.amount,
        category=category,
        txn_type=txn_type,
        merchant=payload.merchant,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@app.get("/api/transactions", response_model=List[TransactionOut])
def list_transactions(limit: int = 100, db: Session = Depends(get_db)):
    rows = db.query(models.Transaction).order_by(models.Transaction.created_at.desc()).limit(limit).all()
    return rows


@app.get("/api/prediction")
def get_prediction(db: Session = Depends(get_db)):
    txs = db.query(models.Transaction).all()
    burn = predict_monthly_burn(txs)
    return {"monthly_burn": burn}


@app.get("/api/dashboard", response_model=DashboardResponse)
def get_dashboard(limit: int = 20, db: Session = Depends(get_db)):
    txs = db.query(models.Transaction).order_by(models.Transaction.created_at.desc()).all()
    recent = txs[:limit]

    total_income = sum(t.amount for t in txs if t.txn_type == 'income')
    total_expense = sum(t.amount for t in txs if t.txn_type == 'expense')
    balance = total_income - total_expense
    burn_pred = predict_monthly_burn(txs)

    # Category rollup
    category_totals = (
        db.query(models.Transaction.category, func.sum(models.Transaction.amount))
        .filter(models.Transaction.txn_type == 'expense')
        .group_by(models.Transaction.category)
        .all()
    )
    categories = [DashboardCategory(name=cat or "Uncategorized", total=total) for cat, total in category_totals]

    return DashboardResponse(
        balance=round(balance, 2),
        total_income=round(total_income, 2),
        total_expense=round(total_expense, 2),
        monthly_burn_pred=burn_pred,
        recent=recent,
        categories=categories,
    )
