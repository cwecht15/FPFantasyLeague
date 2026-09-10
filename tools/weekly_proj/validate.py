"""Step 7: sanity checks on the week that was just built.

The weekly workbook is a working spreadsheet that gets rewritten every week, so
the failure this guards against is a column moving and a whole position quietly
scoring zero. Every check prints PASS, WARN or FAIL; any FAIL exits nonzero.

Run:  python -m tools.weekly_proj.validate [--week N]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

import numpy as np
import pandas as pd

from . import config
from .build_week import optimize, starter_slots
from .project_week import latest_week, load_weekly, load_working

# Routes per dropback. Every dropback sends roughly four receivers out, and the
# observed spread across 32 teams is tight (mean 4.3, SD 0.2), so a team outside
# this band means a column moved, not an unusual scheme.
ROUTES_PER_DB = (3.0, 5.5)
ROUTES_OUTLIER_SD = 4.0
TARGETS_PER_DB = (0.70, 1.05)
STALE_DAYS = 45

results: list[tuple[str, str, str]] = []


def rec(level: str, name: str, detail: str) -> None:
    results.append((level, name, detail))


def check_sheet(week: int) -> None:
    wk = load_weekly(week)
    wp = load_working(week)
    df = wk.merge(wp, on="gsis_id", how="left").fillna({"routes": 0, "carries": 0, "sacks": 0})

    bad_cmp = df[df["cmp"] > df["pass_att"] + 0.01]
    rec("FAIL" if len(bad_cmp) else "PASS", "completions <= attempts",
        f"{len(bad_cmp)} violations")
    bad_att = df[df["pass_att"] > df["dropbacks"] + 0.01]
    rec("FAIL" if len(bad_att) else "PASS", "attempts <= dropbacks",
        f"{len(bad_att)} violations")
    bad_rec = df[df["rec"] > df["targets"] + 0.01]
    rec("FAIL" if len(bad_rec) else "PASS", "receptions <= targets",
        f"{len(bad_rec)} violations")
    tgt = df[df["targets"] > 0.5]
    bad_rte = tgt[tgt["routes"] < tgt["targets"]]
    rec("WARN" if len(bad_rte) else "PASS", "routes >= targets",
        f"{len(bad_rte)} players with more targets than routes")
    rec("PASS" if len(df) > 300 else "FAIL", "sheet size", f"{len(df)} projected players")


def check_volume(week: int) -> None:
    wk = load_weekly(week)
    wp = load_working(week)
    df = wk.merge(wp, on="gsis_id", how="left").fillna({"routes": 0})
    by_team = df.groupby("team").agg(db=("dropbacks", "sum"), rte=("routes", "sum"),
                                     tgt=("targets", "sum"))
    by_team = by_team[by_team["db"] > 0]
    rpd = by_team["rte"] / by_team["db"]
    off = rpd[(rpd < ROUTES_PER_DB[0]) | (rpd > ROUTES_PER_DB[1])]
    rec("FAIL" if len(off) else "PASS", "routes per dropback",
        f"median {rpd.median():.2f} across {len(rpd)} teams, band "
        f"{ROUTES_PER_DB[0]}-{ROUTES_PER_DB[1]}"
        + (f", off: {list(off.index)}" if len(off) else ""))
    sd = float(rpd.std())
    odd = rpd[(rpd - rpd.median()).abs() > ROUTES_OUTLIER_SD * sd] if sd > 0 else rpd[[]]
    rec("WARN" if len(odd) else "PASS", "no single-team route outlier",
        f"spread {sd:.2f}" + (f", outliers: {list(odd.index)}" if len(odd) else ""))
    tpd = by_team["tgt"] / by_team["db"]
    off2 = tpd[(tpd < TARGETS_PER_DB[0]) | (tpd > TARGETS_PER_DB[1])]
    rec("WARN" if len(off2) else "PASS", "targets per dropback",
        f"median {tpd.median():.2f}" + (f", off: {list(off2.index)}" if len(off2) else ""))


def check_coverage(week: int) -> None:
    state = json.load(open(config.week_file(week, "league_state.json"), encoding="utf-8"))
    pts = {p["gsisId"]: p["points"]
           for p in json.load(open(config.week_file(week, "projected_points.json"),
                                   encoding="utf-8"))}
    kickoffs = state["kickoffs"]
    missing, bye = [], []
    for r in state["roster"]:
        gid = r["gsis_id"]
        meta = state["players"].get(gid, {})
        if gid in pts:
            continue
        if meta.get("team") not in kickoffs:
            bye.append(meta.get("name", gid))
        else:
            missing.append(meta.get("name", gid))
    rec("FAIL" if missing else "PASS", "every rostered player accounted for",
        f"{len(missing)} unexplained" + (f": {missing[:5]}" if missing else "")
        + (f", {len(bye)} on bye" if bye else ""))


def check_optimizer(week: int) -> None:
    """Greedy assignment vs a real max-weight matching."""
    try:
        from scipy.optimize import linear_sum_assignment
    except ImportError:
        rec("WARN", "optimizer agreement", "scipy not available, skipped")
        return
    state = json.load(open(config.week_file(week, "league_state.json"), encoding="utf-8"))
    pts = {p["gsisId"]: p["points"]
           for p in json.load(open(config.week_file(week, "projected_points.json"),
                                   encoding="utf-8"))}
    pos = {g: m["pos"] for g, m in state["players"].items()}
    slots = starter_slots(state["rosterTemplate"])
    rosters = {}
    for r in state["roster"]:
        rosters.setdefault(r["team_id"], []).append(r["gsis_id"])

    diffs = []
    for tid, roster in rosters.items():
        _, greedy = optimize(roster, slots, pts, pos)
        n, m = len(roster), len(slots)
        size = max(n, m)
        cost = np.full((size, size), 1e6)
        for i, gid in enumerate(roster):
            for j, (_, _, elig) in enumerate(slots):
                if pos.get(gid) in elig:
                    cost[i, j] = -pts.get(gid, 0.0)
        rows, cols = linear_sum_assignment(cost)
        exact = round(-sum(cost[r_][c] for r_, c in zip(rows, cols) if cost[r_][c] < 1e5), 2)
        if abs(exact - greedy) > 0.011:
            diffs.append((tid, greedy, exact))
    rec("FAIL" if diffs else "PASS", "lineup optimizer is optimal",
        f"{len(rosters)} teams checked against max-weight matching"
        + (f", disagreements: {diffs}" if diffs else ""))


def check_freshness() -> None:
    stale = []
    for path in (config.PLAYER_RATES_CSV, config.ROOKIE_PRIORS_CSV, config.COACH_SEASON_CSV):
        if not os.path.exists(path):
            rec("FAIL", "rate inputs present", f"missing {os.path.basename(path)}")
            return
        age = (time.time() - os.path.getmtime(path)) / 86400
        if age > STALE_DAYS:
            stale.append(f"{os.path.basename(path)} {age:.0f}d")
    rec("WARN" if stale else "PASS", "charting rates are current",
        ", ".join(stale) if stale else f"all rate inputs under {STALE_DAYS} days old")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--week", type=int)
    args = ap.parse_args()
    week = args.week or latest_week()

    for fn in (check_sheet, check_volume, check_coverage, check_optimizer):
        try:
            fn(week)
        except Exception as exc:
            rec("FAIL", fn.__name__, f"{exc.__class__.__name__}: {exc}")
    check_freshness()

    width = max(len(n) for _, n, _ in results)
    print(f"week {week} validation")
    for level, name, detail in results:
        print(f"  {level:<4} {name:<{width}}  {detail}")
    fails = sum(1 for lv, _, _ in results if lv == "FAIL")
    warns = sum(1 for lv, _, _ in results if lv == "WARN")
    print(f"  {len(results) - fails - warns} passed, {warns} warned, {fails} failed")
    if fails:
        sys.exit(1)


if __name__ == "__main__":
    sys.exit(main())
