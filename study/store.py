import csv
import hashlib
import io
import json
import secrets
import sqlite3
import time
from pathlib import Path


class StateConflict(Exception):
    pass


class Store:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, started REAL NOT NULL, state TEXT NOT NULL, payload TEXT NOT NULL, updated REAL NOT NULL)")

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    @staticmethod
    def hash_secret(secret):
        return hashlib.sha256(secret.encode()).hexdigest()

    def create(self, session_id, secret, payload):
        now = time.time()
        with self.connect() as db:
            db.execute("INSERT OR IGNORE INTO sessions VALUES (?,?,?,?,?,?)", (session_id, self.hash_secret(secret), now, "intake", json.dumps(payload, ensure_ascii=False), now))
        return self.get(session_id, secret)

    def get(self, session_id, secret):
        with self.connect() as db:
            row = db.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
        if not row or not secrets.compare_digest(row["secret_hash"], self.hash_secret(secret)):
            raise PermissionError("Unknown session")
        return {"id": row["id"], "started": row["started"], "state": row["state"], "updated": row["updated"], "data": json.loads(row["payload"])}

    def transition(self, session_id, secret, expected, target, patch):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
            if not row or not secrets.compare_digest(row["secret_hash"], self.hash_secret(secret)):
                raise PermissionError("Unknown session")
            if row["state"] not in expected:
                raise StateConflict(row["state"])
            payload = json.loads(row["payload"])
            payload.update(patch)
            db.execute("UPDATE sessions SET state=?,payload=?,updated=? WHERE id=?", (target, json.dumps(payload, ensure_ascii=False), time.time(), session_id))
        return self.get(session_id, secret)

    def withdraw(self, session_id, secret):
        self.get(session_id, secret)
        with self.connect() as db:
            db.execute("UPDATE sessions SET state='withdrawn',payload=?,updated=? WHERE id=?", (json.dumps({"withdrawn": True, "withdrawn_at": time.time()}), time.time(), session_id))

    def mark_viewed(self, session_id, secret, slot, timestamp):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
            if not row or not secrets.compare_digest(row["secret_hash"], self.hash_secret(secret)):
                raise PermissionError("Unknown session")
            if row["state"] != "recommended":
                raise StateConflict(row["state"])
            data = json.loads(row["payload"])
            data.setdefault("viewed", {}).setdefault(slot, timestamp)
            db.execute("UPDATE sessions SET payload=?,updated=? WHERE id=?", (json.dumps(data, ensure_ascii=False), time.time(), session_id))
        return self.get(session_id, secret)

    def export(self):
        with self.connect() as db:
            rows = db.execute("SELECT id,started,payload FROM sessions WHERE state='complete' ORDER BY started").fetchall()
        return self.export_rows(rows)

    @staticmethod
    def export_rows(rows):
        columns = ["participant_id", "pilot", "consent", "q5_usage", "q6_experience", "q21_budget", "scenario", "pre1", "pre2", "pre3", "post1", "post2", "post3", "relevance_A", "relevance_B", "order_AB", "satisfaction", "clarity", "usefulness", "intention", "use_again", "attention_ok", "duration_sec", "lca_class"]
        stream = io.StringIO(newline="")
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        audit = []
        for row in rows:
            data = json.loads(row["payload"])
            record = data["analysis_row"]
            writer.writerow({k: record.get(k, "") for k in columns})
            audit.append({"participant_id": row["id"], "started": row["started"], **data})
        return stream.getvalue(), audit
