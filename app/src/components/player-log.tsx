"use client";

import { useState, useTransition } from "react";
import { getPlayerLog, type GameLog } from "@/lib/players/actions";
import { fmt1 } from "@/lib/format";

/** A player name that opens their weekly game log (scored under this
 *  league's rules) in a popup. Drop it anywhere a name renders. */
export function PlayerName({
  slug,
  gsisId,
  name,
  className,
}: {
  slug: string;
  gsisId: string;
  name: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<GameLog | null>(null);
  const [pending, startTransition] = useTransition();

  const load = (season?: number) =>
    startTransition(async () => {
      setLog(await getPlayerLog(slug, gsisId, season));
    });

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
                      {log.rows!.map((r) => (
                        <tr key={r.week}>
                          <td className="num dim">{r.week}</td>
                          <td className="dim">{r.team ?? "—"}</td>
                          {r.values.map((v, i) => (
                            <td key={i} className={`r num ${v === 0 ? "dim" : ""}`} style={{ fontSize: 12 }}>
                              {v === 0 ? "—" : fmt1(v)}
                            </td>
                          ))}
                          <td className="r num font-bold">{fmt1(r.points)}</td>
                        </tr>
                      ))}
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
                  by season impact get columns.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
