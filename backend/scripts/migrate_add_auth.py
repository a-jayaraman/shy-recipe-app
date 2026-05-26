"""
Migration: add users table and audit columns to recipes.
Idempotent — safe to run multiple times.
"""
import os
import sqlite3
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

db_url = os.environ.get("DATABASE_URL", "./recipes.db")
db_path = db_url.replace("sqlite:///", "").replace("sqlite://", "")

print(f"Connecting to {db_path}")
conn = sqlite3.connect(db_path)
conn.execute("PRAGMA foreign_keys = ON")
cur = conn.cursor()

# 1. Create users table
cur.execute("""
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    google_sub    TEXT UNIQUE NOT NULL,
    email         TEXT NOT NULL,
    name          TEXT,
    picture_url   TEXT,
    role          TEXT NOT NULL DEFAULT 'viewer',
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT,
    last_login_at TEXT
)
""")
print("users table: OK")

# 2. Indexes on users
cur.execute("CREATE INDEX IF NOT EXISTS ix_users_email ON users (email)")
cur.execute("CREATE INDEX IF NOT EXISTS ix_users_role  ON users (role)")
print("users indexes: OK")

# 3. Audit columns on recipes (idempotent via try/except)
for col in ("created_by_user_id", "updated_by_user_id"):
    try:
        cur.execute(f"ALTER TABLE recipes ADD COLUMN {col} INTEGER REFERENCES users(id)")
        print(f"recipes.{col}: added")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print(f"recipes.{col}: already exists, skipping")
        else:
            raise

conn.commit()
conn.close()
print("Migration complete.")
