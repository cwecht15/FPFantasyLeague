"""Configuration for the fantasy scoring pipeline.

Two databases:
  - SOURCE: the local NFL_Data Postgres (read-only). Same env var names as
    NFL_Database_Guide so the existing .env values carry over.
  - DEST:   the cloud app Postgres (Neon), via a full APP_DB_URL DSN.

Secrets come from tools/scoring/.env (gitignored). Paths resolve from this
file's location so the pipeline runs regardless of cwd.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

THIS_DIR = Path(__file__).resolve().parent

load_dotenv(THIS_DIR / ".env")


@dataclass(frozen=True)
class PgConfig:
    host: str
    port: int
    name: str
    user: str
    password: str

    def kwargs(self) -> dict:
        return {
            "host": self.host,
            "port": self.port,
            "database": self.name,
            "user": self.user,
            "password": self.password,
        }


def source_pg_config() -> PgConfig:
    """Local NFL_Data. Connections are opened read-only (see db.connect_source)."""
    return PgConfig(
        host=os.environ.get("NFL_DB_HOST", "localhost"),
        port=int(os.environ.get("NFL_DB_PORT", "5432")),
        name=os.environ.get("NFL_DB_NAME", "NFL_Data"),
        user=os.environ.get("NFL_DB_USER", "postgres"),
        password=os.environ["NFL_DB_PASSWORD"],
    )


def app_db_url() -> str:
    """Full DSN for the cloud app Postgres (Neon)."""
    url = os.environ.get("APP_DB_URL")
    if not url:
        raise RuntimeError("APP_DB_URL is not set in tools/scoring/.env")
    return url
