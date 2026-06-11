// Pages: Home, Lineup, Roster
const D = window.FPFL;

function wkRnd(seed) { const x = Math.sin(seed * 777 + 13) * 10000; return x - Math.floor(x); }
function playerWeekPts(pid, week) {
  const base = 4 + wkRnd(pid.length * 3 + pid.charCodeAt(1) * 7 + week * 31) * 22;
  return Math.round(base * 10) / 10;
}

/* ---------------- HOME ---------------- */
function HomePage({ go, roster, lineup, goMatch }) {
  const standings = React.useMemo(() => D.buildStandings(), []);
  const me = standings.find(s => s.teamId === 1);
  const top6 = standings.slice(0, 6);
  const youIn6 = top6.some(s => s.teamId === 1);
  const rows = youIn6 ? top6 : top6.slice(0, 5).concat([me]);
  const w15 = D.matchupsForWeek(15).find(m => m.home === 1 || m.away === 1);
  const oppId = w15.home === 1 ? w15.away : w15.home;
  const opp = standings.find(s => s.teamId === oppId);
  const w14 = D.matchupsForWeek(14).find(m => m.home === 1 || m.away === 1);
  const w14opp = w14.home === 1 ? w14.away : w14.home;
  const w14my = w14.home === 1 ? w14.homePts : w14.awayPts;
  const w14their = w14.home === 1 ? w14.awayPts : w14.homePts;
  const won14 = w14.winner === 1;
  const filled = Object.values(lineup).filter(Boolean).length;

  return (
    <div className="wrap">
      <PageHead
        eyebrow={`${D.LEAGUE.name} · ${D.LEAGUE.season} · ${D.LEAGUE.numTeams} teams`}
        title="Stick Route Merchants"
        sub={<span><b>{me.w}–{me.l}</b> · {ord(me.rank)} place · {fmt1(me.pf)} points for</span>}
        right={<div className="chip"><span>Week 15</span></div>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16, marginTop: 8 }}>
        <Panel title="Week 15 matchup" action={<span className="m" style={{cursor:"default"}}>Results post Tue 6:00 AM ET</span>}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 18, padding: "30px 26px 12px" }}>
            <div style={{ textAlign: "center" }}>
              <div className="disp" style={{ fontSize: 20 }}>Stick Route Merchants</div>
              <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 5 }}>{me.w}–{me.l} · {ord(me.rank)}</div>
              <div className="mono" style={{ fontSize: 52, fontWeight: 700, marginTop: 12 }}>—</div>
            </div>
            <div className="disp" style={{ fontSize: 18, color: "var(--faint)" }}>VS</div>
            <div style={{ textAlign: "center" }}>
              <div className="disp" style={{ fontSize: 20 }}>{D.teamName(oppId)}</div>
              <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 5 }}>{opp.w}–{opp.l} · {ord(opp.rank)}</div>
              <div className="mono" style={{ fontSize: 52, fontWeight: 700, marginTop: 12, color: "var(--muted)" }}>—</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 26px 20px", fontSize: 12, color: "var(--faint)" }}>
            <span>Lineup: <b style={{ color: "var(--muted)" }}>{filled} / 9 set</b> · locks at kickoff</span>
            <span>First lock: Sun 1:00 PM ET</span>
          </div>
          <div style={{ display: "flex", gap: 10, padding: "0 26px 24px", justifyContent: "center" }}>
            <button className="btn pri" onClick={() => go("lineup")}><span>Set lineup</span></button>
            <button className="btn gho" onClick={() => (goMatch ? goMatch(w15) : go("matchups"))}><span>Full matchup</span></button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 26px", padding: "13px 0 18px", borderTop: "1px solid var(--line)", fontSize: 12.5, color: "var(--muted)" }}>
            <span className={"res " + (won14 ? "W" : "L")}>{won14 ? "W" : "L"}</span>
            Week 14 final — <b className="mono" style={{ color: "var(--paper)" }}>{fmt1(w14my)} – {fmt1(w14their)}</b> vs {D.teamName(w14opp)}
          </div>
        </Panel>

        <Panel title="Standings" action={<button className="m" onClick={() => go("standings")}>All 14 teams →</button>}>
          <table className="tbl">
            <thead><tr><th></th><th>Team</th><th className="r">W–L</th><th className="r">PF</th><th className="r">PA</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.teamId} className={s.teamId === 1 ? "you" : "hov"} style={{cursor:"pointer"}} onClick={() => go("standings")}>
                  <td className="rk">{s.rank}</td>
                  <td className="tm">{D.teamName(s.teamId)}{s.teamId === 1 && <span className="youchip">YOU</span>}</td>
                  <td className="r num">{s.w}–{s.l}</td>
                  <td className="r num">{fmt1(s.pf)}</td>
                  <td className="r num">{fmt1(s.pa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div style={{ margin: "16px 0 44px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, background: "var(--surface)", border: "1px solid var(--line)", borderLeft: "3px solid var(--flame)", padding: "18px 26px" }}>
        <div>
          <div className="disp" style={{ fontSize: 18 }}>Championship sprint — you're in the field</div>
          <p style={{ margin: "5px 0 0", fontSize: 13, color: "var(--muted)", maxWidth: 760 }}>
            Top 2 from every league enter one global pool after Week 14. Cumulative starter points across Weeks 15–17 decide the champion. You're seeded #3 — keep setting your lineup.
          </p>
        </div>
        <button className="m linkish" style={{ background: "none", border: "none", fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--paper)", whiteSpace: "nowrap", cursor: "pointer", textDecoration: "none", borderBottom: "2px solid var(--flame)", paddingBottom: 2 }} onClick={() => go("championship")}>
          Sprint leaderboard →
        </button>
      </div>
    </div>
  );
}

/* ---------------- LINEUP ---------------- */
function LineupPage({ roster, lineup, setSlot, onSave }) {
  const [week, setWeek] = React.useState(D.CURRENT_WEEK);
  const isCurrent = week === D.CURRENT_WEEK;
  const byId = new Map(roster.map(p => [p.id, p]));
  const assigned = new Set(Object.values(lineup).filter(Boolean));
  const bench = roster.filter(p => !assigned.has(p.id) && p.slot !== "IR");
  const ir = roster.filter(p => p.slot === "IR");

  const eligible = (def) => roster.filter(p => def.allow.includes(p.pos) && p.slot !== "IR");

  const pastTotal = D.SLOT_DEFS.reduce((s, def) => {
    const pid = lineup[def.slot];
    return s + (pid ? playerWeekPts(pid, week) : 0);
  }, 0);

  return (
    <div className="wrap">
      <PageHead
        eyebrow="Stick Route Merchants"
        title={`Week ${week} lineup`}
        sub={isCurrent ? "Slots lock individually at each player's kickoff. Scored after charting — results post Tuesday 6:00 AM ET." : "Final — scored from post-game charting."}
        right={<WeekSwitch week={week} setWeek={setWeek} />}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "4px 0 14px" }}>
        <span style={{ fontSize: 14, color: "var(--muted)" }}>
          Starter total:{" "}
          <b className="mono" style={{ color: "var(--paper)", fontSize: 16 }}>{isCurrent ? "—" : fmt1(pastTotal)}</b>
        </span>
        {isCurrent && <button className="btn pri" onClick={onSave}><span>Set lineup</span></button>}
      </div>

      <Panel title="Starters">
        <table className="tbl">
          <thead><tr><th style={{width:70}}>Slot</th><th>Player</th><th style={{width:120}}>Kickoff</th><th className="r" style={{width:80}}>Pts</th></tr></thead>
          <tbody>
            {D.SLOT_DEFS.map((def) => {
              const pid = lineup[def.slot];
              const p = pid ? byId.get(pid) : null;
              const locked = p && p.locked;
              return (
                <tr key={def.slot}>
                  <td className="num dim" style={{ fontSize: 11.5 }}>{def.slot}</td>
                  <td>
                    {!isCurrent || locked ? (
                      <span style={{ fontWeight: 700 }}>
                        {p ? <span>{p.name} <span className="dim" style={{ fontWeight: 400 }}>({p.pos} · {p.nfl})</span></span> : <span className="dim">empty</span>}
                        {locked && isCurrent && <span className="dim" style={{ marginLeft: 8, fontSize: 11 }}>LOCKED</span>}
                      </span>
                    ) : (
                      <select className="input" style={{ padding: "5px 10px", fontSize: 13.5, maxWidth: 320 }}
                        value={pid || ""} onChange={(e) => setSlot(def.slot, e.target.value || null)}>
                        <option value="">— empty —</option>
                        {eligible(def).map((c) => (
                          <option key={c.id} value={c.id} disabled={c.locked && c.id !== pid}>
                            {c.name} ({c.pos} · {c.nfl}){c.locked ? " — locked" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="dim" style={{ fontSize: 12 }}>{p ? p.kickoff : ""}</td>
                  <td className="r num">{p ? (isCurrent ? "—" : fmt1(playerWeekPts(p.id, week))) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <div style={{ height: 14 }}></div>
      <Panel title="Bench / IR">
        <table className="tbl">
          <tbody>
            {bench.map((p) => (
              <tr key={p.id}>
                <td className="num dim" style={{ fontSize: 11.5, width: 70 }}>BN</td>
                <td style={{ fontWeight: 700 }}>{p.name} <span className="dim" style={{ fontWeight: 400 }}>({p.pos} · {p.nfl})</span></td>
                <td className="dim" style={{ fontSize: 12, width: 120 }}>{p.kickoff}</td>
                <td className="r num" style={{ width: 80 }}>{isCurrent ? "—" : fmt1(playerWeekPts(p.id, week))}</td>
              </tr>
            ))}
            {ir.map((p) => (
              <tr key={p.id}>
                <td className="num dim" style={{ fontSize: 11.5, width: 70 }}>IR</td>
                <td style={{ fontWeight: 700, color: "var(--muted)" }}>{p.name} <span className="dim" style={{ fontWeight: 400 }}>({p.pos} · {p.nfl})</span></td>
                <td className="dim" style={{ fontSize: 12, width: 120 }}>{p.kickoff}</td>
                <td className="r num" style={{ width: 80 }}>—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <div style={{ height: 44 }}></div>
    </div>
  );
}

function WeekSwitch({ week, setWeek }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button className="btn2" disabled={week <= 1} onClick={() => setWeek(week - 1)}>‹</button>
      <span className="disp" style={{ fontSize: 18, minWidth: 92, textAlign: "center" }}>Week {week}</span>
      <button className="btn2" disabled={week >= D.CURRENT_WEEK} onClick={() => setWeek(week + 1)}>›</button>
    </div>
  );
}

/* ---------------- ROSTER ---------------- */
function RosterPage({ roster, lineup, onDrop, go }) {
  const slotOf = (pid) => {
    const hit = Object.entries(lineup).find(([, v]) => v === pid);
    if (hit) return hit[0];
    const p = roster.find(r => r.id === pid);
    return p && p.slot === "IR" ? "IR" : "BN";
  };
  const order = { QB: 0, RB: 1, WR: 2, TE: 3 };
  const sorted = [...roster].sort((a, b) => (order[a.pos] - order[b.pos]) || (b.pts - a.pts));

  return (
    <div className="wrap">
      <PageHead
        eyebrow="Stick Route Merchants"
        title="Roster"
        sub={<span>{roster.length} players · Week 15 lineup shown · <span className="linkish" onClick={() => go("players")}>add from Players</span></span>}
      />
      <Panel>
        <table className="tbl">
          <thead>
            <tr><th>Player</th><th>Pos</th><th>NFL</th><th>Slot (W15)</th><th className="r">Season pts</th><th>Acquired</th><th></th></tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const s = slotOf(p.id);
              const starter = s !== "BN" && s !== "IR";
              return (
                <tr key={p.id} className="hov">
                  <td className="tm">{p.name}</td>
                  <td><span className={"pos " + p.pos}>{p.pos}</span></td>
                  <td className="dim">{p.nfl}</td>
                  <td>{starter
                    ? <span className="disp" style={{ fontSize: 13, color: "var(--flame)" }}>{s}</span>
                    : <span className="dim">{s}</span>}</td>
                  <td className="r num">{fmt1(p.pts)}</td>
                  <td className="dim" style={{ fontSize: 12 }}>{D.ACQUIRED[p.id] || "—"}</td>
                  <td className="r"><button className="btn2" onClick={() => onDrop(p.id)} disabled={p.locked}>Drop</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      <p className="note" style={{ margin: "12px 0 44px" }}>Dropping a starter empties that lineup slot. Locked players (kickoff passed) can't be dropped this week.</p>
    </div>
  );
}

function ord(n) { return n + (["", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["", "st", "nd", "rd"][n % 100] || "th"); }
function fmt1(n) { return n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }

Object.assign(window, { HomePage, LineupPage, RosterPage, ord, fmt1, playerWeekPts });
