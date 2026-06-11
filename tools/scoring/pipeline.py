"""Headless orchestrator: read NFL_Data -> compute stat lines -> push to app DB.

Called by both the CLI (push_scores.py) and an optional Streamlit UI. Mirrors
Data_Suite's pipeline.run() shape: a single transaction on the destination,
progress via a callback, idempotent upserts so re-runs and stat corrections are
safe.
"""

from __future__ import annotations

import hashlib
import time
from typing import Callable, Optional

import pandas as pd

from . import aggregate, cloud_loader, history, kickoffs, players_sync, verify
from .config import source_pg_config
from .db import connect_dest, connect_source

# Columns that are NOT NULL DEFAULT 0 in player_week_stats — fill NaN with 0 so
# we never try to insert NULL into them (offense/kicker counting stats).
_NOT_NULL_INT = [
    "pass_yds", "pass_td", "pass_int", "pass_2pt",
    "rush_yds", "rush_td", "rush_2pt",
    "receptions", "rec_yds", "rec_td", "rec_2pt", "targets",
    "fumbles_lost",
    # advanced charting (pass/base/pp/epa tables)
    "accurate_throws", "to_worthy_throws", "hero_throws", "pass_air_yds",
    "hero_catches", "drops", "rec_air_yds", "rec_yac", "mtf",
    "pass_yds_5p", "pass_td_5p", "pass_fd_5p", "sacks_taken", "dropbacks",
    "epa_total", "routes", "sep_total", "rush_stuffs", "rush_ybc", "rush_yaco",
    "fg_made_0_19", "fg_made_20_29", "fg_made_30_39", "fg_made_40_49",
    "fg_made_50_plus", "fg_missed", "xp_made",
]
# Nullable stat columns (left NULL when not applicable to a row's kind).
_NULLABLE_STATS = [
    "dst_sacks", "dst_int", "dst_fum_rec", "dst_td", "dst_safeties",
    "dst_blocks", "points_allowed",
]
_KEY = ["gsis_id", "season", "season_type", "week"]
_STATS_COLS = _KEY + ["team"] + _NOT_NULL_INT + _NULLABLE_STATS + ["source_hash"]
_HASH_COLS = _NOT_NULL_INT + _NULLABLE_STATS + ["team"]


def _row_hash(row: pd.Series) -> str:
    parts = []
    for c in _HASH_COLS:
        v = row.get(c)
        parts.append("" if pd.isna(v) else str(v))
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:32]


def _build_stat_lines(off: pd.DataFrame, kick: pd.DataFrame, dst: pd.DataFrame) -> pd.DataFrame:
    """Concat offense/kicker/dst (disjoint gsis_ids) into one player_week_stats
    frame aligned to the app table's columns."""
    frames = []
    for df in (off, kick, dst):
        if df is None or df.empty:
            continue
        d = df.copy()
        if "position" in d.columns:
            d = d.drop(columns=["position"])
        frames.append(d.reindex(columns=_STATS_COLS))
    if not frames:
        return pd.DataFrame(columns=_STATS_COLS)
    out = pd.concat(frames, ignore_index=True)
    for c in _NOT_NULL_INT:
        out[c] = out[c].fillna(0)
    # A player can legitimately appear in two frames (e.g. a kicker who threw a
    # pass on a fake FG -> offense + kicker rows). Merge them into one stat line:
    # counting stats sum (disjoint nonzero), team/nullables take first non-null.
    if out.duplicated(subset=_KEY).any():
        agg = {c: "sum" for c in _NOT_NULL_INT}
        agg.update({c: "first" for c in _NULLABLE_STATS})
        agg["team"] = "first"
        out = out.groupby(_KEY, as_index=False, dropna=False).agg(agg)
        out = out.reindex(columns=[c for c in _STATS_COLS if c != "source_hash"])
    out["source_hash"] = out.apply(_row_hash, axis=1)
    return out


def run(
    season: int,
    week: int,
    seas_type: str = "REG",
    dry_run: bool = False,
    skip_players: bool = False,
    skip_schedule: bool = False,
    progress_cb: Optional[Callable[[str], None]] = None,
) -> dict:
    log: Callable[[str], None] = progress_cb or print
    started = time.time()
    params = {"season": season, "week": week, "seas_type": seas_type, "dry_run": dry_run}

    src = connect_source(source_pg_config())
    try:
        log(f"[agg] offense {season} W{week} {seas_type}")
        offense = aggregate.build_offense(src, season, week, seas_type)
        log(f"[agg] kicker")
        kicker = aggregate.build_kicker(src, season, week, seas_type)
        log(f"[agg] dst")
        dst = aggregate.build_dst(src, season, week, seas_type)

        stats = _build_stat_lines(offense, kicker, dst)
        log(f"[agg] {len(offense)} offense, {len(kicker)} kicker, {len(dst)} dst "
            f"-> {len(stats)} stat lines")

        # player_week_games (team -> game_id) for lineup lock
        tg = kickoffs.team_game_map(src, season, week, seas_type)
        pwg = stats[["gsis_id", "season", "season_type", "week", "team"]].copy()
        pwg["game_id"] = pwg["team"].map(lambda t: tg.get(str(t)) if pd.notna(t) else None)
        pwg = pwg[pwg["game_id"].notna()][
            ["gsis_id", "season", "season_type", "week", "game_id", "team"]
        ]

        games = None if skip_schedule else kickoffs.build_nfl_games(src, season)
        players = None if skip_players else players_sync.build_players(src, season)
    finally:
        src.close()

    # ---- validation gates ----
    verify.check_no_duplicate_keys(stats, _KEY, "player_week_stats")
    verify.warn_player_count(offense, log)
    verify.warn_missing_team(stats, log)

    no_data = stats.empty
    if no_data:
        log("[pipeline] no stat lines for this slice (week not played yet?)")

    result = {
        "offense": len(offense),
        "kicker": len(kicker),
        "dst": len(dst),
        "stat_lines": len(stats),
        "player_week_games": len(pwg),
        "players": 0 if players is None else len(players),
        "nfl_games": 0 if games is None else len(games),
    }

    if dry_run:
        log("[pipeline] dry-run — nothing pushed")
        result["duration_sec"] = round(time.time() - started, 1)
        history.record(params, ok=True, duration_sec=result["duration_sec"], result=result)
        return result

    # ---- push (one transaction) ----
    dest = connect_dest()
    try:
        if players is not None and not players.empty:
            r = cloud_loader.upsert(dest, "players", players, ["gsis_id"])
            log(f"[push] players: {r}")
        if games is not None and not games.empty:
            r = cloud_loader.upsert(dest, "nfl_games", games, ["game_id"])
            log(f"[push] nfl_games: {r}")

        slice_params = {"season": season, "season_type": seas_type, "week": week}
        r = cloud_loader.upsert(
            dest, "player_week_games", pwg, _KEY,
            slice_cols=["season", "season_type", "week"], slice_params=slice_params,
        )
        log(f"[push] player_week_games: {r}")

        r = cloud_loader.upsert(
            dest, "player_week_stats", stats, _KEY,
            slice_cols=["season", "season_type", "week"], slice_params=slice_params,
            hash_guard=True,
        )
        log(f"[push] player_week_stats: {r}")
        changed = r["affected"]

        # signal the app which slice changed (resets processed_at -> rescore)
        dirty = pd.DataFrame([{
            "season": season, "season_type": seas_type, "week": week,
            "changed_count": changed, "processed_at": None,
        }])
        cloud_loader.upsert(dest, "score_dirty", dirty, ["season", "season_type", "week"])

        dest.commit()
        log("[push] COMMIT ok")
    except Exception:
        dest.rollback()
        log("[push] ROLLBACK — nothing applied")
        raise
    finally:
        dest.close()

    result["changed"] = changed
    result["duration_sec"] = round(time.time() - started, 1)
    history.record(params, ok=True, duration_sec=result["duration_sec"], result=result)
    log(f"[pipeline] done in {result['duration_sec']}s")
    return result
