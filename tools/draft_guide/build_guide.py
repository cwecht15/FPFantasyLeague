"""Step 9: inject slimmed projection data into template.html -> the draft guide.

Keeps the top 250 players by overall rank plus all 32 coaches, trims each
record to what the page renders, and replaces /*__DATA__*/ in template.html.

Run:  C:\\Users\\cwech\\anaconda3\\python.exe -m tools.draft_guide.build_guide
Out:  out/draft_guide_2026.html
"""

from __future__ import annotations

import json
import math
import os
import sys

from . import config

KEEP_PLAYERS = 250


def _f(v, nd=1):
    try:
        x = float(v)
        return None if math.isnan(x) else round(x, nd)
    except (TypeError, ValueError):
        return None


def slim(p: dict) -> dict:
    b = {k: round(v, 1) for k, v in (p.get("breakdown") or {}).items() if abs(v) >= 0.05}
    out = {
        "id": p["gsisId"],
        "r": p["overallRank"], "n": p["name"], "p": p["position"], "t": p["team"],
        "g": _f(p["games"], 0), "pts": _f(p["points"]), "ppg": _f(p["ppg"], 2),
        "vor": _f(p["vor"]), "tier": p["tier"], "pr": p["posRank"], "b": b,
    }
    if p["position"] == "COACH":
        out["ctx"] = {
            "pa": _f(p.get("ctx_pa_rate"), 3), "mo": _f(p.get("ctx_motion_rate"), 3),
            "w": _f(p.get("teamWin")), "e30": _f(p.get("exp30")),
            "f4": _f(p.get("fourthDownAttempts")), "r2": _f(p.get("run2ndLong")),
            "d2": _f(p.get("deep2ndShort")),
            "ns": bool(p.get("ctx_new_staff")), "pc": p.get("ctx_playcaller"),
        }
    else:
        out["adp"] = _f(p.get("ctx_adp"))
        out["rk"] = bool(p.get("ctx_rookie"))
        out["pk"] = _f(p.get("ctx_draft_pick"), 0)
        out["ctx"] = {
            "db": _f(p.get("dropbacks"), 0), "att": _f(p.get("ctx_rush_att"), 0),
            "tgt": _f(p.get("ctx_targets"), 0), "rec": _f(p.get("receptions"), 0),
            "rte": _f(p.get("routes"), 0),
            "pyds": _f(p.get("passYds"), 0), "ptd": _f(p.get("passTd"), 0),
            "ryds": _f(p.get("rushYds"), 0), "rtd": _f(p.get("rushTd")),
            "recyds": _f(p.get("recYds"), 0), "rectd": _f(p.get("recTd")),
            "ppr": _f(p.get("ctx_ppr")),
        }
    return out


def main() -> None:
    payload = json.load(open(os.path.join(config.OUT_DIR, "projections.json"), encoding="utf-8"))
    players = payload["players"]
    keep = [p for p in players if p["position"] == "COACH"
            or p["overallRank"] <= KEEP_PLAYERS
            or (p.get("posRank") or 99) <= 32]
    data = {
        "season": payload["season"],
        "generated": payload["generated"],
        "baselines": payload["baselines"],
        "rules": payload["rules"],
        "players": sorted((slim(p) for p in keep), key=lambda x: x["r"]),
    }
    # Real draft picks, if sync_draft has run (baked-in floor for the tracker).
    state_path = os.path.join(config.OUT_DIR, "draft_state.json")
    if os.path.exists(state_path):
        data["draft"] = json.load(open(state_path, encoding="utf-8"))
    tpl = open(os.path.join(config.HERE, "template.html"), encoding="utf-8").read()
    html = tpl.replace("/*__DATA__*/", json.dumps(data, separators=(",", ":")))
    out_path = os.path.join(config.OUT_DIR, "draft_guide_2026.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"{out_path}: {len(data['players'])} rows, {len(html) // 1024} KB")


if __name__ == "__main__":
    sys.exit(main())
