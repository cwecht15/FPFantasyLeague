"""Queue recommendation for the owner's team: 10 available players, computed
from the guide board (out/projections.json) minus drafted players
(out/draft_state.json), needs-aware for the house roster.

Order: first the best available player at each still-unfilled starting
position (by board rank), then best-available overall under sane caps
(QB 2, RB 5, WR 5, TE 2, COACH 1). Run after sync_draft + build_guide:

  C:\\Users\\cwech\\anaconda3\\python.exe -m tools.draft_guide.queue_reco [team]
"""

from __future__ import annotations

import json
import os
import sys

from . import config

TEAM = sys.argv[1] if len(sys.argv) > 1 else "cwecht"
STARTERS = {"QB": 1, "RB": 2, "WR": 2, "TE": 1, "COACH": 1}
# Queue caps are tighter than autopick's: never queue a backup QB/TE/COACH —
# a queued player can be auto-drafted, and those are dead bench spots.
CAPS = {"QB": 1, "RB": 5, "WR": 5, "TE": 2, "COACH": 1}
TOTAL_PICKS = 12


def main() -> None:
    proj = json.load(open(os.path.join(config.OUT_DIR, "projections.json"), encoding="utf-8"))
    state = json.load(open(os.path.join(config.OUT_DIR, "draft_state.json"), encoding="utf-8"))
    taken = state["taken"]

    players = sorted(proj["players"], key=lambda p: p["overallRank"])
    by_id = {p["gsisId"]: p for p in players}

    have: dict[str, int] = {}
    my_picks = []
    for gid, info in taken.items():
        if info["team"] == TEAM:
            pos = by_id.get(gid, {}).get("position", "?")
            have[pos] = have.get(pos, 0) + 1
            my_picks.append((info["pick"], by_id.get(gid, {}).get("name", gid), pos))

    needs = {p for p, n in STARTERS.items() if have.get(p, 0) < n}
    remaining_picks = TOTAL_PICKS - len(my_picks)
    available = [p for p in players if p["gsisId"] not in taken]

    def allowed(pos: str, queued: dict[str, int]) -> bool:
        return have.get(pos, 0) + queued.get(pos, 0) < CAPS.get(pos, 99)

    reco: list[dict] = []
    queued: dict[str, int] = {}

    # 1) best available at each unfilled starting position, by board rank.
    firsts = []
    for pos in needs:
        cand = next((p for p in available if p["position"] == pos), None)
        if cand:
            firsts.append(cand)
    for p in sorted(firsts, key=lambda x: x["overallRank"]):
        reco.append(p)
        queued[p["position"]] = queued.get(p["position"], 0) + 1

    # 2) fill to 10 with best-available under caps.
    for p in available:
        if len(reco) >= 10:
            break
        if p in reco or not allowed(p["position"], queued):
            continue
        reco.append(p)
        queued[p["position"]] = queued.get(p["position"], 0) + 1
    # 3) if every position capped out early, pad with raw best-available.
    for p in available:
        if len(reco) >= 10:
            break
        if p not in reco and p["position"] != "COACH" and p["position"] != "QB":
            reco.append(p)

    first_ids = {p["gsisId"] for p in firsts}
    print(f"{TEAM}: {len(my_picks)} picks made, {remaining_picks} left; "
          f"unfilled starters: {', '.join(sorted(needs)) or 'none'}")
    for pick, name, pos in sorted(my_picks):
        print(f"  P{pick:<3} {pos:5} {name}")
    print("queue recommendation:")
    for i, p in enumerate(reco, 1):
        tag = " <- fills starter need" if p["gsisId"] in first_ids else ""
        print(f"  {i:2}. {p['position']:5} {p['name']:<24} board #{p['overallRank']:<3} "
              f"{p['points']:.0f} pts{tag}")


if __name__ == "__main__":
    sys.exit(main())
