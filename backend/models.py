from .db import Base
from sqlalchemy import Column, Integer, String, Float, DateTime, func


class Transaction(Base):
    __tablename__ = 'transactions'

    id = Column(Integer, primary_key=True, index=True)
    date = Column(String, nullable=False, index=True)  # ISO date string
    description = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    category = Column(String, nullable=True)
    txn_type = Column(String, nullable=False, default='expense')  # 'income' or 'expense'
    merchant = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
