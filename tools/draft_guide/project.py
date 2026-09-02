"""Step 5: merge sheet volume x rates into projected 2026 stat lines.

One row per draftable player (plus the 32 COACH rows from coach_model), with
camelCase RawStatLine columns so score_projections.ts can feed them straight
into the app's scoreStatLine. Season totals + games; the scorer averages
per-game, scores, and multiplies back (exact — the league rules are linear).

Rate source per player:
  veteran   player_rates.csv (shrunk 2024+2025 rates)
  rookie    rookie_priors.csv bucket via rookie_2026.csv (2026 draft class)
  no data   position_means.csv, flagged ctx_no_history

QB sack rate prefers the owner's qb_sack_rate_projections_2026_weighted.csv.
QBs who changed teams since 2025 get an extra 15% shrink toward the position
mean on their throw-quality rates (scheme/supporting-cast reset).

Run:  C:\\Users\\cwech\\anaconda3\\python.exe -m tools.draft_guide.project
Out:  out/projected_stat_lines.csv
"""

from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

from . import config
from .rates import RATE_DEFS, QB_RATES

MIN_VOLUME = dict(dbs=25, rush_att=10, targets=10, routes=50)
POS_MAP = {"FB": "RB", "HB": "RB"}
TEAM_CHANGE_SHRINK = 0.15

RATE_NAMES = [r[0] for r in RATE_DEFS]


def _num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").fillna(0.0)


def load_sheet() -> pd.DataFrame:
    pp = pd.read_csv(os.path.join(config.OUT_DIR, "sheet_player_projections.csv"))
    pp.columns = [c.strip() for c in pp.columns]
    pp = pp.loc[:, ~pp.columns.duplicated()]
    pp = pp[pp["ID"].astype(str).str.startswith("00-")].copy()
    pp = pp.rename(columns={"ID": "gsis_id"})
    for c in ("G", "DBs", "Aimed Atts", "PYards", "PTDs", "INTs", "Scrm", "Scrm Yds",
              "Scrm TDs", "Des RuAtt", "Des RuYds", "Des RuTD", "QBSNK", "QBSNK Yds",
              "QBSNK TD", "Routes", "TGTs", "RECs", "REC Yds", "Rec TD", "Fum", "PPR"):
        pp[c] = _num(pp[c])
    pp["Team"] = pp["Team"].astype(str).str.strip().map(config.house_team)
    return pp


def positions() -> pd.DataFrame:
    ri = pd.read_csv(os.path.join(config.OUT_DIR, "sheet_roster_info.csv"))
    ri.columns = [str(c).strip() for c in ri.columns]
    ri = ri[ri["GsisID"].astype(str).str.startswith("00-")]
    out = ri[["GsisID", "Pos"]].rename(columns={"GsisID": "gsis_id", "Pos": "pos_sheet"})
    out["pos_sheet"] = out["pos_sheet"].astype(str).str.strip().str.upper().replace(POS_MAP)
    return out.drop_duplicates("gsis_id")


def adp() -> pd.DataFrame:
    a = pd.read_csv(os.path.join(config.OUT_DIR, "sheet_adp.csv"), header=1)
    a = a.iloc[:, :10].copy()  # PPR block
    a.columns = [str(c).strip() for c in a.columns]
    a = a[a["NAME"].notna()]
    a["key"] = (a["NAME"].astype(str).str.lower().str.replace(r"[^a-z]", "", regex=True)
                + "|" + a["TEAM"].astype(str).str.strip().map(config.house_team))
    a["ADP"] = pd.to_numeric(a["ADP"], errors="coerce")
    return a[["key", "ADP"]].dropna().drop_duplicates("key")


def main() -> None:
    pp = load_sheet()
    rates = pd.read_csv(os.path.join(config.OUT_DIR, "player_rates.csv"))
    means = pd.read_csv(os.path.join(config.OUT_DIR, "position_means.csv"))
    rk_priors = pd.read_csv(os.path.join(config.OUT_DIR, "rookie_priors.csv"))
    rk26 = pd.read_csv(os.path.join(config.OUT_DIR, "rookie_2026.csv"))
    sack_csv = pd.read_csv(config.QB_SACK_RATE_CSV)[["passer_id", "projected_sack_rate"]]

    df = pp.merge(positions(), on="gsis_id", how="left")
    df = df.merge(rates, on="gsis_id", how="left", suffixes=("", "_r"))
    df = df.merge(rk26[["gsis_id", "position", "bucket", "draft_number"]]
                  .rename(columns={"position": "pos_rk"}), on="gsis_id", how="left")

    df["position"] = (df["pos_sheet"].where(df["pos_sheet"].isin(["QB", "RB", "WR", "TE"]))
                      .fillna(df["pos_rk"]).fillna(df["position"]))
    df = df[df["position"].isin(["QB", "RB", "WR", "TE"])].copy()

    keep = ((df["DBs"] >= MIN_VOLUME["dbs"]) | (df["Des RuAtt"] >= MIN_VOLUME["rush_att"])
            | (df["TGTs"] >= MIN_VOLUME["targets"]) | (df["Routes"] >= MIN_VOLUME["routes"]))
    df = df[keep & (df["G"] > 0)].copy()

    df["is_rookie"] = df["bucket"].notna()
    df["has_history"] = df["n_dropbacks"].fillna(0) + df["n_rush_att"].fillna(0) + \
        df["n_targets"].fillna(0) + df["n_routes"].fillna(0) > 0

    # --- resolve one rate set per player ------------------------------------
    means_idx = means.set_index("position")
    priors_idx = rk_priors.set_index(["position", "bucket"])
    for name in RATE_NAMES:
        mean_for_pos = df["position"].map(means_idx[f"mean_{name}"])
        rate = df[name].copy()
        # rookies: bucket prior beats a (nonexistent/empty) veteran rate
        rk_mask = df["is_rookie"] & ~df["has_history"]
        if rk_mask.any():
            prior_vals = [
                priors_idx.at[(p, b), name] if (p, b) in priors_idx.index else np.nan
                for p, b in zip(df.loc[rk_mask, "position"], df.loc[rk_mask, "bucket"])
            ]
            rate.loc[rk_mask] = prior_vals
        rate = rate.fillna(mean_for_pos)
        # QB team change: extra shrink of throw-quality rates toward the mean
        if name in QB_RATES:
            moved = (df["position"] == "QB") & df["has_history"] & \
                (df["team_2025"].astype(str) != df["Team"].astype(str))
            rate.loc[moved] = ((1 - TEAM_CHANGE_SHRINK) * rate.loc[moved]
                               + TEAM_CHANGE_SHRINK * mean_for_pos.loc[moved])
        df[f"use_{name}"] = rate

    # owner's projected QB sack rates override the historical one where present
    df = df.merge(sack_csv.rename(columns={"passer_id": "gsis_id"}), on="gsis_id", how="left")
    qb = df["position"] == "QB"
    df.loc[qb, "use_r_sack"] = df.loc[qb, "projected_sack_rate"].fillna(df.loc[qb, "use_r_sack"])

    # --- build the stat lines (season totals) --------------------------------
    dbs, att, rec, tgt, rte = df["DBs"], df["Des RuAtt"], df["RECs"], df["TGTs"], df["Routes"]
    line = pd.DataFrame({
        "gsisId": df["gsis_id"],
        "name": df["Name"].astype(str).str.replace(r"\s+[A-Z]{2,3}$", "", regex=True),
        "position": df["position"],
        "team": df["Team"],
        "games": df["G"],
        # QB throw quality (only QBs have dropback volume; others get 0)
        "accurateThrows": df["use_r_acc"] * dbs,
        "catchableThrows": df["use_r_catch"] * dbs,
        "heroThrows": df["use_r_hero"] * dbs,
        "toWorthyThrows": df["use_r_tw"] * dbs,
        "incompletions": df["use_r_inc"] * dbs,
        "sacksTaken": df["use_r_sack"] * dbs,
        "dropbacks": dbs,
        # rushing/receiving charting
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
        # separation (per route)
        "routes": rte,
        "sepM2": df["use_r_sep_m2"] * rte,
        "sepM1": df["use_r_sep_m1"] * rte,
        "sepP1": df["use_r_sep_p1"] * rte,
        "sepP2": df["use_r_sep_p2"] * rte,
        "sepP3": df["use_r_sep_p3"] * rte,
        "sepP4": df["use_r_sep_p4"] * rte,
        # box-score context (scores 0 under the league rules; shown in the guide)
        "passYds": df["PYards"],
        "passTd": df["PTDs"],
        "passInt": df["INTs"],
        "rushYds": df["Des RuYds"] + df["Scrm Yds"] + df["QBSNK Yds"],
        "rushTd": df["Des RuTD"] + df["Scrm TDs"] + df["QBSNK TD"],
        "receptions": rec,
        "recYds": df["REC Yds"],
        "recTd": df["Rec TD"],
        "fumblesLost": df["Fum"],
        # guide context
        "ctx_targets": tgt,
        "ctx_rush_att": att,
        "ctx_ppr": df["PPR"],
        "ctx_rookie": df["is_rookie"],
        "ctx_no_history": ~df["has_history"] & ~df["is_rookie"],
        "ctx_draft_pick": df["draft_number"],
    })
    line["explosivePlays"] = line["rushExplosives"] + line["recExplosives"]
    line["sepTotal"] = (-2 * line["sepM2"] - line["sepM1"] + line["sepP1"]
                        + 2 * line["sepP2"] + 3 * line["sepP3"] + 4 * line["sepP4"])

    # ADP (PPR block; join by normalized name + team, then name alone)
    a = adp()
    key = (line["name"].str.lower().str.replace(r"[^a-z]", "", regex=True) + "|" + line["team"])
    line["ctx_adp"] = key.map(a.set_index("key")["ADP"])
    by_name = a.assign(nm=a["key"].str.split("|").str[0]).drop_duplicates("nm", keep="first")
    line["ctx_adp"] = line["ctx_adp"].fillna(
        line["name"].str.lower().str.replace(r"[^a-z]", "", regex=True).map(by_name.set_index("nm")["ADP"]))

    coach = pd.read_csv(os.path.join(config.OUT_DIR, "coach_stat_lines.csv"))
    out = pd.concat([line, coach], ignore_index=True)
    out.to_csv(os.path.join(config.OUT_DIR, "projected_stat_lines.csv"), index=False)
    n = line["position"].value_counts().to_dict()
    print(f"projected_stat_lines.csv: {len(out)} rows ({n}, +{len(coach)} COACH)")
    print(f"rookies: {int(line['ctx_rookie'].sum())}, no-history vets: {int(line['ctx_no_history'].sum())}, "
          f"with ADP: {int(line['ctx_adp'].notna().sum())}")


if __name__ == "__main__":
    sys.exit(main())
