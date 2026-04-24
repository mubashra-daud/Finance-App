from .db import Base
from sqlalchemy import Column, Integer, String, Float, DateTime, func, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship


class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    transactions = relationship("Transaction", back_populates="user")
    category_rules = relationship("CategoryRule", back_populates="user")


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
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)  # null => guest/anon data

    user = relationship("User", back_populates="transactions")


class CategoryRule(Base):
    __tablename__ = 'category_rules'
    __table_args__ = (UniqueConstraint('user_id', 'keyword', name='uq_rule_user_keyword'),)

    id = Column(Integer, primary_key=True, index=True)
    keyword = Column(String, nullable=False)
    category = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)  # null => global rule
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="category_rules")
