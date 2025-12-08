"""Simple worker for categorization/prediction.

The app runs fine without Redis. If REDIS_URL is set and Redis is available,
this worker can process jobs enqueued to the "default" queue. Otherwise, it can
be invoked directly for local testing.
"""

import os
import redis
from rq import Worker, Queue, Connection


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


def process_transaction(data: dict):
    """Minimal job handler that assigns a category and echoes the job."""
    desc = data.get("description", "")
    category = data.get("category") or categorize(desc)
    data["category"] = category
    print(f"Processed transaction -> {data}")
    return data


def start_worker():
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    try:
        redis_conn = redis.from_url(redis_url)
    except Exception as exc:  # pragma: no cover - connectivity guard
        print(f"Could not connect to Redis at {redis_url}: {exc}")
        return

    with Connection(redis_conn):
        worker = Worker(['default'])
        worker.work()


if __name__ == '__main__':
    start_worker()