"""Step 0: snapshot the live league's scoring rules.

The whole point of this pipeline is scoring projections under THIS league's
rules, which are fully custom (every yard/TD/reception value is zero). If the
owner edits scoring in the Lab, the projections must follow. So every run
re-pulls scoring_rules from prod instead of trusting a hand-made snapshot.

Read-only. Run: python -m tools.weekly_proj.snapshot_rules
Out: out/league_rules.json, out/league_meta.json
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

import psycopg2

from . import config

SQL = """
SELECT ls.scoring_rules, ls.roster_template, ls.version, l.id, l.season, l.status
FROM league_settings ls
JOIN leagues l ON l.id = ls.league_id
WHERE l.slug = %(slug)s
"""


def main() -> None:
    conn = psycopg2.connect(config.prod_app_dsn())
    conn.set_session(readonly=True)
    try:
        with conn.cursor() as cur:
            cur.execute(SQL, {"slug": config.LEAGUE_SLUG})
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        raise SystemExit(f"league not found: {config.LEAGUE_SLUG}")

    rules, template, version, league_id, season, status = row
    os.makedirs(config.OUT_DIR, exist_ok=True)
    with open(os.path.join(config.OUT_DIR, "league_rules.json"), "w", encoding="utf-8") as f:
        json.dump(rules, f, indent=1)
    meta = {
        "slug": config.LEAGUE_SLUG,
        "leagueId": league_id,
        "season": season,
        "status": status,
        "scoringVersion": version,
        "rosterTemplate": template,
        "snapshotAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    with open(os.path.join(config.OUT_DIR, "league_meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1)

    adv = (rules or {}).get("advanced") or {}
    live = sorted(k for k, v in adv.items() if isinstance(v, (int, float)) and v)
    print(f"league_rules.json: league {league_id} ({status}), scoring version {version}")
    print(f"  active advanced components ({len(live)}): {', '.join(live)}")
    print(f"  coaching: {(rules or {}).get('coaching')}")


if __name__ == "__main__":
    sys.exit(main())
