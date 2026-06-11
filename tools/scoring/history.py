"""Per-run JSON logs under tools/scoring/history/ (adapted from Data_Suite).
One file per run so inspecting a bad push is a single file open."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from .config import THIS_DIR

HISTORY_DIR: Path = THIS_DIR / "history"
MAX_ENTRIES: int = 200


def record(
    params: dict[str, Any],
    ok: bool,
    duration_sec: float,
    error: Optional[str] = None,
    result: Optional[dict[str, Any]] = None,
) -> Optional[Path]:
    HISTORY_DIR.mkdir(exist_ok=True)
    now = datetime.now()
    entry = {
        "ts": now.isoformat(timespec="seconds"),
        "source": "scoring",
        "ok": bool(ok),
        "duration_sec": float(duration_sec),
        "params": params,
        "error": error,
        "result": result or {},
    }
    path = HISTORY_DIR / f"{now.strftime('%Y%m%d-%H%M%S')}-scoring.json"
    if path.exists():
        path = HISTORY_DIR / f"{now.strftime('%Y%m%d-%H%M%S-%f')}-scoring.json"
    try:
        path.write_text(json.dumps(entry, indent=2, default=str))
    except Exception:  # noqa: BLE001
        return None
    _prune()
    return path


def _prune(max_entries: int = MAX_ENTRIES) -> None:
    if not HISTORY_DIR.exists():
        return
    files = sorted(HISTORY_DIR.glob("*.json"))
    excess = len(files) - max_entries
    for f in files[:excess] if excess > 0 else []:
        try:
            f.unlink()
        except OSError:
            pass
