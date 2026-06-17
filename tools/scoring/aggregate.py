"""Aggregate raw pbp plays into normalized per-player-per-week STAT LINES.

All queries are READ-ONLY against NFL_Data and key off (season, week, seas_type)
with the mandatory `no_play = 0` filter. Column names below were verified against
the live schema. Notably there is NO `receiving_touchdown` column — a receiving
TD is the `passing_touchdown` on the catch, credited to `receiver_id`.

Each builder returns a pandas DataFrame whose columns already match the app's
`player_week_stats` table, so the loader can COPY them straight in.
"""

from __future__ import annotations

import pandas as pd


def _query_df(conn, sql: str, params: dict) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
    return pd.DataFrame(rows, columns=cols)


# ---------------------------------------------------------------------------
# Offense (QB/RB/WR/TE) — one row per player who did anything offensive
# ---------------------------------------------------------------------------

_OFFENSE_SQL = """
WITH plays AS (
  SELECT * FROM pbp
  WHERE no_play = 0 AND season = %(season)s AND week = %(week)s AND seas_type = %(stype)s
),
passing AS (
  SELECT passer_id AS gsis_id,
         SUM(passing_yards)     AS pass_yds,
         SUM(passing_touchdown) AS pass_td,
         SUM(intercepted)       AS pass_int
  FROM plays WHERE passer_id IS NOT NULL GROUP BY passer_id
),
rushing AS (
  SELECT runner_id AS gsis_id,
         SUM(rushing_yards)     AS rush_yds,
         SUM(rushing_touchdown) AS rush_td
  FROM plays WHERE runner_id IS NOT NULL GROUP BY runner_id
),
receiving AS (
  SELECT receiver_id AS gsis_id,
         SUM(reception)         AS receptions,
         SUM(rec_yards)         AS rec_yds,
         SUM(passing_touchdown) AS rec_td,   -- receiving TD = passing TD on the catch
         SUM(target)            AS targets
  FROM plays WHERE receiver_id IS NOT NULL GROUP BY receiver_id
),
fumbles AS (
  SELECT gsis_id, COUNT(*) AS fumbles_lost FROM (
    SELECT fumble_player_1_id AS gsis_id FROM plays WHERE fumble_lost_1 = 1 AND fumble_player_1_id IS NOT NULL
    UNION ALL
    SELECT fumble_player_2_id            FROM plays WHERE fumble_lost_2 = 1 AND fumble_player_2_id IS NOT NULL
  ) f GROUP BY gsis_id
),
pass2 AS (
  SELECT two_point_passer_id AS gsis_id, SUM(two_point_att_succeeds) AS pass_2pt
  FROM plays WHERE two_point_passer_id IS NOT NULL GROUP BY two_point_passer_id
),
rush2 AS (
  SELECT two_point_rusher_id AS gsis_id, SUM(two_point_att_succeeds) AS rush_2pt
  FROM plays WHERE two_point_rusher_id IS NOT NULL GROUP BY two_point_rusher_id
),
rec2 AS (
  SELECT two_point_receiver_id AS gsis_id, SUM(two_point_att_succeeds) AS rec_2pt
  FROM plays WHERE two_point_receiver_id IS NOT NULL GROUP BY two_point_receiver_id
),
-- Advanced charting: pass-play accuracy/turnover-worthy/hero flags from `pass`,
-- YAC + missed tackles + air yards (depth_target) from `base`. pbp has no
-- air_yards column in this DB — base.depth_target is the charted equivalent.
adv_pass AS (
  SELECT pl.passer_id AS gsis_id,
         SUM(CASE WHEN pa.acc IN ('ACC','BOD','AWY') THEN 1 ELSE 0 END) AS accurate_throws,
         SUM(COALESCE(pa.catchable, 0))                                 AS catchable_throws,
         SUM(COALESCE(pa.to_worthy, 0))                                 AS to_worthy_throws,
         SUM(COALESCE(pa.wow_throw, 0))                                 AS hero_throws,
         SUM(CASE WHEN pl.attempt = 1 THEN COALESCE(b.depth_target, 0) ELSE 0 END) AS pass_air_yds
  FROM plays pl
  JOIN pass pa     ON pa.play_id = pl.play_id
  LEFT JOIN base b ON b.play_id  = pl.play_id
  WHERE pl.passer_id IS NOT NULL
  GROUP BY pl.passer_id
),
adv_rec AS (
  SELECT pl.receiver_id AS gsis_id,
         SUM(COALESCE(pa.highlight_catch, 0))                       AS hero_catches,
         SUM(CASE WHEN pa.inc_type = 'DP' THEN 1 ELSE 0 END)        AS drops,
         SUM(CASE WHEN pl.target = 1 THEN COALESCE(b.depth_target, 0) ELSE 0 END) AS rec_air_yds,
         SUM(CASE WHEN pl.reception = 1 THEN COALESCE(b.yac, 0) ELSE 0 END)       AS rec_yac,
         SUM(CASE WHEN pl.reception = 1 THEN COALESCE(b.yaco, 0) ELSE 0 END)      AS rec_yaco,
         SUM(CASE WHEN pl.reception = 1 THEN COALESCE(b.mtf, 0) ELSE 0 END)       AS rec_mtf,
         SUM(CASE WHEN pl.reception = 1 AND pl.first_down = 1 THEN 1 ELSE 0 END)  AS rec_fd,
         -- targets where the receiver was the QB's first read (pass.read = '1')
         SUM(CASE WHEN pl.target = 1 AND pa."read" = '1' THEN 1 ELSE 0 END)       AS first_read_targets,
         SUM(CASE WHEN pl.reception = 1 AND COALESCE(pl.rec_yards, 0) >= 15 THEN 1 ELSE 0 END) AS rec_explosive
  FROM plays pl
  LEFT JOIN pass pa ON pa.play_id = pl.play_id
  LEFT JOIN base b  ON b.play_id  = pl.play_id
  WHERE pl.receiver_id IS NOT NULL
  GROUP BY pl.receiver_id
),
-- Expected fantasy points (xFP): PPR-style expectation per opportunity from
-- the xfp_model table (reception 1, yard 0.1, TD 6). Receiving and rushing rows
-- are mutually exclusive there; a player's weekly xFP sums both.
xfp_rec AS (
  SELECT pl.receiver_id AS gsis_id,
         SUM(COALESCE(x.exp_rec, 0) * 1.0
             + COALESCE(x.exp_rec_yards, 0) * 0.1
             + COALESCE(x.exp_rec_td, 0) * 6.0) AS xfp_rec
  FROM plays pl
  JOIN xfp_model x ON x.play_id = pl.play_id AND x.exp_rec IS NOT NULL
  WHERE pl.receiver_id IS NOT NULL
  GROUP BY pl.receiver_id
),
xfp_rush AS (
  SELECT pl.runner_id AS gsis_id,
         SUM(COALESCE(x.exp_rush_yards, 0) * 0.1
             + COALESCE(x.exp_rush_td, 0) * 6.0) AS xfp_rush
  FROM plays pl
  JOIN xfp_model x ON x.play_id = pl.play_id AND x.exp_rush_yards IS NOT NULL
  WHERE pl.runner_id IS NOT NULL
  GROUP BY pl.runner_id
),
-- QB advanced mode: 5+ air-yard splits, sacks taken, EPA over dropbacks.
adv_qb AS (
  SELECT pl.passer_id AS gsis_id,
         SUM(CASE WHEN COALESCE(b.depth_target, 0) >= 5 THEN COALESCE(pl.passing_yards, 0) ELSE 0 END) AS pass_yds_5p,
         SUM(CASE WHEN COALESCE(b.depth_target, 0) >= 5 THEN COALESCE(pl.passing_touchdown, 0) ELSE 0 END) AS pass_td_5p,
         SUM(CASE WHEN COALESCE(b.depth_target, 0) >= 5 AND pl.first_down = 1 AND pl.reception = 1 THEN 1 ELSE 0 END) AS pass_fd_5p,
         SUM(CASE WHEN pl.sack = 1 OR pl.half_sack = 1 THEN 1 ELSE 0 END) AS sacks_taken,
         SUM(COALESCE(pl.dropback, 0)) AS dropbacks,
         SUM(CASE WHEN pl.dropback = 1 THEN COALESCE(e.epa, 0) ELSE 0 END) AS epa_total
  FROM plays pl
  LEFT JOIN base b ON b.play_id = pl.play_id
  LEFT JOIN epa e  ON e.playid  = pl.play_id
  WHERE pl.passer_id IS NOT NULL
  GROUP BY pl.passer_id
),
-- Per-route separation: every route run (RTE/FRTE roles) across the 5 charted
-- skill slots, graded -2..+4. sep_total sums them; routes counts them; the
-- sep_* columns count routes at each grade so grades can score individually.
adv_routes AS (
  SELECT pid AS gsis_id, COUNT(*) AS routes, SUM(COALESCE(sep, 0)) AS sep_total,
         SUM(CASE WHEN sep = -2 THEN 1 ELSE 0 END) AS sep_m2,
         SUM(CASE WHEN sep = -1 THEN 1 ELSE 0 END) AS sep_m1,
         SUM(CASE WHEN sep = 1  THEN 1 ELSE 0 END) AS sep_p1,
         SUM(CASE WHEN sep = 2  THEN 1 ELSE 0 END) AS sep_p2,
         SUM(CASE WHEN sep = 3  THEN 1 ELSE 0 END) AS sep_p3,
         SUM(CASE WHEN sep = 4  THEN 1 ELSE 0 END) AS sep_p4
  FROM (
    SELECT pp.skp1_id AS pid, pp.skp1_sep AS sep, pp.skp1_role AS role, pp.play_id FROM pp
    UNION ALL SELECT pp.skp2_id, pp.skp2_sep, pp.skp2_role, pp.play_id FROM pp
    UNION ALL SELECT pp.skp3_id, pp.skp3_sep, pp.skp3_role, pp.play_id FROM pp
    UNION ALL SELECT pp.skp4_id, pp.skp4_sep, pp.skp4_role, pp.play_id FROM pp
    UNION ALL SELECT pp.skp5_id, pp.skp5_sep, pp.skp5_role, pp.play_id FROM pp
  ) r
  JOIN plays pl ON pl.play_id = r.play_id
  WHERE r.pid IS NOT NULL AND r.role IN ('RTE', 'FRTE')
  GROUP BY pid
),
-- Rushing detail: stuffs (<= 0 yds, kneels excluded), YBC, YACO, MTF, explosives.
adv_rush AS (
  SELECT pl.runner_id AS gsis_id,
         SUM(CASE WHEN COALESCE(pl.rushing_yards, 0) <= 0
                   AND COALESCE(b.primary_concept, '') <> 'Kneel' THEN 1 ELSE 0 END) AS rush_stuffs,
         SUM(COALESCE(b.ybc, 0))  AS rush_ybc,
         SUM(COALESCE(b.yaco, 0)) AS rush_yaco,
         SUM(COALESCE(b.mtf, 0))  AS rush_mtf,
         SUM(CASE WHEN COALESCE(pl.rushing_yards, 0) >= 15 THEN 1 ELSE 0 END) AS rush_explosive
  FROM plays pl
  LEFT JOIN base b ON b.play_id = pl.play_id
  WHERE pl.runner_id IS NOT NULL
  GROUP BY pl.runner_id
),
ids AS (
  SELECT gsis_id FROM passing
  UNION SELECT gsis_id FROM rushing
  UNION SELECT gsis_id FROM receiving
  UNION SELECT gsis_id FROM fumbles
  UNION SELECT gsis_id FROM pass2
  UNION SELECT gsis_id FROM rush2
  UNION SELECT gsis_id FROM rec2
),
roster AS (
  SELECT DISTINCT ON (gsis_id) gsis_id, current_team AS team, position
  FROM weekly_rosters
  WHERE season = %(season)s AND week = %(week)s
  ORDER BY gsis_id, seasontype
)
SELECT
  i.gsis_id,
  %(season)s::int  AS season,
  %(stype)s::text  AS season_type,
  %(week)s::int    AS week,
  r.team, r.position,
  COALESCE(pa.pass_yds,0)   AS pass_yds,
  COALESCE(pa.pass_td,0)    AS pass_td,
  COALESCE(pa.pass_int,0)   AS pass_int,
  COALESCE(p2.pass_2pt,0)   AS pass_2pt,
  COALESCE(ru.rush_yds,0)   AS rush_yds,
  COALESCE(ru.rush_td,0)    AS rush_td,
  COALESCE(r2.rush_2pt,0)   AS rush_2pt,
  COALESCE(re.receptions,0) AS receptions,
  COALESCE(re.rec_yds,0)    AS rec_yds,
  COALESCE(re.rec_td,0)     AS rec_td,
  COALESCE(rc2.rec_2pt,0)   AS rec_2pt,
  COALESCE(re.targets,0)    AS targets,
  COALESCE(fu.fumbles_lost,0) AS fumbles_lost,
  COALESCE(ap.accurate_throws,0) AS accurate_throws,
  COALESCE(ap.catchable_throws,0) AS catchable_throws,
  COALESCE(ap.to_worthy_throws,0) AS to_worthy_throws,
  COALESCE(ap.hero_throws,0)     AS hero_throws,
  COALESCE(ap.pass_air_yds,0)    AS pass_air_yds,
  COALESCE(ar.hero_catches,0)    AS hero_catches,
  COALESCE(ar.drops,0)           AS drops,
  COALESCE(ar.rec_air_yds,0)     AS rec_air_yds,
  COALESCE(ar.rec_yac,0)         AS rec_yac,
  COALESCE(ar.rec_yaco,0)        AS rec_yaco,
  COALESCE(ar.rec_fd,0)          AS rec_fd,
  COALESCE(ar.first_read_targets,0) AS first_read_targets,
  COALESCE(arsh.rush_mtf,0) + COALESCE(ar.rec_mtf,0) AS mtf,
  COALESCE(arsh.rush_mtf,0)      AS rush_mtf,
  COALESCE(ar.rec_mtf,0)         AS rec_mtf,
  COALESCE(arsh.rush_explosive,0) + COALESCE(ar.rec_explosive,0) AS explosive_plays,
  COALESCE(xr.xfp_rec,0) + COALESCE(xru.xfp_rush,0) AS xfp,
  COALESCE(aq.pass_yds_5p,0)     AS pass_yds_5p,
  COALESCE(aq.pass_td_5p,0)      AS pass_td_5p,
  COALESCE(aq.pass_fd_5p,0)      AS pass_fd_5p,
  COALESCE(aq.sacks_taken,0)     AS sacks_taken,
  COALESCE(aq.dropbacks,0)       AS dropbacks,
  COALESCE(aq.epa_total,0)       AS epa_total,
  COALESCE(rt.routes,0)          AS routes,
  COALESCE(rt.sep_total,0)       AS sep_total,
  COALESCE(rt.sep_m2,0)          AS sep_m2,
  COALESCE(rt.sep_m1,0)          AS sep_m1,
  COALESCE(rt.sep_p1,0)          AS sep_p1,
  COALESCE(rt.sep_p2,0)          AS sep_p2,
  COALESCE(rt.sep_p3,0)          AS sep_p3,
  COALESCE(rt.sep_p4,0)          AS sep_p4,
  COALESCE(arsh.rush_stuffs,0)   AS rush_stuffs,
  COALESCE(arsh.rush_ybc,0)      AS rush_ybc,
  COALESCE(arsh.rush_yaco,0)     AS rush_yaco
FROM ids i
LEFT JOIN passing   pa  ON pa.gsis_id  = i.gsis_id
LEFT JOIN rushing   ru  ON ru.gsis_id  = i.gsis_id
LEFT JOIN receiving re  ON re.gsis_id  = i.gsis_id
LEFT JOIN fumbles   fu  ON fu.gsis_id  = i.gsis_id
LEFT JOIN pass2     p2  ON p2.gsis_id  = i.gsis_id
LEFT JOIN rush2     r2  ON r2.gsis_id  = i.gsis_id
LEFT JOIN rec2      rc2 ON rc2.gsis_id = i.gsis_id
LEFT JOIN adv_pass  ap  ON ap.gsis_id  = i.gsis_id
LEFT JOIN adv_rec   ar  ON ar.gsis_id  = i.gsis_id
LEFT JOIN adv_qb    aq  ON aq.gsis_id  = i.gsis_id
LEFT JOIN adv_routes rt ON rt.gsis_id  = i.gsis_id
LEFT JOIN adv_rush  arsh ON arsh.gsis_id = i.gsis_id
LEFT JOIN xfp_rec   xr  ON xr.gsis_id   = i.gsis_id
LEFT JOIN xfp_rush  xru ON xru.gsis_id  = i.gsis_id
LEFT JOIN roster    r   ON r.gsis_id   = i.gsis_id
WHERE i.gsis_id IS NOT NULL
"""


def build_offense(conn, season: int, week: int, stype: str) -> pd.DataFrame:
    return _query_df(conn, _OFFENSE_SQL, {"season": season, "week": week, "stype": stype})


# ---------------------------------------------------------------------------
# Kicker — FG by distance bucket + XP. Misses attributed when kicker id present.
# ---------------------------------------------------------------------------

_KICKER_SQL = """
WITH plays AS (
  SELECT * FROM pbp
  WHERE no_play = 0 AND season = %(season)s AND week = %(week)s AND seas_type = %(stype)s
),
fg AS (
  SELECT field_goal_kicker_id AS gsis_id,
    SUM(CASE WHEN field_goal_made=1 AND field_goal_distance BETWEEN 0  AND 19 THEN 1 ELSE 0 END) AS fg_made_0_19,
    SUM(CASE WHEN field_goal_made=1 AND field_goal_distance BETWEEN 20 AND 29 THEN 1 ELSE 0 END) AS fg_made_20_29,
    SUM(CASE WHEN field_goal_made=1 AND field_goal_distance BETWEEN 30 AND 39 THEN 1 ELSE 0 END) AS fg_made_30_39,
    SUM(CASE WHEN field_goal_made=1 AND field_goal_distance BETWEEN 40 AND 49 THEN 1 ELSE 0 END) AS fg_made_40_49,
    SUM(CASE WHEN field_goal_made=1 AND field_goal_distance >= 50           THEN 1 ELSE 0 END) AS fg_made_50_plus,
    SUM(CASE WHEN field_goal=1 AND field_goal_made=0 THEN 1 ELSE 0 END)                        AS fg_missed
  FROM plays WHERE field_goal_kicker_id IS NOT NULL GROUP BY field_goal_kicker_id
),
xp AS (
  SELECT extra_point_kicker_id AS gsis_id, SUM(extra_point_made) AS xp_made
  FROM plays WHERE extra_point_kicker_id IS NOT NULL GROUP BY extra_point_kicker_id
),
ids AS (SELECT gsis_id FROM fg UNION SELECT gsis_id FROM xp),
roster AS (
  SELECT DISTINCT ON (gsis_id) gsis_id, current_team AS team, position
  FROM weekly_rosters WHERE season = %(season)s AND week = %(week)s
  ORDER BY gsis_id, seasontype
)
SELECT
  i.gsis_id,
  %(season)s::int AS season, %(stype)s::text AS season_type, %(week)s::int AS week,
  r.team, r.position,
  COALESCE(fg.fg_made_0_19,0)    AS fg_made_0_19,
  COALESCE(fg.fg_made_20_29,0)   AS fg_made_20_29,
  COALESCE(fg.fg_made_30_39,0)   AS fg_made_30_39,
  COALESCE(fg.fg_made_40_49,0)   AS fg_made_40_49,
  COALESCE(fg.fg_made_50_plus,0) AS fg_made_50_plus,
  COALESCE(fg.fg_missed,0)       AS fg_missed,
  COALESCE(xp.xp_made,0)         AS xp_made
FROM ids i
LEFT JOIN fg ON fg.gsis_id = i.gsis_id
LEFT JOIN xp ON xp.gsis_id = i.gsis_id
LEFT JOIN roster r ON r.gsis_id = i.gsis_id
WHERE i.gsis_id IS NOT NULL
"""


def build_kicker(conn, season: int, week: int, stype: str) -> pd.DataFrame:
    return _query_df(conn, _KICKER_SQL, {"season": season, "week": week, "stype": stype})


# ---------------------------------------------------------------------------
# Team defense (DST) — keyed by defensive team. points_allowed is layered on
# from games_schedule in build_dst().
# ---------------------------------------------------------------------------

_DST_SQL = """
WITH plays AS (
  SELECT * FROM pbp
  WHERE no_play = 0 AND season = %(season)s AND week = %(week)s AND seas_type = %(stype)s
)
SELECT
  defense AS team,
  SUM(CASE WHEN sack=1 OR half_sack=1 THEN 1 ELSE 0 END)                          AS dst_sacks,
  SUM(COALESCE(intercepted,0))                                                    AS dst_int,
  SUM(COALESCE(opponent_recovery_1,0) + COALESCE(opponent_recovery_2,0))          AS dst_fum_rec,
  SUM(COALESCE(interception_touchdown,0)
      + CASE WHEN opponent_recovery_1=1 THEN COALESCE(fumble_recovery_touchdown_1,0) ELSE 0 END
      + CASE WHEN opponent_recovery_2=1 THEN COALESCE(fumble_recovery_touchdown_2,0) ELSE 0 END) AS dst_td,
  SUM(COALESCE(safety,0))                                                         AS dst_safeties,
  SUM(COALESCE(field_goal_blocked,0) + COALESCE(punt_blocked,0)
      + COALESCE(extra_point_blocked,0))                                          AS dst_blocks
FROM plays
WHERE defense IS NOT NULL
GROUP BY defense
"""

# Points allowed = the opponent's final score, from games_schedule (REG game_type
# matches by week; postseason game_types are mapped to POST).
_POINTS_ALLOWED_SQL = """
SELECT team, points_allowed FROM (
  SELECT home_team AS team, away_score AS points_allowed
    FROM games_schedule
   WHERE season = %(season)s AND week = %(week)s AND game_type = ANY(%(gtypes)s)
  UNION ALL
  SELECT away_team AS team, home_score AS points_allowed
    FROM games_schedule
   WHERE season = %(season)s AND week = %(week)s AND game_type = ANY(%(gtypes)s)
) x
WHERE points_allowed IS NOT NULL
"""

_GAME_TYPES = {"REG": ["REG"], "POST": ["WC", "DIV", "CON", "SB"]}


def build_dst(conn, season: int, week: int, stype: str) -> pd.DataFrame:
    df = _query_df(conn, _DST_SQL, {"season": season, "week": week, "stype": stype})
    if df.empty:
        return df
    pa = _query_df(
        conn,
        _POINTS_ALLOWED_SQL,
        {"season": season, "week": week, "gtypes": _GAME_TYPES.get(stype, ["REG"])},
    )
    pa_map = dict(zip(pa["team"], pa["points_allowed"])) if not pa.empty else {}
    df["points_allowed"] = df["team"].map(pa_map)
    df["gsis_id"] = "DST-" + df["team"].astype(str)
    df["season"] = season
    df["season_type"] = stype
    df["week"] = week
    return df


# ---------------------------------------------------------------------------
# Team coaching staff (COACH) — keyed by offensive team. Scheme usage comes
# from charting (base.pap play-action flag, base.motion pre/at-snap motion);
# win + points scored are layered on from games_schedule like points_allowed.
# ---------------------------------------------------------------------------

_COACH_SQL = """
WITH plays AS (
  SELECT * FROM pbp
  WHERE no_play = 0 AND season = %(season)s AND week = %(week)s AND seas_type = %(stype)s
)
SELECT
  pl.offense AS team,
  SUM(CASE WHEN pl.dropback = 1 AND b.pap = 1 THEN 1 ELSE 0 END) AS pa_dropbacks,
  -- any charted motion: PS pre-snap / DS during-snap / B both / SH shift
  -- (TRIM guards a known stray 'B ' value in base.motion)
  SUM(CASE WHEN pl.dropback = 1
            AND TRIM(COALESCE(b.motion, '')) IN ('PS','DS','B','SH')
           THEN 1 ELSE 0 END)                                    AS motion_dropbacks,
  -- going for it on 4th down: a real pass or run snap (punts/FGs have neither
  -- a dropback nor a runner, so fakes count as going for it; kneels excluded)
  SUM(CASE WHEN pl.down = 4
            AND (pl.dropback = 1 OR pl.runner_id IS NOT NULL)
            AND COALESCE(b.primary_concept, '') <> 'Kneel'
           THEN 1 ELSE 0 END)                                    AS fourth_down_attempts
FROM plays pl
LEFT JOIN base b ON b.play_id = pl.play_id
WHERE pl.offense IS NOT NULL
GROUP BY pl.offense
"""

# Each team's own final score and result, from games_schedule.
_TEAM_RESULT_SQL = """
SELECT team, points_scored, team_win FROM (
  SELECT home_team AS team, home_score AS points_scored,
         CASE WHEN home_score > away_score THEN 1 ELSE 0 END AS team_win
    FROM games_schedule
   WHERE season = %(season)s AND week = %(week)s AND game_type = ANY(%(gtypes)s)
  UNION ALL
  SELECT away_team AS team, away_score AS points_scored,
         CASE WHEN away_score > home_score THEN 1 ELSE 0 END AS team_win
    FROM games_schedule
   WHERE season = %(season)s AND week = %(week)s AND game_type = ANY(%(gtypes)s)
) x
WHERE points_scored IS NOT NULL
"""


def build_coach(conn, season: int, week: int, stype: str) -> pd.DataFrame:
    df = _query_df(conn, _COACH_SQL, {"season": season, "week": week, "stype": stype})
    if df.empty:
        return df
    res = _query_df(
        conn,
        _TEAM_RESULT_SQL,
        {"season": season, "week": week, "gtypes": _GAME_TYPES.get(stype, ["REG"])},
    )
    pts_map = dict(zip(res["team"], res["points_scored"])) if not res.empty else {}
    win_map = dict(zip(res["team"], res["team_win"])) if not res.empty else {}
    df["team_points_scored"] = df["team"].map(pts_map)
    df["team_win"] = df["team"].map(win_map)
    df["gsis_id"] = "COACH-" + df["team"].astype(str)
    df["season"] = season
    df["season_type"] = stype
    df["week"] = week
    return df
