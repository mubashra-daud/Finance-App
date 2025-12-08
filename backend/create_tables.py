import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from backend.db import engine, Base
from backend import models


def create_tables():
    print("Recreating tables (development use)...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("Tables ready")

if __name__ == '__main__':
    create_tables()
