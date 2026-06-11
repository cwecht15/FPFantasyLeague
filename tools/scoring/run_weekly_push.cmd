@echo off
rem Weekly pipeline push for Task Scheduler: resolves the in-progress week of
rem the current season and pushes stat lines to the production app DB (Neon).
rem No-ops safely in the offseason. Logs append to history\schtask.log.
cd /d "C:\Users\cwech\Documents\Claude\Projects\FPFantasyLeague"
"C:\Users\cwech\anaconda3\python.exe" -m tools.scoring.push_scores --season 2026 --current >> "tools\scoring\history\schtask.log" 2>&1
