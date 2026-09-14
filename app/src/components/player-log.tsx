"use client";

import { Fragment, useState, useTransition } from "react";
import { getPlayerLog, type GameLog, type GameLogRow } from "@/lib/players/actions";
import { fmt1 } from "@/lib/format";

/** 30 → "30", 4.35 → "4.35", 0.213 → "0.21" (raw stats: counts stay whole). */
const fmtRaw = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
/** 2 → "2", 0.05 → "0.05", 1/25 → "0.04", -1 → "-1" (rates: trim, up to 3 decimals). */
const fmtRate = (v: number) => String(Number(v.toFixed(3)));
/** Component points: 2 decimals so raw × rate reconciles, trailing zero trimmed to one place. */
const fmtPts = (v: number) => {
  const s = v.toFixed(2);
  return s.endsWith("0") ? s.slice(0, -1) : s;
};

/** Full box score for one week: every component as raw × rate = pts. */
function WeekDetail({ row }: { row: GameLogRow }) {
  if (row.detail.length === 0) {
    return <p className="empty py-2">No scoring components this week.</p>;
  }
  const grid = { display: "grid", gridTemplateColumns: "minmax(0,1fr) 72px 90px 72px", gap: "0 12px" } as const;
  return (
    <div className="border-l-2 border-flame pl-3">
      <div className="label" style={{ ...grid, fontSize: 10, paddingBottom: 4 }}>
        <span>Week {row.week} breakdown</span>
        <span className="text-right">Raw</span>
        <span className="text-right">Rate</span>
        <span className="text-right">Pts</span>
      </div>
      {row.detail.map((d) => (
        <div key={d.key} style={{ ...grid, padding: "3px 0", fontSize: 12.5 }}>
          <span className="truncate">{d.label}</span>
          <span className="text-right font-mono">{d.raw === null ? "—" : fmtRaw(d.raw)}</span>
          <span className="text-right font-mono text-faint">
            {d.rate === null ? (d.raw === null ? "—" : "bonus") : `× ${fmtRate(d.rate)}`}
          </span>
          <span className={`text-right font-mono font-bold ${d.points < 0 ? "text-flame" : ""}`}>
            {fmtPts(d.points)}
          </span>
        </div>
      ))}
      <div style={{ ...grid, padding: "5px 0 0", fontSize: 12.5 }} className="border-t border-line">
        <span className="label" style={{ fontSize: 10 }}>
          Total
        </span>
        <span />
        <span />
        <span className="text-right font-mono font-bold text-flame">{fmt1(row.points)}</span>
      </div>
    </div>
  );
}

/** A player name that opens their weekly game log (scored under this
 *  league's rules) in a popup. Drop it anywhere a name renders. */
export function PlayerName({
  slug,
  gsisId,
  name,
  className,
  week,
}: {
  slug: string;
  gsisId: string;
  name: string;
  className?: string;
  /** Week whose full breakdown opens expanded (e.g. the matchup's week); else the latest. */
  week?: number;
}) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<GameLog | null>(null);
  const [pending, startTransition] = useTransition();
  // undefined = nothing chosen yet (open `week`, else the latest); null = user closed it.
  const [openWeek, setOpenWeek] = useState<number | null | undefined>(undefined);

  const load = (season?: number) =>
    startTransition(async () => {
      setLog(await getPlayerLog(slug, gsisId, season));
    });

  const rows = log?.rows ?? [];
  const shownWeek =
    openWeek === null
      ? null
      : openWeek !== undefined && rows.some((r) => r.week === openWeek)
        ? openWeek
        : week !== undefined && rows.some((r) => r.week === week)
          ? week
          : (rows[rows.length - 1]?.week ?? null);
  const shownRow = rows.find((r) => r.week === shownWeek) ?? null;

  return (
    <>
      <button
        type="button"
        className={`namebtn ${className ?? ""}`}
        style={{ font: "inherit", color: "inherit" }}
        onClick={() => {
          setOpen(true);
          if (!log) load();
        }}
      >
        {name}
      </button>
      {open && (
        <div className="veil" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
          <div className="sheet panel" onClick={(e) => e.stopPropagation()}>
            <div className="ptitle">
              <span className="t">
                {log?.name ?? name}
                {log?.position && (
                  <span className={`pos ${log.position} ml-2 align-middle`}>{log.position}</span>
                )}
                {log?.nflTeam && <span className="ml-2 text-[12px] text-faint">{log.nflTeam}</span>}
              </span>
              <span className="flex items-center gap-2">
                {log?.seasons?.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`pill ${log.season === s ? "on" : ""}`}
                    style={{ padding: "3px 9px", fontSize: 11 }}
                    onClick={() => load(s)}
                  >
                    {s}
                  </button>
                ))}
                <button type="button" className="btn2" onClick={() => setOpen(false)}>
                  ✕
                </button>
              </span>
            </div>

            {pending || !log ? (
              <p className="empty">Loading…</p>
            ) : log.error ? (
              <p className="empty">{log.error}</p>
            ) : log.rows!.length === 0 ? (
              <p className="empty">No games in {log.season} — stat lines post after charting.</p>
            ) : (
              <>
                {shownRow && (
                  <div className="border-b border-line px-[22px] pb-3 pt-3">
                    <WeekDetail row={shownRow} />
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="tbl whitespace-nowrap">
                    <thead>
                      <tr>
                        <th style={{ width: 44 }}>Wk</th>
                        <th>Team</th>
                        {log.cols!.map((c) => (
                          <th key={c} className="r">
                            {c}
                          </th>
                        ))}
                        <th className="r">FPTS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {log.rows!.map((r) => {
                        const expanded = r.week === shownWeek;
                        return (
                          <Fragment key={r.week}>
                            <tr
                              className="hov"
                              style={{ cursor: "pointer" }}
                              onClick={() => setOpenWeek(expanded ? null : r.week)}
                              aria-expanded={expanded}
                            >
                              <td className="num dim">
                                <span className="mr-1 inline-block w-2 text-[10px]">{expanded ? "▾" : "▸"}</span>
                                {r.week}
                              </td>
                              <td className="dim">{r.team ?? "—"}</td>
                              {r.values.map((v, i) => (
                                <td key={i} className={`r num ${v === 0 ? "dim" : ""}`} style={{ fontSize: 12 }}>
                                  {v === 0 ? "—" : fmt1(v)}
                                </td>
                              ))}
                              <td className="r num font-bold">{fmt1(r.points)}</td>
                            </tr>
                          </Fragment>
                        );
                      })}
                      <tr>
                        <td className="dim" colSpan={2 + log.cols!.length}>
                          {log.rows!.length} games
                        </td>
                        <td className="r num font-bold text-flame">{fmt1(log.total ?? 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="note px-[22px] pb-3 pt-2" style={{ fontSize: 11 }}>
                  Points by scoring component under this league&apos;s rules — top components
                  by season impact get columns. Click a week for every raw stat × rate.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
