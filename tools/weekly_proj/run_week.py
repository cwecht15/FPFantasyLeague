"""One command: snapshot the week, project it, score it, build the page.

    C:\\Users\\cwech\\anaconda3\\python.exe -m tools.weekly_proj.run_week --refresh

Steps, in order:
  snapshot_rules   pull the league's live scoring rules from prod
  fetch_week       snapshot the five sheet tabs into out/wk<NN>/
  coach_week       32 weekly COACH lines
  project_week     player volume x charting rates -> weekly stat lines
  score            the app's own scoreStatLine, via tools/draft_guide
  league_week      rosters, lineups, matchups, schedule from prod
  build_week       assemble and render out/week_<NN>_projections.html
  validate         sanity checks; a failure here stops the run

--refresh refetches the sheet (needed for a rerun in the same week);
--skip-fetch rebuilds from the existing snapshot without touching the network.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time

from . import config


def run(step: str, cmd: list[str], cwd: str | None = None) -> None:
    print(f"\n=== {step}")
    t0 = time.time()
    r = subprocess.run(cmd, cwd=cwd)
    if r.returncode != 0:
        raise SystemExit(f"{step} failed with exit code {r.returncode}")
    print(f"    ({time.time() - t0:.1f}s)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--week", type=int, help="assert the sheet holds this week")
    ap.add_argument("--refresh", action="store_true", help="refetch the sheet tabs")
    ap.add_argument("--skip-fetch", action="store_true", help="reuse the existing snapshot")
    args = ap.parse_args()

    py = sys.executable
    wk = ["--week", str(args.week)] if args.week else []

    run("scoring rules", [py, "-m", "tools.weekly_proj.snapshot_rules"])
    if not args.skip_fetch:
        run("sheet snapshot", [py, "-m", "tools.weekly_proj.fetch_week"]
            + wk + (["--refresh"] if args.refresh else []))

    from .project_week import latest_week
    week = args.week or latest_week()
    wk = ["--week", str(week)]

    run("coach model", [py, "-m", "tools.weekly_proj.coach_week"] + wk)
    run("player projections", [py, "-m", "tools.weekly_proj.project_week"] + wk)

    d = config.week_dir(week)
    run("scoring", ["npx.cmd" if os.name == "nt" else "npx", "tsx",
                    os.path.join(config.DG_OUT, "..", "score_projections.ts"),
                    os.path.join(d, "projected_stat_lines.csv"),
                    os.path.join(d, "projected_points.json"),
                    os.path.join(config.OUT_DIR, "league_rules.json")],
        cwd=os.path.join(config.REPO_ROOT, "app"))

    run("league state", [py, "-m", "tools.weekly_proj.league_week"] + wk)
    run("build page", [py, "-m", "tools.weekly_proj.build_week"] + wk)
    run("validate", [py, "-m", "tools.weekly_proj.validate"] + wk)

    page = os.path.join(config.OUT_DIR, f"week_{week:02d}_projections.html")
    print(f"\nweek {week} ready: {page}")
    print("Publish it as an artifact to share the link.")


if __name__ == "__main__":
    sys.exit(main())
