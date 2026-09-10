"""Step 2: merge this week's sheet volume x charting rates into weekly stat lines.

One row per projected player, camelCase RawStatLine columns, games = 1 so
score_projections.ts scores the line exactly as given.

Volume denominators, and where each comes from:
  dropbacks              Weekly_Projections DB
  designed rush attempts Working_Player_Proj Carries
  receptions             Weekly_Projections REC
  targets                Weekly_Projections TGT
  routes                 Working_Player_Proj RR

Rates are the draft guide's shrunk 2024+2025 charting rates (player_rates.csv),
with the same fallback ladder as tools/draft_guide/project.py: rookies without
history take their draft-capital bucket prior, missing rates fall back to the
position mean, and QBs on a new team get shrunk toward the mean.

Two inputs are taken straight from the sheet instead of modelled, because the
sheet knows better: incompletions are attempts minus completions (the same
identity aggregate.py uses), and sacks are the owner's own projection.

Run:  python -m tools.weekly_proj.project_week [--week N]
Out:  out/wk<NN>/projected_stat_lines.csv
"""

from __future__ import annotations

import argparse
import glob
import os
import re
import sys

import numpy as np
import pandas as pd

from tools.draft_guide.rates import QB_RATES, RATE_DEFS

from . import config

RATE_NAMES = [r[0] for r in RATE_DEFS]
POS_MAP = {"FB": "RB", "HB": "RB"}
POSITIONS = ["QB", "RB", "WR", "TE"]
TEAM_CHANGE_SHRINK = 0.15

# Weekly_Projections: header on row index 1, data from row 2. Labels repeat
# (ATT/YDS/TD three times), so columns are read positionally and asserted.
WEEKLY_HEADER_ROW = 1
WEEKLY_COLS = {
    "gsis_id": (2, "GSIS ID"), "name": (4, "NAME"), "pos": (5, "POS"),
    "team": (6, "TEAM"), "opp": (7, "Opp"), "dk_pts": (8, "DK PTS"),
    "pos_rank": (12, "POS RANK"),
    "dropbacks": (13, "DB"), "pass_att": (14, "ATT"), "cmp": (15, "CMP"),
    "pass_yds": (16, "YDS"), "pass_td": (17, "TD"), "pass_int": (18, "INT"),
    "rush_att": (19, "ATT"), "rush_yds": (20, "YDS"), "rush_td": (21, "TD"),
    "targets": (22, "TGT"), "rec": (23, "REC"), "rec_yds": (24, "YDS"),
    "rec_td": (25, "TD"), "fum": (26, "FUM"), "kickoff": (30, "Kickoff (ISO)"),
}

# Working_Player_Proj: header on row index 8. Resolved by label (each unique in
# that row) except Status, which has no label and is pinned by index.
WORKING_HEADER_ROW = 8
WORKING_LABELS = {"gsis_id": "ID", "pos_w": "Pos", "dbs_w": "DBs",
                  "sacks": "Sacks", "routes": "RR", "carries": "Carries"}
WORKING_STATUS_COL = 5


def _num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(
        s.astype(str).str.replace(",", "", regex=False).str.replace("%", "", regex=False),
        errors="coerce",
    ).fillna(0.0)


def latest_week() -> int:
    weeks = [int(m.group(1)) for p in glob.glob(os.path.join(config.OUT_DIR, "wk*"))
             for m in [re.search(r"wk(\d+)$", p)] if m]
    if not weeks:
        raise SystemExit("no week snapshot found - run tools.weekly_proj.fetch_week first")
    return max(weeks)


def load_weekly(week: int) -> pd.DataFrame:
    raw = pd.read_csv(config.week_file(week, config.TABS["Weekly_Projections"]),
                      header=None, dtype=str).fillna("")
    header = list(raw.iloc[WEEKLY_HEADER_ROW])
    for key, (idx, label) in WEEKLY_COLS.items():
        got = str(header[idx]).strip()
        if got != label:
            raise SystemExit(
                f"Weekly_Projections column drift: expected {label!r} at index {idx} "
                f"for {key!r}, found {got!r}. Re-map WEEKLY_COLS."
            )
    body = raw.iloc[WEEKLY_HEADER_ROW + 1:]
    df = pd.DataFrame({k: body.iloc[:, idx].astype(str).str.strip()
                       for k, (idx, _) in WEEKLY_COLS.items()})
    df = df[df["gsis_id"].str.startswith("00-")].copy()
    for c in ("dropbacks", "pass_att", "cmp", "pass_yds", "pass_td", "pass_int",
              "rush_att", "rush_yds", "rush_td", "targets", "rec", "rec_yds",
              "rec_td", "fum", "dk_pts"):
        df[c] = _num(df[c])
    df["team"] = df["team"].map(config.house_team)
    df["opp"] = df["opp"].map(config.house_team)
    df["position"] = df["pos"].str.upper().replace(POS_MAP)
    return df.drop_duplicates("gsis_id").reset_index(drop=True)


def load_working(week: int) -> pd.DataFrame:
    raw = pd.read_csv(config.week_file(week, config.TABS["Working_Player_Proj"]),
                      header=None, dtype=str).fillna("")
    header = [str(c).strip() for c in raw.iloc[WORKING_HEADER_ROW]]
    idx = {}
    for key, label in WORKING_LABELS.items():
        hits = [i for i, h in enumerate(header) if h == label]
        if len(hits) != 1:
            raise SystemExit(
                f"Working_Player_Proj column drift: label {label!r} for {key!r} "
                f"matched {len(hits)} columns {hits[:5]}. Re-map WORKING_LABELS."
            )
        idx[key] = hits[0]
    body = raw.iloc[WORKING_HEADER_ROW + 1:]
    df = pd.DataFrame({k: body.iloc[:, i].astype(str).str.strip() for k, i in idx.items()})
    df["status"] = body.iloc[:, WORKING_STATUS_COL].astype(str).str.strip()
    bad = set(df["status"].unique()) - {"Active", "PS", "IR", ""}
    if bad:
        raise SystemExit(f"Working_Player_Proj status column drift: unexpected values {bad}")
    df = df[df["gsis_id"].str.startswith("00-")].copy()
    for c in ("dbs_w", "sacks", "routes", "carries"):
        df[c] = _num(df[c])
    return (df.drop_duplicates("gsis_id")
              [["gsis_id", "status", "dbs_w", "sacks", "routes", "carries"]]
              .reset_index(drop=True))


def fill_routes(df: pd.DataFrame) -> pd.Series:
    """Routes drive most of a receiver's score here, so never leave a silent 0.

    A player with targets but no route projection gets this week's own median
    routes-per-target for his position. Flagged so the page can badge it.
    """
    est = df["routes"].copy()
    need = (df["routes"] <= 0) & (df["targets"] > 0)
    if need.any():
        have = (df["routes"] > 0) & (df["targets"] > 0)
        ratio = (df.loc[have, "routes"] / df.loc[have, "targets"])
        by_pos = ratio.groupby(df.loc[have, "position"]).median()
        overall = float(ratio.median()) if len(ratio) else 0.0
        est.loc[need] = df.loc[need, "targets"] * (
            df.loc[need, "position"].map(by_pos).fillna(overall))
    return est, need


def resolve_rates(df: pd.DataFrame) -> pd.DataFrame:
    """One rate set per player: veteran -> rookie bucket prior -> position mean."""
    means = pd.read_csv(config.POSITION_MEANS_CSV).set_index("position")
    priors = pd.read_csv(config.ROOKIE_PRIORS_CSV).set_index(["position", "bucket"])
    for name in RATE_NAMES:
        mean_for_pos = df["position"].map(means[f"mean_{name}"])
        rate = df[name].copy() if name in df.columns else pd.Series(np.nan, index=df.index)
        rk = df["is_rookie"] & ~df["has_history"]
        if rk.any():
            rate.loc[rk] = [
                priors.at[(p, b), name] if (p, b) in priors.index else np.nan
                for p, b in zip(df.loc[rk, "position"], df.loc[rk, "bucket"])
            ]
        rate = rate.fillna(mean_for_pos)
        if name in QB_RATES:
            moved = ((df["position"] == "QB") & df["has_history"]
                     & (df["team_2025"].astype(str) != df["team"].astype(str)))
            rate.loc[moved] = ((1 - TEAM_CHANGE_SHRINK) * rate.loc[moved]
                               + TEAM_CHANGE_SHRINK * mean_for_pos.loc[moved])
        df[f"use_{name}"] = rate.astype(float)
    return df


def build_lines(week: int) -> pd.DataFrame:
    wk = load_weekly(week)
    wp = load_working(week)
    missing = set(wk["gsis_id"]) - set(wp["gsis_id"])
    if missing:
        print(f"  warn: {len(missing)} players missing from Working_Player_Proj "
              f"(routes/sacks estimated)")
    df = wk.merge(wp, on="gsis_id", how="left")
    for c in ("routes", "carries", "sacks", "dbs_w"):
        df[c] = df[c].fillna(0.0)
    df["status"] = df["status"].fillna("")
    df = df[df["position"].isin(POSITIONS)].reset_index(drop=True)

    rates = pd.read_csv(config.PLAYER_RATES_CSV)
    rk26 = pd.read_csv(config.ROOKIE_CLASS_CSV)[["gsis_id", "bucket", "draft_number"]]
    df = df.merge(rates, on="gsis_id", how="left", suffixes=("", "_r"))
    df = df.merge(rk26, on="gsis_id", how="left")
    df["is_rookie"] = df["bucket"].notna()
    zero = pd.Series(0.0, index=df.index)
    df["has_history"] = (df.get("n_dropbacks", zero).fillna(0)
                         + df.get("n_rush_att", zero).fillna(0)
                         + df.get("n_targets", zero).fillna(0)
                         + df.get("n_routes", zero).fillna(0)) > 0
    if "team_2025" not in df.columns:
        df["team_2025"] = ""
    df = resolve_rates(df)

    routes, est_routes = fill_routes(df)
    df["routes"] = routes
    if est_routes.any():
        print(f"  warn: {int(est_routes.sum())} players had targets but no routes "
              f"- estimated from this week's routes-per-target")

    dbs, att = df["dropbacks"], df["carries"]
    rec, tgt, rte = df["rec"], df["targets"], routes

    # Incompletions are an identity (attempt and not a reception), so use the
    # sheet's own attempts minus completions rather than a historical rate.
    inc = (df["pass_att"] - df["cmp"]).clip(lower=0.0)
    inc = inc.where(df["pass_att"] > 0, df["use_r_inc"] * dbs)

    # Sacks: the sheet projects them per game; only fall back to the rate when
    # it is blank or zero for a QB who is projected to drop back.
    sacks = df["use_r_sack"] * dbs
    sacks = sacks.where(~((df["position"] == "QB") & (df["sacks"] > 0)), df["sacks"])

    line = pd.DataFrame({
        "gsisId": df["gsis_id"],
        "name": df["name"],
        "position": df["position"],
        "team": df["team"],
        "games": 1.0,
        # QB throw quality, per dropback
        "accurateThrows": df["use_r_acc"] * dbs,
        "catchableThrows": df["use_r_catch"] * dbs,
        "heroThrows": df["use_r_hero"] * dbs,
        "toWorthyThrows": df["use_r_tw"] * dbs,
        "incompletions": inc,
        "sacksTaken": sacks,
        "dropbacks": dbs,
        # rushing / receiving charting
        "mtf": df["use_r_rush_mtf"] * att + df["use_r_rec_mtf"] * rec,
        "rushMtf": df["use_r_rush_mtf"] * att,
        "recMtf": df["use_r_rec_mtf"] * rec,
        "rushYaco": df["use_r_rush_yaco"] * att,
        "recYaco": df["use_r_rec_yaco"] * rec,
        "rushExplosives": df["use_r_rush_exp"] * att,
        "recExplosives": df["use_r_rec_exp"] * rec,
        "recFd": df["use_r_rec_fd"] * tgt,
        "heroCatches": df["use_r_hero_catch"] * tgt,
        "drops": df["use_r_drop"] * tgt,
        "firstReadTargets": df["use_r_first_read"] * tgt,
        # separation, per route
        "routes": rte,
        "sepM2": df["use_r_sep_m2"] * rte,
        "sepM1": df["use_r_sep_m1"] * rte,
        "sepP1": df["use_r_sep_p1"] * rte,
        "sepP2": df["use_r_sep_p2"] * rte,
        "sepP3": df["use_r_sep_p3"] * rte,
        "sepP4": df["use_r_sep_p4"] * rte,
        # box score: scores 0 under these rules, shown on the page for context
        "passYds": df["pass_yds"], "passTd": df["pass_td"], "passInt": df["pass_int"],
        "rushYds": df["rush_yds"], "rushTd": df["rush_td"],
        "receptions": rec, "recYds": df["rec_yds"], "recTd": df["rec_td"],
        "fumblesLost": df["fum"],
        # page context
        "ctx_opp": df["opp"], "ctx_kickoff": df["kickoff"], "ctx_status": df["status"],
        "ctx_dk_pts": df["dk_pts"], "ctx_dk_rank": df["pos_rank"],
        "ctx_targets": tgt, "ctx_rush_att": att, "ctx_pass_att": df["pass_att"],
        "ctx_rookie": df["is_rookie"], "ctx_no_history": ~df["has_history"] & ~df["is_rookie"],
        "ctx_est_routes": est_routes, "ctx_draft_pick": df["draft_number"],
    })
    line["explosivePlays"] = line["rushExplosives"] + line["recExplosives"]
    line["sepTotal"] = (-2 * line["sepM2"] - line["sepM1"] + line["sepP1"]
                        + 2 * line["sepP2"] + 3 * line["sepP3"] + 4 * line["sepP4"])
    return line


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--week", type=int)
    args = ap.parse_args()
    week = args.week or latest_week()

    line = build_lines(week)
    coach_path = config.week_file(week, "coach_stat_lines.csv")
    if os.path.exists(coach_path):
        out = pd.concat([line, pd.read_csv(coach_path)], ignore_index=True)
    else:
        print("  warn: no weekly coach lines - run tools.weekly_proj.coach_week first")
        out = line

    dest = config.week_file(week, "projected_stat_lines.csv")
    out.to_csv(dest, index=False)
    n = line["position"].value_counts().to_dict()
    print(f"week {week} projected_stat_lines.csv: {len(out)} rows ({n})")
    print(f"  rookies {int(line['ctx_rookie'].sum())}, no-history vets "
          f"{int(line['ctx_no_history'].sum())}, PS/IR "
          f"{int(line['ctx_status'].isin(['PS', 'IR']).sum())}")


if __name__ == "__main__":
    sys.exit(main())
