"""Step 3: weekly COACH-XX stat lines (one per team playing this week).

Scheme usage is a team property that does not move week to week, so the rates
come straight from the draft guide's coach_stat_lines.csv (already blended
2024+2025 and already shrunk 50% toward the mean for teams with a new
playcaller). Only two things are weekly:

  volume  paDropbacks / motionDropbacks scale with this week's projected
          dropbacks, summed from the sheet's own per-player DB projections.
          Team_Projections "Pass Plays" is used as a cross-check only, because
          a dropback is attempts plus sacks plus scrambles.

  result  teamWin and the 30-point bonus come from the market. With spread S
          (team-relative, negative = favored) and the sheet's projected team
          points P:
            teamWin = P(margin >= 1) = 1 - Phi((0.5 - (-S)) / sigma_margin)
            exp30   = P(points >= 30) = 1 - Phi((30 - P) / sigma_points)
          sigma_points is coach_model.score_sigma (2021-2025 within-team score
          SD); sigma_margin = sqrt(2) * sigma_points, which lands near the
          familiar 13.5-point NFL spread error.

Run:  python -m tools.weekly_proj.coach_week [--week N]
Out:  out/wk<NN>/coach_stat_lines.csv
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys

import pandas as pd

from . import config
from .project_week import latest_week, load_weekly

SIGMA_CACHE = os.path.join(config.OUT_DIR, "score_sigma.json")
SIGMA_FALLBACK = 9.8
SEASON_GAMES = 17.0
MIN_SPREAD_CORR = 0.5


def _num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s.astype(str).str.replace(",", "", regex=False)
                         .str.replace("%", "", regex=False), errors="coerce")


def _phi(z: float) -> float:
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def score_sigma() -> float:
    """Points-scored SD, from NFL_Data via the season coach model, cached."""
    if os.path.exists(SIGMA_CACHE):
        with open(SIGMA_CACHE, encoding="utf-8") as f:
            return float(json.load(f)["sigmaPoints"])
    try:
        import psycopg2

        from tools.draft_guide.coach_model import score_sigma as dg_sigma

        conn = psycopg2.connect(config.nfl_data_dsn())
        conn.set_session(readonly=True)
        try:
            sigma = dg_sigma(conn)
        finally:
            conn.close()
    except Exception as exc:  # NFL_Data down: the season model's value is stable
        print(f"  warn: could not fit score sigma ({exc.__class__.__name__}), "
              f"using {SIGMA_FALLBACK}")
        sigma = SIGMA_FALLBACK
    os.makedirs(config.OUT_DIR, exist_ok=True)
    with open(SIGMA_CACHE, "w", encoding="utf-8") as f:
        json.dump({"sigmaPoints": sigma}, f)
    return sigma


def load_team_projections(week: int) -> pd.DataFrame:
    tp = pd.read_csv(config.week_file(week, config.TABS["Team_Projections"]))
    tp.columns = [str(c).strip() for c in tp.columns]
    tp = tp[tp["Team"].astype(str).str.strip() != ""].copy()
    tp["team"] = tp["Team"].astype(str).str.strip().map(config.house_team)
    tp["opp"] = tp["Opp"].astype(str).str.strip().map(config.house_team)
    tp["points"] = _num(tp["Points"])
    tp["pass_plays"] = _num(tp["Pass Plays"])
    return tp[["team", "opp", "points", "pass_plays"]].dropna(subset=["team"])


def load_odds(week: int) -> pd.DataFrame:
    raw = pd.read_csv(config.week_file(week, config.TABS["Odds"]), dtype=str).fillna("")
    raw.columns = [str(c).strip() for c in raw.columns]
    need = ["Season", "Week", "Point Spread", "OverUnder", "Home Team", "Away Team"]
    for c in need:
        if c not in raw.columns:
            raise SystemExit(f"Odds tab is missing column {c!r} (has {list(raw.columns)[:8]})")
    o = raw[need].copy()
    o = o[o["Home Team"].str.strip() != ""]
    o["home"] = o["Home Team"].str.strip().map(config.house_team)
    o["away"] = o["Away Team"].str.strip().map(config.house_team)
    o["spread"] = _num(o["Point Spread"])
    o["total"] = _num(o["OverUnder"])
    o = o.dropna(subset=["spread", "total"]).drop_duplicates("home")
    return o[["home", "away", "spread", "total"]]


def team_spreads(odds: pd.DataFrame, tp: pd.DataFrame) -> pd.DataFrame:
    """Team-relative spread, with the sheet's own projections proving the sign."""
    pts = tp.set_index("team")["points"]
    diff = odds["home"].map(pts) - odds["away"].map(pts)
    ok = diff.notna() & odds["spread"].notna()
    corr = float((-odds.loc[ok, "spread"]).corr(diff[ok])) if ok.sum() > 3 else 0.0
    if abs(corr) < MIN_SPREAD_CORR:
        raise SystemExit(
            f"cannot establish the Odds spread orientation (corr={corr:.2f}); "
            f"check the Point Spread column before trusting COACH win projections"
        )
    home_sign = 1.0 if corr > 0 else -1.0
    print(f"  spread orientation: {'home-relative, negative = favored' if home_sign > 0 else 'flipped'}"
          f" (corr {corr:+.2f} vs projected point differential)")
    rows = []
    for _, g in odds.iterrows():
        s = home_sign * g["spread"]
        rows.append({"team": g["home"], "spread": s, "total": g["total"], "opp": g["away"]})
        rows.append({"team": g["away"], "spread": -s, "total": g["total"], "opp": g["home"]})
    return pd.DataFrame(rows)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--week", type=int)
    args = ap.parse_args()
    week = args.week or latest_week()

    season = pd.read_csv(config.COACH_SEASON_CSV)
    tp = load_team_projections(week)
    odds = load_odds(week)
    spreads = team_spreads(odds, tp)

    # This week's dropbacks: the sheet's own per-player DB projections summed by
    # team. Pass Plays is a cross-check because it counts attempts, not dropbacks.
    wk = load_weekly(week)
    dbs = wk.groupby("team")["dropbacks"].sum().rename("db_week")
    t = (season.assign(team=season["team"].map(config.house_team))
         .merge(tp, on="team", how="left")
         .merge(spreads, on="team", how="left", suffixes=("", "_odds"))
         .merge(dbs, on="team", how="left"))

    playing = t["db_week"].notna() & (t["db_week"] > 0) & t["spread"].notna()
    ratio = (t.loc[playing, "db_week"] / t.loc[playing, "pass_plays"]).dropna()
    if len(ratio):
        off = ratio[(ratio < 0.8) | (ratio > 1.2)]
        print(f"  dropbacks vs Pass Plays: median {ratio.median():.2f}x"
              + (f" | {len(off)} team(s) outside +/-20%: "
                 f"{sorted(t.loc[off.index, 'team'])}" if len(off) else ""))
    t.loc[~playing, "db_week"] = t.loc[~playing, "pass_plays"].fillna(0.0)

    sigma_pts = score_sigma()
    sigma_margin = math.sqrt(2.0) * sigma_pts
    mu = -t["spread"]
    t["win_p"] = [(_phi((m - 0.5) / sigma_margin) if pd.notna(m) else 0.0) for m in mu]
    t["exp30"] = [(1.0 - _phi((30.0 - p) / sigma_pts)) if pd.notna(p) else 0.0
                  for p in t["points"]]
    t["bye"] = ~playing
    for c in ("db_week", "win_p", "exp30", "points"):
        t.loc[t["bye"], c] = 0.0

    out = pd.DataFrame({
        "gsisId": "COACH-" + t["team"],
        "name": t["team"] + " Coaching Staff",
        "position": "COACH",
        "team": t["team"],
        "games": 1.0,
        "paDropbacks": t["ctx_pa_rate"] * t["db_week"],
        "motionDropbacks": t["ctx_motion_rate"] * t["db_week"],
        "fourthDownAttempts": t["fourthDownAttempts"] / SEASON_GAMES,
        "run2ndLong": t["run2ndLong"] / SEASON_GAMES,
        "deep2ndShort": t["deep2ndShort"] / SEASON_GAMES,
        "teamWin": t["win_p"],
        "exp30": t["exp30"],
        "ctx_opp": t["opp"],
        "ctx_spread": t["spread"],
        "ctx_total": t["total"],
        "ctx_team_points": t["points"],
        "ctx_db_week": t["db_week"],
        "ctx_pa_rate": t["ctx_pa_rate"],
        "ctx_motion_rate": t["ctx_motion_rate"],
        "ctx_new_staff": t["ctx_new_staff"],
        "ctx_playcaller": t["ctx_playcaller"],
        "ctx_bye": t["bye"],
    })
    for c in ("fourthDownAttempts", "run2ndLong", "deep2ndShort",
              "paDropbacks", "motionDropbacks"):
        out.loc[t["bye"].values, c] = 0.0

    dest = config.week_file(week, "coach_stat_lines.csv")
    out.to_csv(dest, index=False)
    print(f"week {week} coach_stat_lines.csv: {len(out)} teams "
          f"({int(t['bye'].sum())} on bye) | sigma pts {sigma_pts:.2f}, "
          f"margin {sigma_margin:.2f}")
    show = out[~t["bye"].values].copy()
    show["P(win)"] = show["teamWin"].round(2)
    show["P(30+)"] = show["exp30"].round(2)
    print(show[["team", "ctx_opp", "ctx_spread", "ctx_team_points", "ctx_db_week",
                "paDropbacks", "motionDropbacks", "P(win)", "P(30+)"]]
          .round(1).sort_values("P(win)", ascending=False).to_string(index=False))


if __name__ == "__main__":
    sys.exit(main())
