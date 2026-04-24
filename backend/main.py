import os
from datetime import datetime, timedelta
from typing import List, Optional
from collections import defaultdict

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, ConfigDict, Field, EmailStr
from sqlalchemy import func, or_
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

SECRET_KEY = os.environ.get("JWT_SECRET", "dev-secret-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


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


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: EmailStr
    model_config = ConfigDict(from_attributes=True)


class RegisterIn(BaseModel):
    email: EmailStr
    password: str


class DashboardCategory(BaseModel):
    name: str
    total: float


class CashflowPoint(BaseModel):
    date: str
    income: float
    expense: float
    net: float


class CategoryRuleIn(BaseModel):
    keyword: str
    category: str


class DashboardResponse(BaseModel):
    balance: float
    total_income: float
    total_expense: float
    monthly_burn_pred: float
    recent: List[TransactionOut]
    categories: List[DashboardCategory]
    cashflow: List[CashflowPoint]


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


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if "sub" in to_encode:
        to_encode["sub"] = str(to_encode["sub"])  # jose requires subject as string
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.email == email).first()


def categorize(description: str, db: Session, user_id: Optional[int], fallback: str = "Uncategorized") -> str:
    """Apply user-specific rules first, then global rules, then defaults."""
    desc_l = description.lower()
    rules = (
        db.query(models.CategoryRule)
        .filter(or_(models.CategoryRule.user_id == user_id, models.CategoryRule.user_id.is_(None)))
        .order_by(models.CategoryRule.user_id.desc())  # user rules first
        .all()
    )
    for rule in rules:
        if rule.keyword.lower() in desc_l:
            return rule.category

    for keyword, category in KEYWORD_CATEGORIES.items():
        if keyword in desc_l:
            return category
    return fallback


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_sub = payload.get("sub")
        user_id = int(user_sub) if user_sub is not None else None
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user


def get_current_user_optional(authorization: Optional[str] = None, db: Session = Depends(get_db)) -> Optional[models.User]:
    """Return user if Bearer token is provided; otherwise None."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_sub = payload.get("sub")
        user_id = int(user_sub) if user_sub is not None else None
        if user_id is None:
            return None
    except JWTError:
        return None
    return db.query(models.User).filter(models.User.id == user_id).first()


def predict_monthly_burn(transactions: List[models.Transaction]) -> float:
    """Heuristic: average daily expense over the last 30 days * 30.

    If there are fewer than 30 days of data, we still compute an average over
    the observed window to keep the prediction responsive for new accounts.
    """
    cutoff = datetime.utcnow() - timedelta(days=30)
    expenses = []
    for t in transactions:
        if t.txn_type != 'expense':
            continue
        try:
            dt = datetime.fromisoformat(t.date)
        except Exception:
            continue
        if dt >= cutoff:
            expenses.append((dt.date(), t.amount))

    if not expenses:
        return 0.0

    # Group by day to avoid over-weighting busy days.
    by_day = defaultdict(float)
    for day, amt in expenses:
        by_day[day] += amt

    avg_daily = sum(by_day.values()) / len(by_day)
    return round(avg_daily * 30, 2)


@app.on_event("startup")
def startup_event():
    models.Base.metadata.create_all(bind=engine)


@app.post("/auth/register", response_model=Token)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    existing = get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = models.User(email=payload.email, hashed_password=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": user.id})
    return Token(access_token=token)


@app.post("/auth/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = get_user_by_email(db, form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token({"sub": user.id})
    return Token(access_token=token)


@app.post("/api/category-rules")
def create_rule(payload: CategoryRuleIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    rule = models.CategoryRule(keyword=payload.keyword, category=payload.category, user_id=user.id)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return {"id": rule.id, "keyword": rule.keyword, "category": rule.category}


@app.get("/api/category-rules")
def list_rules(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(models.CategoryRule)
        .filter(or_(models.CategoryRule.user_id == user.id, models.CategoryRule.user_id.is_(None)))
        .order_by(models.CategoryRule.user_id.desc(), models.CategoryRule.created_at.desc())
        .all()
    )
    return [{"id": r.id, "keyword": r.keyword, "category": r.category, "scope": "mine" if r.user_id else "global"} for r in rows]


@app.post("/api/transactions", response_model=TransactionOut)
def ingest_transaction(payload: TransactionIn, user: Optional[models.User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    user_id = user.id if user else None
    category = payload.category or categorize(payload.description, db=db, user_id=user_id)
    txn_type = payload.txn_type or ("income" if category == "Income" else "expense")
    tx = models.Transaction(
        date=payload.date,
        description=payload.description,
        amount=payload.amount,
        category=category,
        txn_type=txn_type,
        merchant=payload.merchant,
        user_id=user_id,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@app.get("/api/transactions", response_model=List[TransactionOut])
def list_transactions(limit: int = 100, user: Optional[models.User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    query = db.query(models.Transaction).order_by(models.Transaction.created_at.desc())
    if user:
        query = query.filter(models.Transaction.user_id == user.id)
    else:
        query = query.filter(models.Transaction.user_id.is_(None))
    rows = query.limit(limit).all()
    return rows


@app.get("/api/prediction")
def get_prediction(user: Optional[models.User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    query = db.query(models.Transaction)
    if user:
        query = query.filter(models.Transaction.user_id == user.id)
    else:
        query = query.filter(models.Transaction.user_id.is_(None))
    txs = query.all()
    burn = predict_monthly_burn(txs)
    return {"monthly_burn": burn}


@app.get("/api/dashboard", response_model=DashboardResponse)
def get_dashboard(limit: int = 20, user: Optional[models.User] = Depends(get_current_user_optional), db: Session = Depends(get_db)):
    query = db.query(models.Transaction).order_by(models.Transaction.created_at.desc())
    if user:
        query = query.filter(models.Transaction.user_id == user.id)
    else:
        query = query.filter(models.Transaction.user_id.is_(None))
    txs = query.all()
    recent = txs[:limit]

    total_income = sum(t.amount for t in txs if t.txn_type == 'income')
    total_expense = sum(t.amount for t in txs if t.txn_type == 'expense')
    balance = total_income - total_expense
    burn_pred = predict_monthly_burn(txs)

    # Daily cashflow series (last 30 days)
    cutoff = datetime.utcnow().date() - timedelta(days=30)
    daily_income = defaultdict(float)
    daily_expense = defaultdict(float)

    for t in txs:
        try:
            dt = datetime.fromisoformat(t.date).date()
        except Exception:
            continue
        if dt < cutoff:
            continue
        if t.txn_type == 'income':
            daily_income[dt] += t.amount
        else:
            daily_expense[dt] += t.amount

    cashflow_points: List[CashflowPoint] = []
    for day in sorted(set(daily_income.keys()) | set(daily_expense.keys())):
        income = round(daily_income.get(day, 0.0), 2)
        expense = round(daily_expense.get(day, 0.0), 2)
        cashflow_points.append(
            CashflowPoint(
                date=day.isoformat(),
                income=income,
                expense=expense,
                net=round(income - expense, 2),
            )
        )

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
        cashflow=cashflow_points,
    )
