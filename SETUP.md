# Infrastructure setup & end-to-end verification

Do these once. After step 2 the rest are one command each. The commands read
secrets from local `.env` files, so you never paste them anywhere shared.

## 1. Provision Neon (app database)

1. Sign up at <https://neon.tech> and create a project.
   - **Region:** `AWS us-east-1` (sits next to Fly `iad`).
   - **Postgres version:** 16+ is fine.
2. From the project dashboard, copy **two** connection strings (Connection
   Details → "Connection string"):
   - **Pooled** (host contains `-pooler`) — for the app + the weekly push.
   - **Direct/unpooled** — for running migrations.
   Both end with `?sslmode=require`.

> A single default role is fine for now. (Later: create a dedicated writer role
> for the pipeline and a read role for the app — least privilege.)

## 2. Fill the two env files

**`app/.env.local`** (copy from `app/.env.example`):
```
DATABASE_URL="<NEON_POOLED_URL>"        # app/worker use the pooler
AUTH_SECRET="<run the generator below>"
AUTH_URL="http://localhost:3000"
INGEST_TOKEN="<any long random string>"
```
Generate `AUTH_SECRET`:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**`tools/scoring/.env`** (copy from `tools/scoring/.env.example`):
```
NFL_DB_PASSWORD=<same as NFL_Database_Guide/.env>
APP_DB_URL=<NEON_POOLED_URL>            # the pipeline writes via the pooler
```

## 3. Apply the schema migration

Use the **direct/unpooled** URL for migrations (DDL + advisory locks dislike the
pooler). One-off:
```powershell
cd app
$env:DATABASE_URL="<NEON_DIRECT_URL>"; npm run db:migrate
```
Then confirm with the pooled URL from `.env.local`:
```powershell
npm run db:check        # should list 28 tables, all 0 rows
```

## 4. Push real data from NFL_Data → Neon

```powershell
cd ..                                   # repo root
python -m tools.scoring.push_scores --test-conn          # both DBs OK?
python -m tools.scoring.push_scores --season 2024 --week 1 --dry-run
python -m tools.scoring.push_scores --season 2024 --week 1
```

## 5. Verify the data landed

```powershell
cd app
npm run db:check        # players ~3.6k, player_week_stats ~376 for that week
```

Spot-check a player (Neon SQL editor or `psql`):
```sql
SELECT gsis_id, team, pass_yds, pass_td, rush_yds, rec_yds, rec_td
FROM player_week_stats
WHERE season=2024 AND week=1
ORDER BY pass_yds DESC LIMIT 5;       -- Tua (MIA) 338/1 should top it
```

Once this is green, the data pipeline is proven end-to-end and we move on to the
app features (auth → leagues → scoring rollup → draft).
