// Admin pages: Scoring Lab + Manage Leagues
const D5 = window.FPFL;

/* ---------------- SCORING LAB ---------------- */
const LAB_GROUPS = [
  { title: "Passing", fields: [["Yards", 0.04, "/ yd"], ["TD", 4], ["Interception", -2]] },
  { title: "Rushing", fields: [["Yards", 0.1, "/ yd"], ["TD", 6], ["Yds after contact", 0.05, "/ yd"], ["Missed tackles forced", 0.5], ["Stuff", -0.5]] },
  { title: "Receiving", fields: [["Reception", 0.5], ["Yards", 0.1, "/ yd"], ["TD", 6], ["Drop", -1], ["Air yards", 0.02, "/ yd"], ["YAC", 0.05, "/ yd"], ["Separation", 0.1, "/ route"], ["Hero catch", 1]] },
  { title: "Misc", fields: [["Fumble lost", -2]] },
];
const QB_GROUP = { title: "QB advanced mode", fields: [["Accurate throw", 0.25], ["Turnover-worthy throw", -1.5], ["Hero throw", 1], ["Air yards", 0.02, "/ yd"], ["Sack taken", -0.5], ["EPA / dropback", 10, "× factor"], ["Pass yds (5+ air)", 0.05, "/ yd"], ["Pass TD (5+ air)", 4]] };

const LAB_COLS = ["EPA/db", "Acc", "Air yds", "TWT", "Hero", "Sacks", "Rush yds", "YACO", "MTF", "Rec", "Rec yds", "YAC", "Drops"];
const LAB_ROWS = [
  { name: "Lamar Jackson", pos: "QB", team: "BAL", g: 16, pts: 428.4, c: { "EPA/db": 96.2, "Acc": 78.5, "Air yds": 71.4, "TWT": -16.5, "Hero": 24.0, "Sacks": -11.5, "Rush yds": 91.5, "YACO": 31.2, "MTF": 19.5 } },
  { name: "Josh Allen", pos: "QB", team: "BUF", g: 17, pts: 421.7, c: { "EPA/db": 88.7, "Acc": 81.0, "Air yds": 76.2, "TWT": -21.0, "Hero": 28.0, "Sacks": -7.0, "Rush yds": 53.1, "YACO": 24.8, "MTF": 12.0 } },
  { name: "Ja'Marr Chase", pos: "WR", team: "CIN", g: 17, pts: 366.2, c: { "Rec": 63.5, "Rec yds": 170.8, "YAC": 41.7, "Air yds": 28.3, "Hero": 14.0, "MTF": 9.5, "Drops": -3.0 } },
  { name: "Saquon Barkley", pos: "RB", team: "PHI", g: 16, pts: 351.9, c: { "Rush yds": 200.5, "YACO": 64.0, "MTF": 38.5, "Rec": 16.5, "Rec yds": 27.8, "YAC": 24.6 } },
  { name: "Jalen Hurts", pos: "QB", team: "PHI", g: 15, pts: 340.3, c: { "EPA/db": 71.3, "Acc": 64.8, "Air yds": 52.6, "TWT": -10.5, "Hero": 15.0, "Sacks": -19.0, "Rush yds": 60.4, "YACO": 28.7, "MTF": 14.5 } },
  { name: "Justin Jefferson", pos: "WR", team: "MIN", g: 17, pts: 331.0, c: { "Rec": 54.0, "Rec yds": 153.3, "YAC": 28.9, "Air yds": 31.5, "Hero": 11.0, "MTF": 5.5, "Drops": -2.0 } },
  { name: "Bijan Robinson", pos: "RB", team: "ATL", g: 17, pts: 324.8, c: { "Rush yds": 168.2, "YACO": 55.4, "MTF": 33.0, "Rec": 24.0, "Rec yds": 43.1, "YAC": 38.7 } },
  { name: "Amon-Ra St. Brown", pos: "WR", team: "DET", g: 17, pts: 305.6, c: { "Rec": 57.5, "Rec yds": 131.0, "YAC": 35.2, "Air yds": 18.9, "Hero": 7.0, "MTF": 6.0, "Drops": -4.0 } },
  { name: "Derrick Henry", pos: "RB", team: "BAL", g: 17, pts: 298.1, c: { "Rush yds": 192.7, "YACO": 71.8, "MTF": 41.5, "Rec": 9.5, "Rec yds": 15.2, "YAC": 13.9 } },
  { name: "Brock Bowers", pos: "TE", team: "LV", g: 17, pts: 271.4, c: { "Rec": 56.0, "Rec yds": 120.4, "YAC": 39.8, "Air yds": 14.6, "Hero": 9.0, "MTF": 7.5, "Drops": -2.0 } },
];

function LabField({ label, def, hint }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "var(--muted)" }}>
      {label}
      <input className="input" type="number" step="any" defaultValue={def} style={{ padding: "6px 10px", fontSize: 13 }} />
      {hint && <span style={{ fontSize: 10, color: "var(--faint)" }}>{hint}</span>}
    </label>
  );
}

function ScoringLabPage({ setToast }) {
  const [ran, setRan] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [pos, setPos] = React.useState("ALL");
  const [week, setWeek] = React.useState("0");
  const [qbAdv, setQbAdv] = React.useState(true);

  const run = () => {
    setRunning(true);
    setTimeout(() => {
      setRunning(false); setRan(true);
      setToast("Scored 14,288 stat lines · 1.8s");
    }, 900);
  };

  let rows = LAB_ROWS;
  if (pos !== "ALL") rows = rows.filter(r => r.pos === pos);
  const cols = LAB_COLS.filter(c => rows.some(r => r.c[c] !== undefined) && (qbAdv || !["EPA/db", "Acc", "TWT", "Hero", "Sacks"].includes(c) || rows.some(r => r.pos !== "QB" && r.c[c] !== undefined)));

  return (
    <div className="wrap">
      <PageHead
        eyebrow="Admin · test rules before applying them to leagues"
        title="Scoring Lab"
        sub="Dial in scoring values — including advanced charting stats (accuracy, turnover-worthy throws, hero plays, drops, air yards, YAC, missed tackles forced) — and score real past-season stat lines to see who finishes where."
      />

      <Panel title="Scope">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, padding: "16px 22px 20px" }}>
          {[
            ["Season", <select key="s" className="input"><option>2025</option><option>2024</option><option>2023</option></select>],
            ["Week", <select key="w" className="input" value={week} onChange={(e) => setWeek(e.target.value)}><option value="0">Full season</option>{Array.from({ length: 18 }, (_, i) => <option key={i + 1} value={i + 1}>Week {i + 1}</option>)}</select>],
            ["Position", <select key="p" className="input" value={pos} onChange={(e) => setPos(e.target.value)}>{["ALL", "QB", "RB", "WR", "TE"].map(p => <option key={p}>{p}</option>)}</select>],
            ["Show top", <select key="t" className="input"><option>50</option><option>100</option><option>200</option><option>500</option></select>],
          ].map(([label, el]) => (
            <label key={label} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--faint)" }}>
              {label}{el}
            </label>
          ))}
        </div>
      </Panel>
      <div style={{ height: 14 }}></div>

      <Panel title="Rules">
        <div style={{ padding: "18px 22px 6px" }}>
          {LAB_GROUPS.map((g) => (
            <fieldset key={g.title} style={{ border: "none", margin: "0 0 18px", padding: 0 }}>
              <legend style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--faint)", padding: 0, marginBottom: 8 }}>{g.title}</legend>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
                {g.fields.map(([label, def, hint]) => <LabField key={label} label={label} def={def} hint={hint} />)}
              </div>
            </fieldset>
          ))}
        </div>
        <div style={{ margin: "0 22px 18px", border: "1px solid rgba(204,51,51,0.4)", padding: "14px 18px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={qbAdv} onChange={(e) => setQbAdv(e.target.checked)} />
            <span className="disp" style={{ fontSize: 15, color: "var(--flame)" }}>QB advanced mode</span>
          </label>
          <p className="note" style={{ margin: "6px 0 12px" }}>
            When on, QBs ignore the Passing/Rushing values above entirely — only the inputs below score them (plus fumbles lost). All passing production on throws under 5 air yards is excluded.
          </p>
          {qbAdv && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {QB_GROUP.fields.map(([label, def, hint]) => <LabField key={label} label={label} def={def} hint={hint} />)}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 22px 20px" }}>
          <button className="btn pri" disabled={running} onClick={run}><span>{running ? "Scoring…" : "Run scoring"}</span></button>
          <span className="note">Read-only on real stat lines — nothing applies to a league until you save it there.</span>
        </div>
      </Panel>

      {ran && (
        <div style={{ marginTop: 14 }}>
          <Panel title="Leaderboard" action={<span className="m" style={{ cursor: "default" }}>2025 · {week === "0" ? "full season" : `week ${week}`} · {pos} · top {rows.length}</span>}>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl" style={{ whiteSpace: "nowrap" }}>
                <thead>
                  <tr>
                    <th></th><th>Player</th><th>Pos</th><th>Team</th><th className="r">G</th><th className="r">Points</th><th className="r">PPG</th>
                    {cols.map(c => <th key={c} className="r" style={{ fontWeight: 400 }}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.name} className="hov">
                      <td className="rk">{i + 1}</td>
                      <td className="tm">{r.name}</td>
                      <td><span className={"pos " + r.pos}>{r.pos}</span></td>
                      <td className="dim">{r.team}</td>
                      <td className="r num">{r.g}</td>
                      <td className="r num" style={{ fontWeight: 700 }}>{r.pts.toFixed(2)}</td>
                      <td className="r num dim">{(r.pts / r.g).toFixed(2)}</td>
                      {cols.map(c => {
                        const v = r.c[c];
                        return <td key={c} className="r num" style={{ fontSize: 12, color: v === undefined ? "rgba(240,240,240,0.18)" : v < 0 ? "var(--flame)" : "var(--muted)" }}>{v === undefined ? "—" : v.toFixed(1)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
      <div style={{ height: 44 }}></div>
    </div>
  );
}

/* ---------------- MANAGE LEAGUES ---------------- */
const ADMIN_LEAGUES_SEED = [
  { id: 1, name: "Founders League", season: 2025, claimed: 14, teams: 14, status: "in season", code: "FNDRS-25" },
  { id: 2, name: "Wildcat League", season: 2025, claimed: 12, teams: 12, status: "in season", code: "WLDCT-25" },
  { id: 3, name: "Midwest Charters", season: 2025, claimed: 14, teams: 14, status: "in season", code: "MDWST-25" },
  { id: 4, name: "Coastal Division", season: 2025, claimed: 10, teams: 10, status: "in season", code: "COAST-25" },
  { id: 5, name: "Night Slate League", season: 2025, claimed: 12, teams: 12, status: "in season", code: "NIGHT-25" },
  { id: 6, name: "Sunday Ticket Club", season: 2025, claimed: 14, teams: 14, status: "in season", code: "SNDAY-25" },
  { id: 7, name: "Glass City League", season: 2026, claimed: 9, teams: 12, status: "drafting", code: "GLASS-26" },
  { id: 8, name: "Backyard Charters", season: 2026, claimed: 6, teams: 10, status: "setup", code: "BKYRD-26" },
];

function AdminLeaguesPage({ setToast }) {
  const [leagues, setLeagues] = React.useState(ADMIN_LEAGUES_SEED);
  const [name, setName] = React.useState("");
  const [teams, setTeams] = React.useState(12);
  const [email, setEmail] = React.useState("");
  const [assignTo, setAssignTo] = React.useState(8);

  const create = () => {
    if (name.trim().length < 3) return;
    const code = name.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5).padEnd(5, "X") + "-26";
    setLeagues([{ id: Date.now(), name: name.trim(), season: 2026, claimed: 0, teams, status: "setup", code }, ...leagues]);
    setName("");
    setToast("League created — share the invite code");
  };

  const statusStyle = (s) =>
    s === "in season" ? { background: "var(--flame)", color: "var(--paper)" }
    : s === "drafting" ? { background: "var(--surface)", color: "var(--paper)", border: "1px solid var(--line-strong)" }
    : { background: "var(--pit)", color: "var(--faint)", border: "1px solid var(--line)" };

  return (
    <div className="wrap">
      <PageHead
        eyebrow="Admin · central administration — no per-league commissioners"
        title="Manage leagues"
        sub={<span><b>{leagues.length}</b> of 50 leagues shown · managers join via invite code or direct assignment</span>}
      />

      <Panel title="All leagues">
        <table className="tbl">
          <thead>
            <tr><th>League</th><th className="r">Season</th><th className="r">Teams</th><th>Status</th><th>Invite code</th><th></th></tr>
          </thead>
          <tbody>
            {leagues.map((l) => (
              <tr key={l.id} className="hov">
                <td className="tm">{l.name}</td>
                <td className="r num">{l.season}</td>
                <td className="r num">{l.claimed} / {l.teams}</td>
                <td><span className="disp" style={{ fontSize: 11.5, padding: "2.5px 10px", ...statusStyle(l.status) }}>{l.status}</span></td>
                <td className="num" style={{ color: "var(--flame)", fontSize: 12.5 }}>{l.code}
                  <button className="btn2" style={{ marginLeft: 10, fontSize: 10.5, padding: "2px 8px" }} onClick={() => setToast("Invite code copied")}>Copy</button>
                </td>
                <td className="r">
                  {l.status === "setup" && <button className="btn2" onClick={() => setToast("Schedule generated — " + l.name)}>Generate schedule</button>}
                  {l.status === "drafting" && <button className="btn2" onClick={() => setToast("Draft paused — " + l.name)}>Pause draft</button>}
                  {l.status === "in season" && <button className="btn2" onClick={() => setToast("Opening " + l.name)}>Open</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, margin: "16px 0 44px" }}>
        <Panel title="Create a league">
          <div style={{ padding: "18px 22px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>League name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Glass City League" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Teams</label>
                <select className="input" value={teams} onChange={(e) => setTeams(Number(e.target.value))}>
                  {[4, 6, 8, 10, 12, 14, 16, 18, 20].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Scoring preset</label>
                <select className="input"><option>FP Advanced</option><option>FP Standard</option><option>Half PPR</option></select>
              </div>
            </div>
            <button className="btn pri" style={{ alignSelf: "flex-start" }} disabled={name.trim().length < 3} onClick={create}><span>Create league</span></button>
          </div>
        </Panel>

        <Panel title="Assign a manager">
          <div style={{ padding: "18px 22px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
            <p className="note" style={{ margin: 0 }}>
              Enroll a registered user — they get the first unclaimed team (or a new one). Regular users can't create leagues; this and the invite code are how they get in.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>League</label>
                <select className="input" value={assignTo} onChange={(e) => setAssignTo(Number(e.target.value))}>
                  {leagues.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>User email</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="manager@example.com" />
              </div>
            </div>
            <button className="btn gho" style={{ alignSelf: "flex-start" }} disabled={!email.includes("@")} onClick={() => { setToast("Manager assigned"); setEmail(""); }}><span>Assign</span></button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

Object.assign(window, { ScoringLabPage, AdminLeaguesPage });
