// Pages: Players, Matchups, Standings
const D2 = window.FPFL;

/* ---------------- PLAYERS ---------------- */
function PlayersPage({ roster, freeAgents, onAdd, onDrop }) {
  const [q, setQ] = React.useState("");
  const [pos, setPos] = React.useState("ALL");
  const [view, setView] = React.useState("all");

  const mine = roster.map(p => ({ ...p, ownerId: 1 }));
  const others = D2.OWNED_BY_OTHERS.map(p => ({ ...p, ownerId: p.owner }));
  const fas = freeAgents.map(p => ({ ...p, ownerId: null }));
  let pool = [...mine, ...others, ...fas];

  if (pos !== "ALL") pool = pool.filter(p => p.pos === pos);
  if (q.trim()) pool = pool.filter(p => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  if (view === "available") pool = pool.filter(p => p.ownerId === null);
  if (view === "mine") pool = pool.filter(p => p.ownerId === 1);
  pool.sort((a, b) => b.pts - a.pts);

  return (
    <div className="wrap">
      <PageHead
        eyebrow={`${D2.LEAGUE.name} · player pool`}
        title="Players"
        sub="Season points under this league's scoring (FP Advanced). Offense only — no kickers, no defenses."
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center", marginBottom: 14 }}>
        <input className="input" style={{ width: 240 }} placeholder="Search players…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ display: "flex", gap: 6 }}>
          {["ALL", "QB", "RB", "WR", "TE"].map((p) => (
            <button key={p} className={"pill" + (pos === p ? " on" : "")} onClick={() => setPos(p)}>{p}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["all", "All"], ["available", "Available"], ["mine", "My team"]].map(([v, l]) => (
            <button key={v} className={"pill" + (view === v ? " on" : "")} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
      </div>

      <Panel>
        <table className="tbl">
          <thead>
            <tr><th>Player</th><th>Pos</th><th>NFL</th><th className="r">Season pts</th><th>Owner</th><th></th></tr>
          </thead>
          <tbody>
            {pool.map((p) => (
              <tr key={p.id} className="hov">
                <td className="tm">{p.name}</td>
                <td><span className={"pos " + p.pos}>{p.pos}</span></td>
                <td className="dim">{p.nfl}</td>
                <td className="r num">{fmt1(p.pts)}</td>
                <td className="dim">{p.ownerId ? D2.teamName(p.ownerId) : <span style={{ color: "var(--paper)", fontWeight: 700 }}>Free agent</span>}</td>
                <td className="r">
                  {p.ownerId === null && <button className="btn2 pri" onClick={() => onAdd(p.id)}>Add</button>}
                  {p.ownerId === 1 && <button className="btn2" onClick={() => onDrop(p.id)} disabled={p.locked}>Drop</button>}
                </td>
              </tr>
            ))}
            {pool.length === 0 && <tr><td colSpan="6" className="empty">No players match.</td></tr>}
          </tbody>
        </table>
      </Panel>
      <p className="note" style={{ margin: "12px 0 44px" }}>Adds are instant for free agents. Players dropped in the last 24h go through <b>waivers</b> — claims process Wednesday 10:00 AM ET.</p>
    </div>
  );
}

/* ---------------- MATCHUPS ---------------- */
function MatchupsPage({ onOpen }) {
  const [week, setWeek] = React.useState(D2.CURRENT_WEEK);
  const ms = D2.matchupsForWeek(week);
  const isCurrent = week === D2.CURRENT_WEEK;
  return (
    <div className="wrap">
      <PageHead
        eyebrow={`${D2.LEAGUE.name} · ${D2.LEAGUE.season}`}
        title={`Week ${week} matchups`}
        sub={isCurrent ? "Scheduled — scored after post-game charting, results Tuesday 6:00 AM ET. Click a matchup for the head-to-head." : "Final. Click a matchup for the head-to-head."}
        right={<WeekSwitch week={week} setWeek={setWeek} />}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 44 }}>
        {ms.map((m) => {
          const isMine = m.home === 1 || m.away === 1;
          return (
            <div key={m.id} className="panel" style={{ cursor: "pointer", ...(isMine ? { borderColor: "rgba(204,51,51,0.5)" } : {}) }} onClick={() => onOpen(m)}>
              <MatchRow team={m.home} pts={m.homePts} win={m.winner === m.home} done={m.status === "final"} />
              <MatchRow team={m.away} pts={m.awayPts} win={m.winner === m.away} done={m.status === "final"} top />
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 20px 12px", fontSize: 11, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 800 }}>
                <span>{m.status === "final" ? "Final" : "Scheduled"}</span>
                <span style={{ display: "flex", gap: 14 }}>
                  {isMine && <span style={{ color: "var(--flame)" }}>Your matchup</span>}
                  <span style={{ color: "var(--faint)" }}>Head-to-head →</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchRow({ team, pts, win, done, top }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "14px 20px 4px", borderTop: top ? "1px solid var(--line)" : "none" }}>
      <span className="disp" style={{ fontSize: 19, color: done && !win ? "var(--muted)" : "var(--paper)" }}>
        {D2.teamName(team)}{team === 1 && <span className="youchip" style={{ verticalAlign: 3 }}>YOU</span>}
        {done && win && <span style={{ marginLeft: 10, verticalAlign: 3 }} className="res W">W</span>}
      </span>
      <span className="mono" style={{ fontSize: 24, fontWeight: 600, color: done ? (win ? "var(--paper)" : "var(--muted)") : "var(--faint)" }}>
        {done ? fmt1(pts) : "—"}
      </span>
    </div>
  );
}

/* ---------------- STANDINGS ---------------- */
function StandingsPage() {
  const standings = React.useMemo(() => D2.buildStandings(), []);
  const weeks = Array.from({ length: D2.CURRENT_WEEK - 1 }, (_, i) => i + 1);
  const weekScores = React.useMemo(() => {
    const map = new Map(); // teamId -> { w -> { pts, won, high } }
    for (const t of D2.TEAMS) map.set(t.id, {});
    for (const w of weeks) {
      const ms = D2.matchupsForWeek(w);
      let high = 0, highTeam = null;
      for (const m of ms) {
        if (m.homePts > high) { high = m.homePts; highTeam = m.home; }
        if (m.awayPts > high) { high = m.awayPts; highTeam = m.away; }
      }
      for (const m of ms) {
        map.get(m.home)[w] = { pts: m.homePts, won: m.winner === m.home, high: m.home === highTeam };
        map.get(m.away)[w] = { pts: m.awayPts, won: m.winner === m.away, high: m.away === highTeam };
      }
    }
    return map;
  }, []);

  return (
    <div className="wrap">
      <PageHead
        eyebrow={`${D2.LEAGUE.name} · through Week 14`}
        title="Standings"
        sub={<span>Top <b>2</b> enter the cross-league championship sprint — the field is locked.</span>}
      />
      <Panel>
        <table className="tbl">
          <thead>
            <tr><th></th><th>Team</th><th>Manager</th><th className="r">W</th><th className="r">L</th><th className="r">PF</th><th className="r">PA</th><th className="r">Last 5</th></tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <React.Fragment key={s.teamId}>
                <tr className={s.teamId === 1 ? "you" : "hov"}>
                  <td className="rk">{s.rank}</td>
                  <td className="tm">{D2.teamName(s.teamId)}{s.teamId === 1 && <span className="youchip">YOU</span>}</td>
                  <td className="dim">{(D2.TEAMS.find(t => t.id === s.teamId) || {}).owner}</td>
                  <td className="r num">{s.w}</td>
                  <td className="r num">{s.l}</td>
                  <td className="r num">{fmt1(s.pf)}</td>
                  <td className="r num">{fmt1(s.pa)}</td>
                  <td className="r">
                    <span style={{ display: "inline-flex", gap: 3 }}>
                      {s.hist.slice(-5).map((r, j) => <span key={j} className={"res " + r} style={{ width: 18, height: 18, fontSize: 11 }}>{r}</span>)}
                    </span>
                  </td>
                </tr>
                {i === 1 && (
                  <tr>
                    <td colSpan="8" style={{ padding: 0, border: "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 14px", background: "var(--ink)" }}>
                        <div style={{ height: 2, background: "var(--flame)", flex: 1 }}></div>
                        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.14em", color: "var(--flame)" }}>CHAMPIONSHIP SPRINT LINE</span>
                        <div style={{ height: 2, background: "var(--flame)", flex: 1 }}></div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </Panel>

      <div style={{ height: 16 }}></div>
      <Panel title="Weekly scoring" action={<span className="m" style={{ cursor: "default" }}>red = league high · bold = win</span>}>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ whiteSpace: "nowrap" }}>
            <thead>
              <tr>
                <th>Team</th>
                {weeks.map(w => <th key={w} className="r">W{w}</th>)}
                <th className="r">Avg</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => {
                const row = weekScores.get(s.teamId);
                const avg = weeks.reduce((a, w) => a + (row[w] ? row[w].pts : 0), 0) / weeks.length;
                return (
                  <tr key={s.teamId} className={s.teamId === 1 ? "you" : "hov"}>
                    <td className="tm" style={{ fontSize: 12.5 }}>{D2.teamName(s.teamId)}</td>
                    {weeks.map(w => {
                      const c = row[w];
                      return (
                        <td key={w} className="r num" style={{ fontSize: 11.5, color: c && c.high ? "var(--flame)" : c && c.won ? "var(--paper)" : "var(--faint)", fontWeight: c && c.won ? 700 : 400 }}>
                          {c ? c.pts.toFixed(1) : "—"}
                        </td>
                      );
                    })}
                    <td className="r num" style={{ fontSize: 11.5, fontWeight: 700 }}>{avg.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <div style={{ height: 44 }}></div>
    </div>
  );
}

Object.assign(window, { PlayersPage, MatchupsPage, StandingsPage });
