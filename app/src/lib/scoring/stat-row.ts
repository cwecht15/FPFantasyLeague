/**
 * Convert a `player_week_stats` DB row into a RawStatLine for scoreStatLine.
 * DB nullables (DST/IDP fields on non-DST rows) become `undefined` — passing
 * null pointsAllowed through would score points-allowed brackets for every
 * offensive player.
 */

import type { playerWeekStats } from "@/lib/db/schema";
import type { RawStatLine } from "./score-stat-line";

export type PlayerWeekStatsRow = typeof playerWeekStats.$inferSelect;

const u = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

export function statRowToLine(row: PlayerWeekStatsRow): RawStatLine {
  return {
    passYds: row.passYds,
    passTd: row.passTd,
    passInt: row.passInt,
    pass2pt: row.pass2pt,
    rushYds: row.rushYds,
    rushTd: row.rushTd,
    rush2pt: row.rush2pt,
    receptions: row.receptions,
    recYds: row.recYds,
    recTd: row.recTd,
    rec2pt: row.rec2pt,
    fumblesLost: row.fumblesLost,
    accurateThrows: row.accurateThrows,
    toWorthyThrows: row.toWorthyThrows,
    heroThrows: row.heroThrows,
    passAirYds: row.passAirYds,
    heroCatches: row.heroCatches,
    drops: row.drops,
    recAirYds: row.recAirYds,
    recYac: row.recYac,
    mtf: row.mtf,
    passYds5p: row.passYds5p,
    passTd5p: row.passTd5p,
    passFd5p: row.passFd5p,
    sacksTaken: row.sacksTaken,
    dropbacks: row.dropbacks,
    epaTotal: row.epaTotal,
    routes: row.routes,
    sepTotal: row.sepTotal,
    rushStuffs: row.rushStuffs,
    rushYbc: row.rushYbc,
    rushYaco: row.rushYaco,
    fgMade0_19: row.fgMade0_19,
    fgMade20_29: row.fgMade20_29,
    fgMade30_39: row.fgMade30_39,
    fgMade40_49: row.fgMade40_49,
    fgMade50plus: row.fgMade50plus,
    fgMissed: row.fgMissed,
    xpMade: row.xpMade,
    dstSacks: u(row.dstSacks),
    dstInt: u(row.dstInt),
    dstFumRec: u(row.dstFumRec),
    dstTd: u(row.dstTd),
    dstSafeties: u(row.dstSafeties),
    dstBlocks: u(row.dstBlocks),
    pointsAllowed: u(row.pointsAllowed),
    idpSoloTackles: u(row.idpSoloTackles),
    idpAssists: u(row.idpAssists),
    idpSacks: u(row.idpSacks),
    idpTfl: u(row.idpTfl),
    idpPassDef: u(row.idpPassDef),
    idpInt: u(row.idpInt),
    idpFumRec: u(row.idpFumRec),
    idpForcedFumbles: u(row.idpForcedFumbles),
    idpDefTd: u(row.idpDefTd),
  };
}
