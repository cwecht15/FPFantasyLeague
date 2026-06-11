"""Database connection helpers.

The source (NFL_Data) is opened READ-ONLY at the session level so an accidental
write raises immediately — a hard guarantee on top of the frozen-schema
convention documented in NFL_Database_Guide/CONNECTION.md.
"""

from __future__ import annotations

import psycopg2

from .config import PgConfig, app_db_url


def connect_source(cfg: PgConfig):
    conn = psycopg2.connect(**cfg.kwargs(), connect_timeout=5)
    # Enforce read-only: any INSERT/UPDATE/DDL will error.
    conn.set_session(readonly=True, autocommit=True)
    return conn


def connect_dest():
    """Cloud app Postgres. autocommit off — the loader manages one txn per run."""
    conn = psycopg2.connect(app_db_url(), connect_timeout=10)
    conn.autocommit = False
    return conn


def test_source(cfg: PgConfig) -> tuple[bool, str]:
    try:
        conn = connect_source(cfg)
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM pbp")
            n = cur.fetchone()[0]
        conn.close()
        return True, f"connected — pbp has {n:,} rows"
    except Exception as e:  # noqa: BLE001
        return False, str(e)


def test_dest() -> tuple[bool, str]:
    try:
        conn = connect_dest()
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM pg_tables WHERE schemaname='public'")
            n = cur.fetchone()[0]
        conn.close()
        return True, f"connected — {n} tables in public schema"
    except Exception as e:  # noqa: BLE001
        return False, str(e)
