// Matchup detail — head-to-head, slot by slot
const D6 = window.FPFL;

function scaledPts(players, week, teamTotal) {
  const raw = players.map(p => playerWeekPts(p.name, week));
  const sum = raw.reduce((a, b) => a + b, 0);
  const scaled = raw.map(v => Math.round((v * teamTotal / sum) * 10) / 10);
  const diff = Math.round((teamTotal - scaled.reduce((a, b) => a + b, 0)) * 10) / 10;
  scaled[0] = Math.round((scaled[0] + diff) * 10) / 10;
  return scaled;
}

function MatchupDetailPage({ match, roster, lineup, goBack }) {
  const done = match.status === "final";
  const week = match.week;

  // build each side's 9 starters
  const sideFor = (teamId) => {
    if (teamId === 1) {
      return D6.SLOT_DEFS.map((def) => {
        const pid = lineup[def.slot];
        const p = pid ? roster.find(r => r.id === pid) : null;
        return p ? { slot: def.slot, name: p.name, pos: p.pos, nfl: p.nfl, kickoff: p.kickoff, locked: p.locked }
                 : { slot: def.slot, name: null };
      });
    }
    return D6.opponentLineup(teamId);
  };

  const homeSide = sideFor(match.home);
  const awaySide = sideFor(match.away);
  let homePts = [], awayPts = [];
  if (done) {
    homePts = scaledPts(homeSide.filter(p => p.name), week, match.homePts);
    awayPts = scaledPts(awaySide.filter(p => p.name), week, match.awayPts);
  }

  const homeWin = done && match.winner === match.home;
  const awayWin = done && match.winner === match.away;
  const homeTop = done ? Math.max(...homePts) : 0;
  const awayTop = done ? Math.max(...awayPts) : 0;

  const TeamHead = ({ teamId, pts, win, align }) => (
    <div style={{ textAlign: align }}>
      <div className="disp" style={{ fontSize: 24 }}>
        {win && align === "right" && <span className="res W" style={{ marginRight: 10, verticalAlign: 4 }}>W</span>}
        {D6.teamName(teamId)}
        {teamId === 1 && <span className="youchip" style={{ verticalAlign: 4 }}>YOU</span>}
        {win && align === "left" && <span className="res W" style={{ marginLeft: 10, verticalAlign: 4 }}>W</span>}
      </div>
      <div className="mono" style={{ fontSize: 46, fontWeight: 700, marginTop: 8, color: done ? (win ? "var(--paper)" : "var(--muted)") : "var(--faint)" }}>
        {done ? fmt1(pts) : "—"}
      </div>
    </div>
  );

  const Row = ({ def, i }) => {
    const h = homeSide[i], a = awaySide[i];
    const hp = done && h.name ? homePts[homeSide.filter(p => p.name).indexOf(h)] : null;
    const ap = done && a.name ? awayPts[awaySide.filter(p => p.name).indexOf(a)] : null;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 64px 1fr", alignItems: "center", padding: "10px 22px", borderBottom: "1px solid var(--line)" }}>
        <PlayerCell p={h} pts={hp} top={done && hp === homeTop} done={done} align="left" />
        <div className="disp" style={{ textAlign: "center", fontSize: 12, color: "var(--faint)" }}>{def.slot}</div>
        <PlayerCell p={a} pts={ap} top={done && ap === awayTop} done={done} align="right" />
      </div>
    );
  };

  return (
    <div className="wrap">
      <PageHead
        eyebrow={<span className="linkish" style={{ color: "var(--flame)", textDecoration: "none", cursor: "pointer" }} onClick={goBack}>← Week {week} matchups</span>}
        title={done ? `Week ${week} — Final` : `Week ${week} matchup`}
        sub={done ? "Scored from post-game charting." : "Scored after charting — results post Tuesday 6:00 AM ET. Slots lock at each player's kickoff."}
      />

      <Panel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 20, padding: "28px 26px 20px", borderBottom: "1px solid var(--line)" }}>
          <TeamHead teamId={match.home} pts={match.homePts} win={homeWin} align="left" />
          <div className="disp" style={{ fontSize: 17, color: "var(--faint)" }}>VS</div>
          <TeamHead teamId={match.away} pts={match.awayPts} win={awayWin} align="right" />
        </div>
        {D6.SLOT_DEFS.map((def, i) => <Row key={def.slot} def={def} i={i} />)}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 64px 1fr", padding: "13px 22px", background: "var(--ink)" }}>
          <span className="mono" style={{ fontSize: 17, fontWeight: 700 }}>{done ? fmt1(match.homePts) : "—"}</span>
          <span className="disp" style={{ textAlign: "center", fontSize: 11, color: "var(--faint)", alignSelf: "center" }}>TOTAL</span>
          <span className="mono" style={{ fontSize: 17, fontWeight: 700, textAlign: "right" }}>{done ? fmt1(match.awayPts) : "—"}</span>
        </div>
      </Panel>
      <p className="note" style={{ margin: "12px 0 44px" }}>
        {done
          ? <span><b>Red point totals</b> mark each side's top charter. Stat corrections re-score automatically.</span>
          : <span><b>LOCKED</b> appears once a player's game has kicked off. Both lineups stay hidden-point until the Tuesday charting run.</span>}
      </p>
    </div>
  );
}

function PlayerCell({ p, pts, top, done, align }) {
  if (!p || !p.name) return <span className="dim" style={{ textAlign: align }}>empty</span>;
  const right = align === "right";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexDirection: right ? "row-reverse" : "row" }}>
      <span style={{ textAlign: align }}>
        <span style={{ fontWeight: 800, fontSize: 14.5 }}>{p.name}</span>
        <span className="dim" style={{ fontSize: 12, marginLeft: 8 }}>{p.pos} · {p.nfl}</span>
        {p.locked && !done && <span className="dim" style={{ fontSize: 10, marginLeft: 8, letterSpacing: "0.1em" }}>LOCKED</span>}
      </span>
      <span className="mono" style={{ fontSize: 15, fontWeight: 600, color: done ? (top ? "var(--flame)" : "var(--paper)") : "var(--faint)", whiteSpace: "nowrap" }}>
        {done ? fmt1(pts) : p.kickoff}
      </span>
    </div>
  );
}

Object.assign(window, { MatchupDetailPage });
