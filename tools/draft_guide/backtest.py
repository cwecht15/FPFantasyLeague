"""Step 8: validate the rate model out-of-sample.

Derive rates from 2024 ONLY, apply them to each player's ACTUAL 2025 volume
(dropbacks / rush att / receptions / targets / routes), score both the
predicted and the actual 2025 stat lines with the real engine (league rules),
and compare. This isolates the question the guide depends on: given correct
volume, do the historical rates rank players correctly?

Run:  C:\\Users\\cwech\\anaconda3\\python.exe -m tools.draft_guide.backtest
      (then follow the printed npx tsx commands if stale)  -- actually this
      script shells out to npx tsx itself.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

import pandas as pd
import psycopg2
from scipy.stats import spearmanr

from . import config
from . import rates as R

APP_DIR = os.path.join(config.REPO_ROOT, "app")

STAT_COLS = {  # stat-line column -> (numerator col, volume col, rate name)
    "accurateThrows": ("accurate_throws", "dropbacks", "r_acc"),
    "catchableThrows": ("catchable_throws", "dropbacks", "r_catch"),
    "heroThrows": ("hero_throws", "dropbacks", "r_hero"),
    "toWorthyThrows": ("to_worthy_throws", "dropbacks", "r_tw"),
    "incompletions": ("incompletions", "dropbacks", "r_inc"),
    "sacksTaken": ("sacks_taken", "dropbacks", "r_sack"),
    "rushMtf": ("rush_mtf", "rush_att", "r_rush_mtf"),
    "recMtf": ("rec_mtf", "receptions", "r_rec_mtf"),
    "rushYaco": ("rush_yaco", "rush_att", "r_rush_yaco"),
    "recYaco": ("rec_yaco", "receptions", "r_rec_yaco"),
    "rushExplosives": ("rush_explosive10", "rush_att", "r_rush_exp"),
    "recExplosives": ("rec_explosive", "receptions", "r_rec_exp"),
    "recFd": ("rec_fd", "targets", "r_rec_fd"),
    "heroCatches": ("hero_catches", "targets", "r_hero_catch"),
    "drops": ("drops", "targets", "r_drop"),
    "firstReadTargets": ("first_read_targets", "targets", "r_first_read"),
    "sepM2": ("sep_m2", "routes", "r_sep_m2"),
    "sepM1": ("sep_m1", "routes", "r_sep_m1"),
    "sepP1": ("sep_p1", "routes", "r_sep_p1"),
    "sepP2": ("sep_p2", "routes", "r_sep_p2"),
    "sepP3": ("sep_p3", "routes", "r_sep_p3"),
    "sepP4": ("sep_p4", "routes", "r_sep_p4"),
}


def season_totals(conn, season: int) -> pd.DataFrame:
    frames = []
    for sql in (R._QB_SQL, R._RUSH_SQL, R._REC_SQL, R._ROUTES_SQL):
        frames.append(R._read(conn, sql, season))
    out = frames[0]
    for f in frames[1:]:
        out = out.merge(f, on="gsis_id", how="outer")
    return out.fillna(0.0)


def to_line(df: pd.DataFrame, cols: dict[str, pd.Series]) -> pd.DataFrame:
    line = pd.DataFrame({"gsisId": df["gsis_id"], "position": df["position"], "games": 17})
    line["name"] = df["gsis_id"]
    line["team"] = ""
    for k, v in cols.items():
        line[k] = v
    line["mtf"] = line["rushMtf"] + line["recMtf"]
    line["dropbacks"] = df["dropbacks"]
    line["routes"] = df["routes"]
    return line


def score(csv_path: str, json_path: str) -> pd.DataFrame:
    subprocess.run(
        ["npx.cmd", "tsx", os.path.join(config.HERE, "score_projections.ts"), csv_path, json_path],
        cwd=APP_DIR, check=True, capture_output=True,
    )
    return pd.DataFrame(json.load(open(json_path, encoding="utf-8")))[["gsisId", "points"]]


def main() -> None:
    conn = psycopg2.connect(config.nfl_data_dsn())
    conn.set_session(readonly=True)

    # Rates from 2024 only.
    R.SEASONS = {2024: 1.0}
    totals24 = R.weighted_totals(conn)
    means24 = R.position_means(totals24[totals24["position"].isin(["QB", "RB", "WR", "TE"])])
    rates24 = R.shrunk_rates(totals24, means24)

    # 2025 actuals (volume + numerators) with 2025 position.
    t25 = season_totals(conn, 2025)
    pos25 = R._read(conn, R._POS_SQL, 2025)[["gsis_id", "position"]]
    t25 = t25.merge(pos25, on="gsis_id", how="left")
    t25 = t25[t25["position"].isin(["QB", "RB", "WR", "TE"])]
    conn.close()

    m = t25.merge(rates24[["gsis_id"] + [r[0] for r in R.RATE_DEFS]], on="gsis_id", how="left")
    means_idx = means24.set_index("position")

    pred_cols, act_cols = {}, {}
    for stat, (num, vol, rate) in STAT_COLS.items():
        fallback = m["position"].map(means_idx[f"mean_{rate}"])
        r = m[rate].fillna(fallback)  # 2025 rookies -> 2024 positional mean
        pred_cols[stat] = r * m[vol]
        act_cols[stat] = m[num]

    pred = to_line(m, pred_cols)
    act = to_line(m, act_cols)
    pred_csv = os.path.join(config.OUT_DIR, "bt_pred_lines.csv")
    act_csv = os.path.join(config.OUT_DIR, "bt_act_lines.csv")
    pred.to_csv(pred_csv, index=False)
    act.to_csv(act_csv, index=False)

    p = score(pred_csv, os.path.join(config.OUT_DIR, "bt_pred_points.json")).rename(columns={"points": "pred"})
    a = score(act_csv, os.path.join(config.OUT_DIR, "bt_act_points.json")).rename(columns={"points": "actual"})
    cmp = p.merge(a, on="gsisId").merge(m[["gsis_id", "position"]], left_on="gsisId", right_on="gsis_id")

    print("2024-rates x 2025-actual-volume vs 2025 actual points (league rules):")
    for pos, top_n in (("QB", 24), ("RB", 40), ("WR", 50), ("TE", 24)):
        grp = cmp[cmp["position"] == pos].nlargest(top_n, "actual")
        rho = spearmanr(grp["pred"], grp["actual"]).statistic
        mae = (grp["pred"] - grp["actual"]).abs().mean()
        bias = (grp["pred"] - grp["actual"]).mean()
        print(f"  {pos:5s} top{top_n}:  spearman={rho:.3f}  MAE={mae:6.1f}  bias={bias:+6.1f}")


if __name__ == "__main__":
    sys.exit(main())
