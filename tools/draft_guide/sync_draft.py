"""Pull the league's actual draft picks (read-only, prod Neon) so the guide can
mark drafted players.

Writes out/draft_state.json: {"taken": {gsis_id: {"pick": N, "team": name}}, ...}.
build_guide.py bakes it into the page; rebuild + republish to refresh the board:

  C:\\Users\\cwech\\anaconda3\\python.exe -m tools.draft_guide.sync_draft
  C:\\Users\\cwech\\anaconda3\\python.exe -m tools.draft_guide.build_guide
  (then republish the artifact)
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

import psycopg2

from . import config

_SQL = """
SELECT dp.gsis_id, dp.overall_pick, t.name
FROM draft_picks dp
JOIN drafts d   ON d.id = dp.draft_id
JOIN leagues l  ON l.id = d.league_id
JOIN teams t    ON t.id = dp.team_id
WHERE l.slug = %(slug)s AND dp.gsis_id IS NOT NULL
ORDER BY dp.overall_pick
"""


def main() -> None:
    conn = psycopg2.connect(config.prod_app_dsn())
    conn.set_session(readonly=True)
    with conn.cursor() as cur:
        cur.execute(_SQL, {"slug": config.LEAGUE_SLUG})
        rows = cur.fetchall()
    conn.close()

    state = {
        "taken": {g: {"pick": p, "team": t} for g, p, t in rows},
        "picks": len(rows),
        "synced": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    }
    os.makedirs(config.OUT_DIR, exist_ok=True)
    with open(os.path.join(config.OUT_DIR, "draft_state.json"), "w", encoding="utf-8") as f:
        json.dump(state, f, indent=1)
    print(f"draft_state.json: {len(rows)} picks made")
    for g, p, t in rows[-5:]:
        print(f"  {p:3d}  {g}  -> {t}")


if __name__ == "__main__":
    sys.exit(main())
