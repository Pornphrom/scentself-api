"""PostgreSQL persistence with the same state/export contract as local SQLite."""
import json
import secrets
import time
from datetime import datetime, timezone

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict
from psycopg.rows import dict_row

from .provider_budget import ProviderBudgetExceeded
from .store import StateConflict, Store


def validate_database_url(url):
    try:
        info = conninfo_to_dict(url)
    except (psycopg.Error, ValueError):
        raise ValueError("Invalid PostgreSQL connection configuration") from None
    if not info.get("host") or not info.get("dbname") or info.get("sslmode") not in {"require", "verify-ca", "verify-full"}:
        raise ValueError("Hosted PostgreSQL requires a host, database and TLS")


class PostgresStore:
    def __init__(self, url, mode="pilot"):
        validate_database_url(url)
        if mode not in {"pilot", "live"}:
            raise ValueError("Unknown study storage mode")
        self._url = url
        self.table = sql.Identifier(f"scentself_{mode}_sessions")
        self.budget_table = sql.Identifier(f"scentself_{mode}_provider_attempts")
        with self.connect() as db:
            db.execute(sql.SQL("""CREATE TABLE IF NOT EXISTS {} (
                id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, started DOUBLE PRECISION NOT NULL,
                state TEXT NOT NULL, payload TEXT NOT NULL, updated DOUBLE PRECISION NOT NULL)""").format(self.table))
            db.execute(sql.SQL("CREATE TABLE IF NOT EXISTS {} (day TEXT PRIMARY KEY, attempts INTEGER NOT NULL)").format(self.budget_table))

    def connect(self):
        try:
            return psycopg.connect(self._url, row_factory=dict_row, connect_timeout=10, prepare_threshold=None)
        except psycopg.Error:
            raise RuntimeError("Study database connection unavailable") from None

    @staticmethod
    def _authorize(row, secret):
        if not row or not secrets.compare_digest(row["secret_hash"], Store.hash_secret(secret)):
            raise PermissionError("Unknown session")

    def _locked(self, db, sid, secret):
        row = db.execute(sql.SQL("SELECT * FROM {} WHERE id=%s FOR UPDATE").format(self.table), (sid,)).fetchone()
        self._authorize(row, secret)
        return row

    def create(self, session_id, secret, payload):
        now = time.time()
        with self.connect() as db:
            db.execute(sql.SQL("INSERT INTO {} VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING").format(self.table),
                       (session_id, Store.hash_secret(secret), now, "intake", json.dumps(payload, ensure_ascii=False), now))
        return self.get(session_id, secret)

    def get(self, session_id, secret):
        with self.connect() as db:
            row = db.execute(sql.SQL("SELECT * FROM {} WHERE id=%s").format(self.table), (session_id,)).fetchone()
        self._authorize(row, secret)
        return {"id": row["id"], "started": row["started"], "state": row["state"], "updated": row["updated"], "data": json.loads(row["payload"])}

    def transition(self, session_id, secret, expected, target, patch):
        with self.connect() as db:
            row = self._locked(db, session_id, secret)
            if row["state"] not in expected:
                raise StateConflict(row["state"])
            payload = json.loads(row["payload"])
            payload.update(patch)
            db.execute(sql.SQL("UPDATE {} SET state=%s,payload=%s,updated=%s WHERE id=%s").format(self.table),
                       (target, json.dumps(payload, ensure_ascii=False), time.time(), session_id))
        return self.get(session_id, secret)

    def withdraw(self, session_id, secret):
        with self.connect() as db:
            self._locked(db, session_id, secret)
            now = time.time()
            payload = json.dumps({"withdrawn": True, "withdrawn_at": now})
            db.execute(sql.SQL("UPDATE {} SET state='withdrawn',payload=%s,updated=%s WHERE id=%s").format(self.table),
                       (payload, now, session_id))

    def mark_viewed(self, session_id, secret, slot, timestamp):
        with self.connect() as db:
            row = self._locked(db, session_id, secret)
            if row["state"] != "recommended":
                raise StateConflict(row["state"])
            payload = json.loads(row["payload"])
            payload.setdefault("viewed", {}).setdefault(slot, timestamp)
            db.execute(sql.SQL("UPDATE {} SET payload=%s,updated=%s WHERE id=%s").format(self.table),
                       (json.dumps(payload, ensure_ascii=False), time.time(), session_id))
        return self.get(session_id, secret)

    def reserve_provider_attempt(self, limit):
        day = datetime.now(timezone.utc).date().isoformat()
        with self.connect() as db:
            row = db.execute(sql.SQL("""INSERT INTO {} AS budget (day,attempts) VALUES (%s,1)
                ON CONFLICT (day) DO UPDATE SET attempts=budget.attempts+1
                WHERE budget.attempts < %s RETURNING attempts""").format(self.budget_table), (day, limit)).fetchone()
            if not row:
                raise ProviderBudgetExceeded("Daily provider attempt limit reached")

    def export(self):
        with self.connect() as db:
            rows = db.execute(sql.SQL("SELECT id,started,payload FROM {} WHERE state='complete' ORDER BY started").format(self.table)).fetchall()
        return Store.export_rows(rows)
