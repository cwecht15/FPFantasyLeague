// Pages: Championship, Alerts, Login, Settings
const D4 = window.FPFL;

/* ---------------- CHAMPIONSHIP ---------------- */
function ChampionshipPage({ isAdmin, setToast, sprintState }) {
  const state = sprintState || "midrun";
  const posted = state === "locked" ? [] : state === "midrun" ? [15, 16] : [15, 16, 17];
  const rows = D4.SPRINT
    .map(r => ({ ...r, total: Math.round(posted.reduce((s, w) => s + r.wk[w], 0) * 10) / 10 }))
    .sort((a, b) => b.total - a.total || a.seed - b.seed);
  const champ = state === "final" ? rows[0] : null;
  const move = (r, i) => {
    if (state === "locked") return null;
    const d = r.seed - (i + 1);
    if (d > 0) return <span style={{ color: "var(--flame)", fontSize: 11, fontWeight: 800 }}>▲{d}</span>;
    if (d < 0) return <span style={{ color: "var(--faint)", fontSize: 11, fontWeight: 800 }}>▼{-d}</span>;
    return <span style={{ color: "var(--faint)", fontSize: 11 }}>—</span>;
  };
  const chipLabel = state === "locked" ? "Field locked · 100 teams" : state === "midrun" ? "Through Week 16" : "Final — 2025";
  const sub = state === "locked"
    ? <span>Top <b>2</b> teams from every league, one global pool. Cumulative starter points across <b>Weeks 15–17</b> decide the champion. First sprint scores post Tuesday 6:00 AM ET.</span>
    : state === "midrun"
      ? <span>Two of three sprint weeks are in the books. <b>Week 17 pends charting</b> — final results post Tuesday 6:00 AM ET. Keep setting your lineup in your home league.</span>
      : <span>All three sprint weeks are final. Cumulative starter points across <b>Weeks 15–17</b> — scored from post-game charting.</span>;

  return (
    <div className="wrap">
      <PageHead
        eyebrow="Cross-league · 2025"
        title="Championship sprint"
        sub={sub}
        right={<div className="chip"><span>{chipLabel}</span></div>}
      />

      {champ && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, background: "var(--surface)", border: "1px solid var(--line)", borderLeft: "3px solid var(--flame)", padding: "22px 28px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <img src="app/public/brand/Submark-Red.svg" alt="" style={{ height: 54 }} />
            <div>
              <div className="eyebrow">2025 Champion</div>
              <div className="disp" style={{ fontSize: 34 }}>{champ.team}</div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{champ.league} · <b className="mono" style={{ color: "var(--paper)" }}>{fmt1(champ.total)}</b> points across the sprint{champ.you ? " — that's you." : ""}</div>
            </div>
          </div>
          {champ.you && <div className="chip"><span>Your title</span></div>}
        </div>
      )}

      {isAdmin && state === "locked" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, background: "var(--pit)", border: "1px solid var(--line)", padding: "16px 22px", marginBottom: 16 }}>
          <div>
            <div className="disp" style={{ fontSize: 15 }}>Admin — lock the field</div>
            <p className="note" style={{ margin: "4px 0 0" }}>Run after week-14 results are final. Takes the top 2 ranked teams from every league's standings (re-running replaces the field).</p>
          </div>
          <button className="btn gho" onClick={() => setToast("Field locked — 100 teams")}><span>Lock field</span></button>
        </div>
      )}

      <Panel>
        <table className="tbl">
          <thead>
            <tr><th></th><th style={{ width: 30 }}></th><th>Team</th><th>League</th><th className="r">Seed</th><th className="r">W15</th><th className="r">W16</th><th className="r">W17</th><th className="r">Total</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.seed} className={r.you ? "you" : "hov"}>
                <td className="rk">{i + 1}</td>
                <td>{move(r, i)}</td>
                <td className="tm">{r.team}{r.you && <span className="youchip">YOU</span>}{state === "final" && i === 0 && <span className="res W" style={{ marginLeft: 8, verticalAlign: 2 }}>★</span>}</td>
                <td className="dim">{r.league}</td>
                <td className="r num dim">{r.seed}</td>
                {[15, 16, 17].map(w => (
                  <td key={w} className="r num" style={{ color: posted.includes(w) ? "var(--paper)" : "var(--faint)" }}>
                    {posted.includes(w) ? r.wk[w].toFixed(1) : "—"}
                  </td>
                ))}
                <td className="r num" style={{ fontWeight: 700, color: i === 0 && state !== "locked" ? "var(--flame)" : "var(--paper)" }}>{r.total.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: "12px 14px", borderTop: "1px solid var(--line)" }} className="note">
          Showing top 12 of 100. Seeding = regular-season rank, then points for. Ties broken by Week 17 score.
        </div>
      </Panel>
      <div style={{ height: 44 }}></div>
    </div>
  );
}

/* ---------------- ALERTS ---------------- */
function AlertsPage({ alerts, onMarkRead, go }) {
  const unread = alerts.filter(a => a.unread).length;
  return (
    <div className="wrap">
      <PageHead
        eyebrow="Draft turns · waiver results · trade updates"
        title="Alerts"
        right={unread > 0 ? <button className="btn gho" onClick={onMarkRead}><span>Mark all read ({unread})</span></button> : null}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 44 }}>
        {alerts.map((a) => (
          <div key={a.id} className="panel" style={{
            padding: "15px 22px",
            borderColor: a.unread ? "rgba(204,51,51,0.5)" : "var(--line)",
            opacity: a.unread ? 1 : 0.7,
            cursor: a.id === 1 ? "pointer" : "default",
          }} onClick={a.id === 1 ? () => go("trades") : undefined}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 800 }}>
                {a.unread && <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "var(--flame)", marginRight: 9, verticalAlign: 2 }}></span>}
                {a.title}
              </span>
              <span className="note">{a.at}</span>
            </div>
            {a.body && <p style={{ margin: "5px 0 0", fontSize: 13.5, color: "var(--muted)" }}>{a.body}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- LOGIN ---------------- */
function LoginPage({ onSignIn }) {
  const [email, setEmail] = React.useState("chris@example.com");
  const [pw, setPw] = React.useState("••••••••••");
  return (
    <div className="login-stage">
      <div>
        <div className="login-card">
          <img className="mark" src="app/public/brand/Wordmark-Primary.svg" alt="Fantasy Points" />
          <h1 className="disp">Sign in</h1>
          <div className="lsub">Fantasy football scored from post-game NFL charting data.</div>
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>Password</label>
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <button className="btn pri" style={{ width: "100%", marginTop: 8, padding: "12px 20px" }} onClick={onSignIn}><span>Sign in</span></button>
          <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", marginTop: 18 }}>
            New here? <span className="linkish">Create an account</span> · <span className="linkish">Forgot password?</span>
          </p>
        </div>
        <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--faint)", marginTop: 16, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 800 }}>
          Box scores lie. The film doesn't.
        </p>
      </div>
    </div>
  );
}

/* ---------------- SETTINGS ---------------- */
function SettingsPage({ isAdmin, setToast, go }) {
  const [email, setEmail] = React.useState("");
  const rules = [
    ["Passing yards", "0.04 / yd"], ["Passing TD", "4.0"], ["Interception", "−2.0"],
    ["Rushing yards", "0.1 / yd"], ["Yards after contact", "0.05 / yd"], ["Rushing TD", "6.0"],
    ["Receptions", "0.5 (1.0 vs man)"], ["Receiving yards", "0.1 / yd"], ["Contested catch", "+1.0"],
    ["Drop", "−1.0"], ["Fumble lost", "−2.0"],
  ];
  return (
    <div className="wrap">
      <PageHead
        eyebrow={D4.LEAGUE.name}
        title="League settings"
        sub={isAdmin ? "You're a site admin — settings and league operations are editable below." : "Read-only. Leagues are administered centrally by FPFL admins — contact them to request changes."}
      />
      {isAdmin && (
        <div style={{ marginBottom: 16 }}>
          <Panel title="Admin controls" action={<button className="m" onClick={() => go("scoringlab")}>Edit scoring in the Lab →</button>}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
              <div style={{ padding: "16px 22px", borderRight: "1px solid var(--line)" }}>
                <div className="note" style={{ textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800, marginBottom: 8 }}>Invite managers</div>
                <p className="note" style={{ margin: "0 0 10px" }}>Share this code — new managers paste it at sign-up:</p>
                <span className="mono" style={{ color: "var(--flame)", fontSize: 15 }}>{D4.LEAGUE.inviteCode}</span>
                <button className="btn2" style={{ marginLeft: 10 }} onClick={() => setToast("Invite code copied")}>Copy</button>
              </div>
              <div style={{ padding: "16px 22px", borderRight: "1px solid var(--line)" }}>
                <div className="note" style={{ textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800, marginBottom: 8 }}>Assign a manager</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="input" type="email" placeholder="user@example.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, padding: "7px 10px", fontSize: 13 }} />
                  <button className="btn2" disabled={!email.includes("@")} onClick={() => { setToast("Manager assigned"); setEmail(""); }}>Assign</button>
                </div>
                <p className="note" style={{ margin: "8px 0 0" }}>Gets the first unclaimed team, or a new one.</p>
              </div>
              <div style={{ padding: "16px 22px" }}>
                <div className="note" style={{ textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800, marginBottom: 8 }}>Schedule</div>
                <p className="note" style={{ margin: "0 0 10px" }}>(Re)generate the round-robin schedule. Safe while in setup; replaces regular-season matchups.</p>
                <button className="btn2" onClick={() => setToast("Schedule generated")}>Generate schedule</button>
              </div>
            </div>
          </Panel>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 44 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel title="League">
            <table className="tbl"><tbody>
              <tr><td className="dim">Name</td><td className="r" style={{ fontWeight: 800 }}>{D4.LEAGUE.name}</td></tr>
              <tr><td className="dim">Season</td><td className="r num">{D4.LEAGUE.season}</td></tr>
              <tr><td className="dim">Teams</td><td className="r num">{D4.LEAGUE.numTeams}</td></tr>
              <tr><td className="dim">Status</td><td className="r" style={{ fontWeight: 800 }}>In season · Week 15</td></tr>
              <tr><td className="dim">Invite code</td><td className="r num" style={{ color: "var(--flame)" }}>{D4.LEAGUE.inviteCode}</td></tr>
            </tbody></table>
          </Panel>
          <Panel title="Roster template">
            <table className="tbl"><tbody>
              <tr><td className="dim">Starters</td><td className="r">QB · RB ×2 · WR ×3 · TE · FLEX ×2</td></tr>
              <tr><td className="dim">Bench</td><td className="r">5 + 1 IR</td></tr>
              <tr><td className="dim">Positions</td><td className="r">QB / RB / WR / TE only — no K, no DST</td></tr>
              <tr><td className="dim">Locks</td><td className="r">Per-slot, at each player's kickoff</td></tr>
            </tbody></table>
          </Panel>
        </div>
        <Panel title="Scoring — FP Advanced" action={<span className="m" style={{ cursor: "default" }}>charting-based</span>}>
          <table className="tbl"><tbody>
            {rules.map(([k, v]) => (
              <tr key={k}><td className="dim">{k}</td><td className="r num">{v}</td></tr>
            ))}
          </tbody></table>
          <div style={{ padding: "12px 14px", borderTop: "1px solid var(--line)" }} className="note">
            Computed from post-game charting stat lines, not the live box score. Stat corrections trigger an automatic re-score.
          </div>
        </Panel>
      </div>
    </div>
  );
}

Object.assign(window, { ChampionshipPage, AlertsPage, LoginPage, SettingsPage });
