#!/bin/sh
# Fly passes the per-process command (from fly.toml [processes]) as args. We
# simply exec it. Kept as a script so init steps (e.g. a one-shot migration)
# can be added here later if desired.
set -e
exec "$@"
