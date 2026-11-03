"""Conservative, restart-persistent cap on provider attempts, shared by workers."""
import sqlite3
from contextlib import closing
from datetime import datetime, timezone


class ProviderBudgetExceeded(Exception):
    pass


def reserve_attempt(path, limit):
    path.parent.mkdir(parents=True, exist_ok=True)
    day = datetime.now(timezone.utc).date().isoformat()
    with closing(sqlite3.connect(path, timeout=10)) as db, db:
        db.execute("CREATE TABLE IF NOT EXISTS provider_attempts (day TEXT PRIMARY KEY, attempts INTEGER NOT NULL)")
        db.execute("BEGIN IMMEDIATE")
        db.execute("INSERT OR IGNORE INTO provider_attempts VALUES (?, 0)", (day,))
        changed = db.execute("UPDATE provider_attempts SET attempts=attempts+1 WHERE day=? AND attempts<?", (day, limit))
        if changed.rowcount != 1:
            raise ProviderBudgetExceeded("Daily provider attempt limit reached")
