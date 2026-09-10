"""Step 6: assemble the week and render the artifact.

Merges projected points, the projected stat lines and the league's live state
into one JSON payload, then substitutes it into template_week.html.

Per team it solves the lineup twice: once ignoring kickoff locks (the best
lineup that was available) and once with every already-locked slot pinned (what
can still be changed). The second is the one the start/sit advice is based on.

Slot eligibility mirrors app/src/lib/leagues/settings.ts SLOT_ELIGIBILITY, and
the template comes from the league's own stored roster_template, so a settings
change cannot silently produce illegal advice.

Run:  python -m tools.weekly_proj.build_week [--week N]
Out:  out/week_<NN>_projections.html
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

import pandas as pd

from . import config
from .project_week import latest_week

SLOT_ELIGIBILITY = {
    "QB": ["QB"], "RB": ["RB"], "WR": ["WR"], "TE": ["TE"],
    "FLEX": ["RB", "WR", "TE"], "SUPERFLEX": ["QB", "RB", "WR", "TE"],
    "COACH": ["COACH"], "K": ["K"], "DST": ["DST"], "BENCH": [], "IR": [],
}
BENCH_SLOTS = {"BENCH", "IR"}
ET = "America/New_York"


def starter_slots(template: dict) -> list[tuple[str, int, tuple[str, ...]]]:
    """[(slot, slot_index, eligible positions)] in template order."""
    out = []
    for entry in template.get("slots", []):
        slot = entry["slot"]
        if slot in BENCH_SLOTS:
            continue
        elig = tuple(entry.get("eligible") or SLOT_ELIGIBILITY.get(slot, []))
        for i in range(int(entry.get("count", 0))):
            out.append((slot, i, elig))
    return out


def optimize(candidates: list[str], slots, pts: dict, pos: dict,
             pinned: dict | None = None) -> tuple[dict, float]:
    """Best assignment of players to slots.

    Eligibility here is nested (FLEX accepts everything RB/WR/TE slots do), so
    filling the most restrictive slots first with their best eligible player and
    letting FLEX take the best leftover is optimal. Verified against a brute
    force search in validate.py.
    """
    pinned = pinned or {}
    used = set(pinned.values())
    assign = dict(pinned)
    order = sorted((s for s in slots if (s[0], s[1]) not in pinned),
                   key=lambda s: (len(s[2]), s[0], s[1]))
    for slot, idx, elig in order:
        best, best_pts = None, None
        for gid in candidates:
            if gid in used or pos.get(gid) not in elig:
                continue
            p = pts.get(gid)
            if p is None:
                continue
            if best_pts is None or p > best_pts:
                best, best_pts = gid, p
        if best is not None:
            assign[(slot, idx)] = best
            used.add(best)
    total = round(sum(pts.get(g, 0.0) for g in assign.values()), 2)
    return assign, total


def _fmt_et(iso: str | None) -> str | None:
    if not iso:
        return None
    try:
        from zoneinfo import ZoneInfo
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(ZoneInfo(ET))
        return dt.strftime("%a %-I:%M %p ET") if os.name != "nt" else dt.strftime("%a %I:%M %p ET").replace(" 0", " ")
    except Exception:
        return iso


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--week", type=int)
    ap.add_argument("--out", help="output html path")
    args = ap.parse_args()
    week = args.week or latest_week()

    lines = pd.read_csv(config.week_file(week, "projected_stat_lines.csv"))
    points = json.load(open(config.week_file(week, "projected_points.json"), encoding="utf-8"))
    state = json.load(open(config.week_file(week, "league_state.json"), encoding="utf-8"))
    rules = json.load(open(os.path.join(config.OUT_DIR, "league_rules.json"), encoding="utf-8"))
    fetch_meta = json.load(open(config.week_file(week, "fetch_meta.json"), encoding="utf-8"))

    pts = {p["gsisId"]: p["points"] for p in points}
    brk = {p["gsisId"]: {k: v for k, v in p["breakdown"].items() if abs(v) >= 0.05}
           for p in points}
    lines = lines.set_index("gsisId", drop=False)

    now = datetime.now(timezone.utc)
    kickoffs = state["kickoffs"]
    prod_players = state["players"]
    owner = {r["gsis_id"]: r["team_id"] for r in state["roster"]}
    warnings = []

    # ---- player board -------------------------------------------------------
    players, pos_of, kick_of = [], {}, {}
    for gid, row in lines.iterrows():
        meta = prod_players.get(gid, {})
        pos = meta.get("pos") or row["position"]
        team = meta.get("team") or row["team"]
        if pos != row["position"] and pos in SLOT_ELIGIBILITY:
            warnings.append(f"{row['name']}: sheet says {row['position']}, league says {pos}")
        kick = kickoffs.get(team)
        pos_of[gid] = pos
        kick_of[gid] = kick
        flags = []
        for col, flag in (("ctx_rookie", "rookie"), ("ctx_no_history", "nohist"),
                          ("ctx_est_routes", "estroutes"), ("ctx_bye", "bye")):
            if col in lines.columns and str(row.get(col)).strip().lower() == "true":
                flags.append(flag)
        status = str(row.get("ctx_status") or "").strip()
        if status in ("PS", "IR"):
            flags.append(status.lower())
        if team and team not in kickoffs and pos != "COACH":
            flags.append("bye")

        def g(col, default=None):
            v = row.get(col, default)
            return None if pd.isna(v) else v

        ctx = {"db": g("dropbacks"), "att": g("ctx_rush_att"), "tgt": g("ctx_targets"),
               "rec": g("receptions"), "rte": g("routes"), "dk": g("ctx_dk_pts"),
               "dkr": g("ctx_dk_rank"), "pa": g("paDropbacks"), "mo": g("motionDropbacks"),
               "win": g("teamWin"), "e30": g("exp30"), "spd": g("ctx_spread"),
               "tp": g("ctx_team_points"), "pc": g("ctx_playcaller")}
        players.append({
            "id": gid, "n": row["name"], "p": pos, "t": team,
            "opp": g("ctx_opp"), "k": kick, "kt": _fmt_et(kick),
            "pts": round(float(pts.get(gid, 0.0)), 2),
            "b": brk.get(gid, {}),
            "ctx": {k: (round(v, 2) if isinstance(v, float) else v)
                    for k, v in ctx.items() if v is not None and v != ""},
            "own": owner.get(gid), "fl": flags,
        })

    for gid, meta in prod_players.items():
        if gid not in pts:
            pos_of[gid] = meta["pos"]
            kick_of[gid] = kickoffs.get(meta["team"])

    # position rank over everyone projected
    for pos in {p["p"] for p in players}:
        ranked = sorted((p for p in players if p["p"] == pos), key=lambda x: -x["pts"])
        for i, p in enumerate(ranked, 1):
            p["pr"] = i

    # ---- free agents --------------------------------------------------------
    fa = sorted((p for p in players if p["own"] is None and p["pts"] > 0),
                key=lambda x: -x["pts"])
    best_fa_at = {}
    for p in fa:
        best_fa_at.setdefault(p["p"], p["pts"])
    for p in players:
        p["vor"] = round(p["pts"] - best_fa_at.get(p["p"], 0.0), 2)

    # ---- teams --------------------------------------------------------------
    template = state["rosterTemplate"]
    slots = starter_slots(template)
    by_team_roster = {}
    for r in state["roster"]:
        by_team_roster.setdefault(r["team_id"], []).append(r["gsis_id"])
    cur_by_team = {}
    for s in state["lineups"]:
        cur_by_team.setdefault(s["team_id"], []).append(s)

    def locked(gid: str) -> bool:
        k = kick_of.get(gid)
        if not k:
            return False
        return datetime.fromisoformat(k.replace("Z", "+00:00")) <= now

    teams = []
    for t in state["teams"]:
        tid = t["id"]
        roster = by_team_roster.get(tid, [])
        cur_slots = [s for s in cur_by_team.get(tid, []) if s["slot"] not in BENCH_SLOTS]
        cur_map = {(s["slot"], s["slot_index"]): s["gsis_id"] for s in cur_slots}
        cur_total = round(sum(pts.get(g, 0.0) for g in cur_map.values() if g), 2)

        pin = {k: g for k, g in cur_map.items() if g and locked(g)}
        opt_free, opt_free_total = optimize(roster, slots, pts, pos_of)
        opt_act, opt_act_total = optimize(roster, slots, pts, pos_of, pinned=pin)

        # A move is a player entering or leaving the lineup. Comparing slot by
        # slot instead would report two starters trading WR1/WR2 as two moves,
        # which is noise: only the set of starters changes the score.
        started = {g for g in cur_map.values() if g}
        opt_ids = {g for g in opt_act.values() if g}
        ins = sorted(opt_ids - started, key=lambda g: -pts.get(g, 0.0))
        remaining = list(started - opt_ids)
        moves = []
        for gid in ins:
            # Pair with an outgoing starter at the same position where possible:
            # that is the swap the manager actually makes in the lineup editor,
            # and pairing across positions can make a real gain read as a loss.
            same = [o for o in remaining if pos_of.get(o) == pos_of.get(gid)]
            pool = same or remaining
            drop = min(pool, key=lambda o: pts.get(o, 0.0)) if pool else None
            if drop:
                remaining.remove(drop)
            moves.append({"in": gid, "out": drop,
                          "d": round(pts.get(gid, 0.0) - pts.get(drop, 0.0), 2)})
        moves.sort(key=lambda m: -m["d"])
        bench = [g for g in roster if g not in started]

        # best free agent this team could actually use
        adds = []
        for cand in fa[:120]:
            if pos_of.get(cand["id"]) not in {e for _, _, el in slots for e in el}:
                continue
            _, with_fa = optimize(roster + [cand["id"]], slots, pts, pos_of)
            gain = round(with_fa - opt_free_total, 2)
            if gain > 0.05:
                adds.append({"id": cand["id"], "gain": gain})
        adds = sorted(adds, key=lambda a: -a["gain"])[:5]

        teams.append({
            "id": tid, "name": t["name"], "ab": t["abbrev"], "faab": t["faab_budget"],
            "cur": {"total": cur_total,
                    "slots": [{"s": s, "i": i,
                               "id": cur_map.get((s, i)),
                               "lk": bool(cur_map.get((s, i)) and locked(cur_map[(s, i)]))}
                              for s, i, _ in slots]},
            "opt": {"total": opt_act_total,
                    "slots": [{"s": s, "i": i, "id": opt_act.get((s, i))} for s, i, _ in slots]},
            "free": opt_free_total,
            "left": round(opt_act_total - cur_total, 2),
            "moves": moves, "bench": bench, "adds": adds,
        })

    team_pts = {t["id"]: t["cur"]["total"] for t in teams}
    matchups = [{"id": m["id"], "h": m["home_team_id"], "a": m["away_team_id"],
                 "hp": team_pts.get(m["home_team_id"], 0.0),
                 "ap": team_pts.get(m["away_team_id"], 0.0)}
                for m in state["matchups"]]

    empty = sum(1 for t in teams for s in t["cur"]["slots"] if not s["id"])
    if empty:
        warnings.append(f"{empty} starter slot(s) are empty across the league")
    byes = sorted({p["t"] for p in players if "bye" in p["fl"] and p["t"]})
    if byes:
        warnings.append(f"on bye: {', '.join(byes)}")

    data = {
        "season": state["season"], "week": week, "slug": state["slug"],
        "generated": now.isoformat(timespec="seconds"),
        "scoringVersion": state["scoringVersion"],
        "sheet": {"workbook": fetch_meta["workbook"], "fetchedAt": fetch_meta["fetchedAt"]},
        "rules": rules, "template": template.get("slots", []),
        "players": players, "teams": teams, "matchups": matchups,
        "fa": [p["id"] for p in fa],
        "warnings": sorted(set(warnings)),
    }

    tpl_path = os.path.join(config.HERE, "template_week.html")
    with open(tpl_path, encoding="utf-8") as f:
        tpl = f.read()
    html = tpl.replace("/*__DATA__*/", json.dumps(data, separators=(",", ":")))
    dest = args.out or os.path.join(config.OUT_DIR, f"week_{week:02d}_projections.html")
    with open(dest, "w", encoding="utf-8") as f:
        f.write(html)

    size = os.path.getsize(dest) / 1024
    print(f"week {week}: {dest} ({size:.0f} KB)")
    print(f"  {len(players)} players, {len(teams)} teams, {len(matchups)} matchups, "
          f"{len(fa)} free agents")
    for t in sorted(teams, key=lambda x: -x["left"]):
        if t["left"] > 0.05:
            print(f"  {t['name']:<24} projected {t['cur']['total']:6.1f} "
                  f"| {t['left']:+.1f} available from {len(t['moves'])} move(s)")
    for w in data["warnings"]:
        print(f"  warn: {w}")


if __name__ == "__main__":
    sys.exit(main())
