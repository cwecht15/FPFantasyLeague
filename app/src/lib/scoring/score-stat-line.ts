/**
 * The single source of truth for converting a raw weekly stat line into
 * fantasy points under a league's `ScoringRules`. Pure + deterministic so it
 * can run in a Server Action, the worker, or a unit test identically.
 *
 * A `RawStatLine` is what the pipeline pushes into `player_week_stats` (offense)
 * plus the kicker / DST / IDP tables. Every field is optional and treated as 0,
 * so one function scores every roster slot — irrelevant fields contribute 0.
 */

import type { ScoringRules } from "./scoring-systems";

export interface RawStatLine {
  // ---- offense ----
  passYds?: number;
  passTd?: number;
  passInt?: number;
  pass2pt?: number;
  rushYds?: number;
  rushTd?: number;
  rush2pt?: number;
  receptions?: number;
  recYds?: number;
  recTd?: number;
  rec2pt?: number;
  fumblesLost?: number;
  // ---- advanced charting (FantasyPoints data) ----
  accurateThrows?: number;
  toWorthyThrows?: number;
  heroThrows?: number;
  passAirYds?: number;
  heroCatches?: number;
  drops?: number;
  recAirYds?: number;
  recYac?: number;
  recYaco?: number;
  recFd?: number;
  mtf?: number;
  rushMtf?: number;
  recMtf?: number;
  explosivePlays?: number;
  passYds5p?: number;
  passTd5p?: number;
  passFd5p?: number;
  sacksTaken?: number;
  dropbacks?: number;
  epaTotal?: number;
  routes?: number;
  sepTotal?: number;
  sepM2?: number;
  sepM1?: number;
  sepP1?: number;
  sepP2?: number;
  sepP3?: number;
  sepP4?: number;
  rushStuffs?: number;
  rushYbc?: number;
  rushYaco?: number;
  // ---- kicker (made FGs by distance bucket, as stored by the pipeline) ----
  fgMade0_19?: number;
  fgMade20_29?: number;
  fgMade30_39?: number;
  fgMade40_49?: number;
  fgMade50plus?: number;
  fgMissed?: number;
  xpMade?: number;
  // ---- team defense (DST) ----
  dstSacks?: number;
  dstInt?: number;
  dstFumRec?: number;
  dstTd?: number;
  dstSafeties?: number;
  dstBlocks?: number;
  pointsAllowed?: number;
  // ---- team coaching staff (only set on COACH rows) ----
  paDropbacks?: number;
  motionDropbacks?: number;
  fourthDownAttempts?: number;
  teamWin?: number;
  teamPointsScored?: number;
  // ---- IDP (individual defender) ----
  idpSoloTackles?: number;
  idpAssists?: number;
  idpSacks?: number;
  idpTfl?: number;
  idpPassDef?: number;
  idpInt?: number;
  idpFumRec?: number;
  idpForcedFumbles?: number;
  idpDefTd?: number;
}

export interface ScoreResult {
  /** Total fantasy points, rounded to 2 decimals. */
  points: number;
  /** Per-component contribution (only nonzero entries), for box-score display. */
  breakdown: Record<string, number>;
}

const n = (v: number | undefined) => v ?? 0;

function pointsAllowedScore(pa: number, brackets: ScoringRules["dst"]["paBrackets"]): number {
  // Brackets are evaluated low→high; first whose `max` >= pa wins.
  const sorted = [...brackets].sort((a, b) => a.max - b.max);
  for (const b of sorted) {
    if (pa <= b.max) return b.points;
  }
  return sorted.length ? sorted[sorted.length - 1].points : 0;
}

export function scoreStatLine(
  stats: RawStatLine,
  rules: ScoringRules,
  opts: { isTightEnd?: boolean; position?: string } = {},
): ScoreResult {
  const b: Record<string, number> = {};
  const add = (key: string, v: number) => {
    if (v !== 0) b[key] = (b[key] ?? 0) + v;
  };
  const finish = (): ScoreResult => {
    let total = 0;
    for (const key of Object.keys(b)) {
      b[key] = Math.round(b[key] * 100) / 100;
      total += b[key];
    }
    return { points: Math.round(total * 100) / 100, breakdown: b };
  };

  // ---- QB advanced mode: REPLACES standard QB scoring entirely -------------
  // Only 5+ air-yard passing production counts; sacks and EPA/dropback score
  // directly. Fumbles lost still apply at the base rate.
  if (rules.qbAdvanced && opts.position === "QB") {
    const q = rules.qbAdvanced;
    add("deepPassYds", n(stats.passYds5p) * q.deepYd);
    add("deepFirstDowns", n(stats.passFd5p) * q.deepFirstDown);
    add("deepPassTd", n(stats.passTd5p) * q.deepTd);
    add("sacks", n(stats.sacksTaken) * q.sack);
    add("interception", n(stats.passInt) * q.interception);
    add("rushYds", n(stats.rushYds) * q.rushYd);
    add("rushTd", n(stats.rushTd) * q.rushTd);
    if (n(stats.dropbacks) > 0) {
      add("epaPerDropback", (n(stats.epaTotal) / n(stats.dropbacks)) * q.epaPerDropback);
    }
    add("epaTotal", n(stats.epaTotal) * n(q.epaTotal));
    add("fumbleLost", n(stats.fumblesLost) * rules.fumbleLost);
    return finish();
  }

  // ---- passing ----
  add("passYds", n(stats.passYds) / rules.passYdsPerPoint);
  add("passTd", n(stats.passTd) * rules.passTd);
  add("interception", n(stats.passInt) * rules.interception);
  add("pass2pt", n(stats.pass2pt) * rules.pass2pt);

  // ---- rushing ----
  add("rushYds", n(stats.rushYds) / rules.rushYdsPerPoint);
  add("rushTd", n(stats.rushTd) * rules.rushTd);
  add("rush2pt", n(stats.rush2pt) * rules.rush2pt);

  // ---- receiving ----
  const recPts =
    opts.isTightEnd && rules.tePremiumReception !== undefined
      ? rules.tePremiumReception
      : rules.reception;
  add("receptions", n(stats.receptions) * recPts);
  add("recYds", n(stats.recYds) / rules.recYdsPerPoint);
  add("recTd", n(stats.recTd) * rules.recTd);
  add("rec2pt", n(stats.rec2pt) * rules.rec2pt);

  // ---- misc ----
  add("fumbleLost", n(stats.fumblesLost) * rules.fumbleLost);

  // ---- per-game yardage bonuses (weekly totals) ----
  for (const bonus of rules.bonuses ?? []) {
    const total =
      bonus.stat === "pass_yds"
        ? n(stats.passYds)
        : bonus.stat === "rush_yds"
          ? n(stats.rushYds)
          : n(stats.recYds);
    if (total >= bonus.threshold) add(`bonus_${bonus.stat}`, bonus.points);
  }

  // ---- kicking ----
  const k = rules.kicking;
  const fg0_39 = n(stats.fgMade0_19) + n(stats.fgMade20_29) + n(stats.fgMade30_39);
  add("fg0_39", fg0_39 * k.fg0_39);
  add("fg40_49", n(stats.fgMade40_49) * k.fg40_49);
  add("fg50plus", n(stats.fgMade50plus) * k.fg50plus);
  add("xp", n(stats.xpMade) * k.xp);
  add("fgMiss", n(stats.fgMissed) * k.fgMiss);

  // ---- team defense (DST) ----
  const d = rules.dst;
  add("dstSack", n(stats.dstSacks) * d.sack);
  add("dstInt", n(stats.dstInt) * d.int);
  add("dstFumRec", n(stats.dstFumRec) * d.fumRec);
  add("dstTd", n(stats.dstTd) * d.td);
  add("dstSafety", n(stats.dstSafeties) * d.safety);
  add("dstBlock", n(stats.dstBlocks) * d.blockedKick);
  if (stats.pointsAllowed !== undefined) {
    add("dstPointsAllowed", pointsAllowedScore(stats.pointsAllowed, d.paBrackets));
  }

  // ---- advanced charting (optional) ----
  if (rules.advanced) {
    const a = rules.advanced;
    add("accurateThrow", n(stats.accurateThrows) * a.accurateThrow);
    add("turnoverWorthy", n(stats.toWorthyThrows) * a.turnoverWorthyThrow);
    add("heroThrow", n(stats.heroThrows) * a.heroThrow);
    add("heroCatch", n(stats.heroCatches) * a.heroCatch);
    add("drop", n(stats.drops) * a.drop);
    add("missedTackleForced", n(stats.mtf) * a.missedTackleForced);
    add("rushMtf", n(stats.rushMtf) * n(a.rushMtf));
    add("recMtf", n(stats.recMtf) * n(a.recMtf));
    add("passAirYds", n(stats.passAirYds) * a.passAirYd);
    add("recAirYds", n(stats.recAirYds) * a.recAirYd);
    add("recYac", n(stats.recYac) * a.recYacYd);
    add("recYaco", n(stats.recYaco) * n(a.recYacoYd));
    add("recFirstDown", n(stats.recFd) * n(a.recFirstDown));
    add("explosivePlay", n(stats.explosivePlays) * n(a.explosivePlay));
    add("separation", n(stats.sepTotal) * a.sepPoint);
    add("sepM2", n(stats.sepM2) * n(a.sepM2));
    add("sepM1", n(stats.sepM1) * n(a.sepM1));
    add("sepP1", n(stats.sepP1) * n(a.sepP1));
    add("sepP2", n(stats.sepP2) * n(a.sepP2));
    add("sepP3", n(stats.sepP3) * n(a.sepP3));
    add("sepP4", n(stats.sepP4) * n(a.sepP4));
    add("rushStuff", n(stats.rushStuffs) * a.rushStuff);
    add("rushYbc", n(stats.rushYbc) * a.ybcYd);
    add("rushYaco", n(stats.rushYaco) * a.yacoYd);
  }

  // ---- team coaching staff (optional; stats only exist on COACH rows) ----
  if (rules.coaching) {
    const c = rules.coaching;
    add("paDropbacks", n(stats.paDropbacks) * c.paDropback);
    add("motionDropbacks", n(stats.motionDropbacks) * c.motionDropback);
    add("fourthDownGo", n(stats.fourthDownAttempts) * n(c.fourthDownGo));
    add("teamWin", n(stats.teamWin) * c.win);
    if (stats.teamPointsScored !== undefined && stats.teamPointsScored >= 30) {
      add("scored30Plus", c.score30Bonus);
    }
  }

  // ---- IDP (optional) ----
  if (rules.idp) {
    const i = rules.idp;
    add("idpSoloTackle", n(stats.idpSoloTackles) * i.soloTackle);
    add("idpAssist", n(stats.idpAssists) * i.assist);
    add("idpSack", n(stats.idpSacks) * i.sack);
    add("idpTfl", n(stats.idpTfl) * i.tfl);
    add("idpPassDef", n(stats.idpPassDef) * i.passDef);
    add("idpInt", n(stats.idpInt) * i.int);
    add("idpFumRec", n(stats.idpFumRec) * i.fumRec);
    add("idpForcedFumble", n(stats.idpForcedFumbles) * i.forcedFumble);
    add("idpDefTd", n(stats.idpDefTd) * i.td);
  }

  return finish();
}
