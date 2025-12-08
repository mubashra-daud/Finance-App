import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base


# Prefer env DATABASE_URL; fallback to local SQLite for easy dev.
DATABASE_URL = os.environ.get('DATABASE_URL', 'sqlite:///./finance.db')

# If using SQLite, allow multithread access for FastAPI dev server.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith('sqlite') else {}

engine = create_engine(DATABASE_URL, echo=False, future=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db(base):
    base.metadata.create_all(bind=engine)
