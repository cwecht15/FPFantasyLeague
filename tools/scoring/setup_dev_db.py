"""One-time local dev bootstrap: create the fpfl_dev database + a dedicated
dev role so the app never needs the postgres superuser credential.

Connects exactly as documented in NFL_Database_Guide/CONNECTION.md (that .env
is the canonical credential store for the local Postgres). Generates a fresh
random password for the new `fpfl_app` role and prints ONLY the resulting dev
DSN so it can be pasted into app/.env.local / tools/scoring/.env — the
superuser password is never echoed or persisted anywhere new.

Run:  C:\\Users\\cwech\\anaconda3\\python.exe tools/scoring/setup_dev_db.py
"""

import os
import secrets
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(r"C:/Users/cwech/Documents/Claude/Projects/NFL_Database_Guide/.env"))

HOST = os.environ.get("NFL_DB_HOST", "localhost")
PORT = int(os.environ.get("NFL_DB_PORT", "5432"))

admin = psycopg2.connect(
    host=HOST,
    port=PORT,
    database="postgres",
    user=os.environ.get("NFL_DB_USER", "postgres"),
    password=os.environ["NFL_DB_PASSWORD"],
)
admin.autocommit = True
cur = admin.cursor()

cur.execute("SELECT 1 FROM pg_roles WHERE rolname = 'fpfl_app'")
role_exists = cur.fetchone() is not None

dev_password = secrets.token_urlsafe(24)
if role_exists:
    # Reset the password so this script is re-runnable (dev-only role).
    cur.execute("ALTER ROLE fpfl_app WITH LOGIN PASSWORD %s", (dev_password,))
    print("role fpfl_app: password reset")
else:
    cur.execute("CREATE ROLE fpfl_app WITH LOGIN PASSWORD %s", (dev_password,))
    print("role fpfl_app: created")

cur.execute("SELECT 1 FROM pg_database WHERE datname = 'fpfl_dev'")
if cur.fetchone() is None:
    cur.execute("CREATE DATABASE fpfl_dev OWNER fpfl_app")
    print("database fpfl_dev: created (owner fpfl_app)")
else:
    cur.execute("ALTER DATABASE fpfl_dev OWNER TO fpfl_app")
    print("database fpfl_dev: already exists (owner ensured)")

cur.close()
admin.close()

dsn = f"postgresql://fpfl_app:{dev_password}@{HOST}:{PORT}/fpfl_dev"
out = Path(__file__).resolve().parent / ".dev_db_dsn"
out.write_text(dsn + "\n", encoding="utf-8")
print(f"dev DSN written to {out} (gitignored folder file; paste into env files)")
