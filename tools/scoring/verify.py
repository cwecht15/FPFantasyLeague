"""Pre-push validation gates (mirrors Data_Suite verify.py's two-tier approach).

Hard failures abort before any cloud write. Soft warnings are logged and the
push continues.
"""

from __future__ import annotations

from typing import Callable

import pandas as pd


class VerificationError(RuntimeError):
    pass


def check_no_duplicate_keys(df: pd.DataFrame, key_cols: list[str], label: str) -> None:
    if df.empty:
        return
    dupes = df.duplicated(subset=key_cols).sum()
    if dupes:
        raise VerificationError(
            f"{label}: {dupes} duplicate rows on key {key_cols} — aggregation bug; refusing to push."
        )


def warn_player_count(offense: pd.DataFrame, log: Callable[[str], None]) -> None:
    """A full NFL slate yields roughly 300–500 offensive stat lines. Flag wildly
    off counts (a tripwire for a partial/broken pbp pull) without aborting."""
    n = len(offense)
    if 0 < n < 100:
        log(f"[verify] WARNING: only {n} offensive stat lines — partial week? (continuing)")
    elif n > 700:
        log(f"[verify] WARNING: {n} offensive stat lines — unexpectedly high (continuing)")


def warn_missing_team(df: pd.DataFrame, log: Callable[[str], None]) -> None:
    if df.empty or "team" not in df.columns:
        return
    missing = df["team"].isna().sum()
    if missing:
        log(f"[verify] WARNING: {missing} stat lines have no weekly_rosters team match (continuing)")
