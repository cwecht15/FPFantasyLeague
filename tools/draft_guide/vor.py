"""Step 7: ranks, VOR, tiers -> out/projections.json (the guide's data file).

VOR baselines for 12 teams x (QB/RB/RB/WR/WR/TE/FLEX/COACH):
  QB13, TE13, COACH13 fixed; RB/WR baselines are data-driven — the 12 FLEX
  slots go to the best remaining RB/WR/TE by projected points, and each
  position's baseline is starters + flex-taken + 1.

Tiers: walk each position sorted by points; break where the drop to the next
player exceeds max(6 pts, 1.5 x the median gap among the surrounding 8).

Run:  C:\\Users\\cwech\\anaconda3\\python.exe -m tools.draft_guide.vor
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np
import pandas as pd

from . import config

TEAMS = 12
STARTERS = {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "COACH": 1}
FLEX_ELIGIBLE = {"RB", "WR", "TE"}


def tier_breaks(points: list[float]) -> list[int]:
    """Tier number per index (1-based), on a descending points list."""
    tiers = [1] * len(points)
    if len(points) < 3:
        return tiers
    gaps = [points[i] - points[i + 1] for i in range(len(points) - 1)]
    tier = 1
    for i in range(len(points) - 1):
        lo, hi = max(0, i - 4), min(len(gaps), i + 4)
        med = float(np.median(gaps[lo:hi])) if hi > lo else 0.0
        if tier < 8 and gaps[i] > max(6.0, 1.5 * med):
            tier += 1
        if i + 1 < len(points):
            tiers[i + 1] = tier
    return tiers


def main() -> None:
    lines = pd.read_csv(os.path.join(config.OUT_DIR, "projected_stat_lines.csv"))
    pts = pd.DataFrame(json.load(open(os.path.join(config.OUT_DIR, "projected_points.json"), encoding="utf-8")))
    df = lines.merge(pts, on="gsisId", how="inner")
    df["ppg"] = (df["points"] / df["games"].replace(0, np.nan)).round(2)

    # --- flex-adjusted baselines --------------------------------------------
    baselines: dict[str, int] = {}
    starter_cut = {p: TEAMS * n for p, n in STARTERS.items()}
    ranked = {p: df[df["position"] == p].sort_values("points", ascending=False).reset_index(drop=True)
              for p in df["position"].unique()}
    leftovers = []
    for p in FLEX_ELIGIBLE:
        r = ranked[p]
        leftovers.append(r.iloc[starter_cut[p]:].assign(_pos=p))
    pool = pd.concat(leftovers).sort_values("points", ascending=False)
    flex_taken = pool.head(TEAMS)["_pos"].value_counts().to_dict()
    for p in STARTERS:
        baselines[p] = starter_cut[p] + flex_taken.get(p, 0) + 1

    def baseline_points(p: str) -> float:
        r = ranked[p]
        idx = min(baselines[p] - 1, len(r) - 1)
        return float(r.iloc[idx]["points"])

    base_pts = {p: baseline_points(p) for p in STARTERS}
    df["vor"] = df.apply(lambda r: round(r["points"] - base_pts[r["position"]], 1), axis=1)

    # --- ranks + tiers -------------------------------------------------------
    df = df.sort_values("vor", ascending=False).reset_index(drop=True)
    df["overallRank"] = df.index + 1
    df["posRank"] = df.groupby("position")["points"].rank(ascending=False, method="first").astype(int)
    df["tier"] = 0
    for p, r in ranked.items():
        order = df[df["position"] == p].sort_values("points", ascending=False)
        tiers = tier_breaks(order["points"].tolist())
        df.loc[order.index, "tier"] = tiers

    payload = {
        "season": config.SEASON,
        "league": config.LEAGUE_SLUG,
        "generated": pd.Timestamp.now().strftime("%Y-%m-%d"),
        "baselines": {p: {"rank": baselines[p], "points": round(base_pts[p], 1)} for p in STARTERS},
        "rules": json.load(open(os.path.join(config.OUT_DIR, "league_rules.json"), encoding="utf-8")),
        "players": json.loads(df.to_json(orient="records")),
    }
    with open(os.path.join(config.OUT_DIR, "projections.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f)

    print(f"projections.json: {len(df)} players | baselines: "
          + ", ".join(f"{p}{baselines[p]}={base_pts[p]:.0f}" for p in STARTERS))
    top = df.head(15)[["overallRank", "name", "position", "team", "points", "ppg", "vor", "tier"]]
    print(top.to_string(index=False))


if __name__ == "__main__":
    sys.exit(main())
