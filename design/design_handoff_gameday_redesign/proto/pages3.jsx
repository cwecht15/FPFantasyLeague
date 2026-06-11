// Pages: Trades, Transactions, Draft
const D3 = window.FPFL;

const TRADE_LABEL = {
  proposed: "awaiting manager",
  accepted: "awaiting admin approval",
  applied: "completed",
  rejected: "rejected",
  vetoed: "vetoed",
  expired: "expired",
};

/* ---------------- TRADES ---------------- */
function TradesPage({ trades, roster, onRespond, onPropose }) {
  const [withTeam, setWithTeam] = React.useState(4);
  const [give, setGive] = React.useState([]);
  const [get, setGet] = React.useState([]);
  const theirPlayers = D3.OWNED_BY_OTHERS.filter(p => p.owner === withTeam);

  const toggle = (arr, set, name) => set(arr.includes(name) ? arr.filter(x => x !== name) : [...arr, name]);

  const propose = () => {
    if (give.length === 0 || get.length === 0) return;
    onPropose(withTeam, give, get);
    setGive([]); setGet([]);
  };

  return (
    <div className="wrap">
      <PageHead
        eyebrow={D3.LEAGUE.name}
        title="Trades"
        sub="Manager accepts, then a site admin approves. Approved trades apply immediately."
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {trades.map((t) => {
          const toMe = t.to === 1 && t.status === "proposed";
          return (
            <div key={t.id} className="panel" style={{ padding: "16px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ fontSize: 14 }}>
                  <b>{D3.teamName(t.from)}</b>
                  <span style={{ color: "var(--muted)" }}> sends </span>
                  <b>{t.give.map(p => `${p.name} (${p.pos})`).join(", ") || "—"}</b>
                  <span style={{ color: "var(--muted)" }}> · </span>
                  <b>{D3.teamName(t.to)}</b>
                  <span style={{ color: "var(--muted)" }}> sends </span>
                  <b>{t.get.map(p => `${p.name} (${p.pos})`).join(", ") || "—"}</b>
                </div>
                <span className="disp" style={{
                  fontSize: 12, padding: "3px 10px",
                  background: t.status === "applied" ? "var(--flame)" : (t.status === "proposed" || t.status === "accepted") ? "var(--surface)" : "var(--pit)",
                  color: (t.status === "rejected" || t.status === "vetoed" || t.status === "expired") ? "var(--faint)" : "var(--paper)",
                  border: "1px solid var(--line)",
                }}>{TRADE_LABEL[t.status]}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                {toMe && (
                  <span style={{ display: "flex", gap: 8 }}>
                    <button className="btn2 pri" onClick={() => onRespond(t.id, true)}>Accept</button>
                    <button className="btn2" onClick={() => onRespond(t.id, false)}>Reject</button>
                  </span>
                )}
                <span className="note">{t.at}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ margin: "28px 0 44px" }}>
        <Panel title="Propose a trade" action={
          <select className="input" style={{ padding: "5px 10px", fontSize: 13 }} value={withTeam} onChange={(e) => { setWithTeam(Number(e.target.value)); setGet([]); }}>
            {D3.TEAMS.filter(t => t.id !== 1).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        }>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            <div style={{ padding: "16px 22px", borderRight: "1px solid var(--line)" }}>
              <div className="note" style={{ marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>You send</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {roster.filter(p => p.slot !== "IR").map((p) => (
                  <button key={p.id} className={"pill" + (give.includes(p.name) ? " on" : "")} onClick={() => toggle(give, setGive, p.name)}>
                    {p.name} · {p.pos}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: "16px 22px" }}>
              <div className="note" style={{ marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>You receive — {D3.teamName(withTeam)}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {theirPlayers.length === 0 && <span className="note">Roster not shown in this prototype — pick another team.</span>}
                {theirPlayers.map((p) => (
                  <button key={p.id} className={"pill" + (get.includes(p.name) ? " on" : "")} onClick={() => toggle(get, setGet, p.name)}>
                    {p.name} · {p.pos}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "14px 22px", borderTop: "1px solid var(--line)" }}>
            <button className="btn pri" disabled={give.length === 0 || get.length === 0} onClick={propose}><span>Propose trade</span></button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ---------------- TRANSACTIONS ---------------- */
function TransactionsPage({ txs }) {
  return (
    <div className="wrap">
      <PageHead
        eyebrow={D3.LEAGUE.name}
        title="Transactions"
        sub="Waiver claims process Wednesday 10:00 AM ET. Everything else is logged here as it happens."
      />

      <Panel title="Pending waiver claims">
        <table className="tbl">
          <tbody>
            {D3.PENDING_CLAIMS.map((c) => (
              <tr key={c.id}>
                <td className="dim" style={{ width: 200 }}>{D3.teamName(c.team)}</td>
                <td>claims <b>{c.add}</b>{c.drop && <span className="dim"> (dropping {c.drop})</span>}</td>
                <td className="r num" style={{ width: 90 }}>${c.bid}</td>
                <td className="r dim" style={{ fontSize: 12, width: 200 }}>processes {c.processes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div style={{ height: 14 }}></div>
      <Panel title="History">
        <table className="tbl">
          <tbody>
            {txs.map((t) => (
              <tr key={t.id} className="hov">
                <td style={{ width: 110 }}>
                  <span className="disp" style={{ fontSize: 11.5, padding: "2px 8px", background: "var(--surface)", color: "var(--muted)" }}>{t.type}</span>
                </td>
                <td className="dim" style={{ width: 200 }}>{D3.teamName(t.team)}</td>
                <td>
                  {t.add && <span>+ <b>{t.add}</b></span>}
                  {t.add && t.drop && <span className="dim"> · </span>}
                  {t.drop && <span className="dim">− {t.drop}</span>}
                </td>
                <td className="r dim" style={{ fontSize: 12, width: 160 }}>{t.at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <div style={{ height: 44 }}></div>
    </div>
  );
}

/* ---------------- DRAFT ---------------- */
function DraftPage({ draftMode, isAdmin }) {
  const ROUNDS = 15;
  const board = React.useMemo(() => D3.draftBoard(ROUNDS), []);
  const complete = draftMode === "complete";
  const CURRENT_OVERALL = 85; // round 7, pick 85 — team 1 leads off the odd round (snake)
  const [pickedNow, setPickedNow] = React.useState(null); // player name I just drafted
  const [paused, setPaused] = React.useState(false);
  const [queue, setQueue] = React.useState(["Jameson Williams", "Tony Pollard", "Tucker Kraft"]);
  const [q, setQ] = React.useState("");
  const [pos, setPos] = React.useState("ALL");
  const [secs, setSecs] = React.useState(3 * 3600 + 42 * 60 + 18);
  React.useEffect(() => {
    if (complete || pickedNow || paused) return;
    const t = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [complete, pickedNow, paused]);

  const current = board.find(p => p.overall === (pickedNow ? CURRENT_OVERALL + 1 : CURRENT_OVERALL));
  const myTurn = !complete && !pickedNow && current && current.teamId === 1;

  let avail = D3.FREE_AGENTS.filter(p => p.name !== pickedNow);
  if (pos !== "ALL") avail = avail.filter(p => p.pos === pos);
  if (q.trim()) avail = avail.filter(p => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  avail.sort((a, b) => b.pts - a.pts);

  const recent = board.filter(p => p.overall < CURRENT_OVERALL).sort((a, b) => b.overall - a.overall).slice(0, 8);
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;

  return (
    <div className="wrap">
      <PageHead
        eyebrow={`${D3.LEAGUE.name} · async snake · ${ROUNDS} rounds · 8h clock`}
        title={complete ? "Draft — complete" : "Draft room"}
        sub={complete ? "All 210 picks are in. Rosters are live." : "Slow draft — picks can take hours. Queue players and autopick covers you at the deadline."}
      />

      {!complete && (
        <div className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, padding: "16px 22px", marginBottom: 16, borderLeft: myTurn ? "3px solid var(--flame)" : "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <span className="note">Round {current.round}, pick {current.overall}</span>
            <span className="disp" style={{ fontSize: 22 }}>{D3.teamName(current.teamId)}</span>
            {myTurn && <span className="chip" style={{ fontSize: 12, padding: "4px 12px" }}><span>Your pick</span></span>}
            {paused && <span className="disp" style={{ fontSize: 13, background: "var(--surface)", border: "1px solid var(--line-strong)", padding: "3px 12px" }}>PAUSED</span>}
            {pickedNow && <span className="note">You drafted <b style={{ color: "var(--paper)" }}>{pickedNow}</b> — {D3.teamName(current.teamId)} is on the clock.</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {isAdmin && <button className="btn2" onClick={() => setPaused(!paused)}>{paused ? "Resume" : "Pause"}</button>}
            <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: secs < 600 ? "var(--flame)" : "var(--paper)" }}>
              {h}h {String(m).padStart(2, "0")}m {String(s).padStart(2, "0")}s
            </div>
            <div className="note" style={{ fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase" }}>to autopick</div>
            </div>
          </div>
        </div>
      )}

      {!complete && (
        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr", gap: 16, marginBottom: 16 }}>
          <Panel title="Available players" action={
            <span style={{ display: "flex", gap: 6 }}>
              {["ALL", "QB", "RB", "WR", "TE"].map((p) => (
                <button key={p} className={"pill" + (pos === p ? " on" : "")} onClick={() => setPos(p)} style={{ fontSize: 11, padding: "3px 9px" }}>{p}</button>
              ))}
            </span>
          }>
            <div style={{ padding: "12px 14px 0" }}>
              <input className="input" style={{ width: "100%", padding: "6px 12px", fontSize: 13 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <table className="tbl">
              <thead><tr><th>Player</th><th>Pos</th><th>NFL</th><th className="r">Last szn</th><th></th></tr></thead>
              <tbody>
                {avail.slice(0, 12).map((p) => (
                  <tr key={p.id} className="hov">
                    <td className="tm">{p.name}</td>
                    <td><span className={"pos " + p.pos}>{p.pos}</span></td>
                    <td className="dim">{p.nfl}</td>
                    <td className="r num">{fmt1(p.pts)}</td>
                    <td className="r" style={{ whiteSpace: "nowrap" }}>
                      {myTurn && <button className="btn2 pri" style={{ marginRight: 6 }} onClick={() => setPickedNow(p.name)}>Draft</button>}
                      <button className="btn2" disabled={queue.includes(p.name)} onClick={() => setQueue([...queue, p.name])}>+Queue</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Panel title="My queue" action={<span className="m" style={{ cursor: "default" }}>autopick order</span>}>
              {queue.length === 0 ? (
                <div className="empty">Empty — autopick falls back to best available.</div>
              ) : (
                <table className="tbl"><tbody>
                  {queue.map((name, i) => (
                    <tr key={name}>
                      <td className="rk" style={{ fontSize: 14 }}>{i + 1}</td>
                      <td style={{ fontWeight: 700 }}>{name}</td>
                      <td className="r"><button className="btn2" onClick={() => setQueue(queue.filter(x => x !== name))}>✕</button></td>
                    </tr>
                  ))}
                </tbody></table>
              )}
            </Panel>
            <Panel title="Recent picks">
              <table className="tbl"><tbody>
                {recent.map((p) => (
                  <tr key={p.overall}>
                    <td className="num dim" style={{ fontSize: 11.5, width: 40 }}>{p.overall}</td>
                    <td style={{ fontWeight: 700 }}>{p.player.name} <span className="dim" style={{ fontWeight: 400 }}>({p.player.pos})</span></td>
                    <td className="dim" style={{ fontSize: 12 }}>{D3.teamName(p.teamId)}{p.auto && <span style={{ marginLeft: 5, fontSize: 10.5 }}>(auto)</span>}</td>
                  </tr>
                ))}
              </tbody></table>
            </Panel>
          </div>
        </div>
      )}

      <Panel title="Draft board" action={<span className="m" style={{ cursor: "default" }}>{complete ? "210 picks" : "rounds 1–7"}</span>}>
        <DraftGrid board={board} upTo={complete ? 9999 : CURRENT_OVERALL} current={complete ? null : (pickedNow ? CURRENT_OVERALL + 1 : CURRENT_OVERALL)} rounds={complete ? 15 : 7} pickedNow={pickedNow} />
      </Panel>
      <div style={{ height: 44 }}></div>
    </div>
  );
}

function DraftGrid({ board, upTo, current, rounds, pickedNow }) {
  const n = D3.TEAMS.length;
  return (
    <div style={{ overflowX: "auto", padding: "12px 14px 16px" }}>
      <div style={{ display: "grid", gridTemplateColumns: `34px repeat(${n}, minmax(76px, 1fr))`, gap: 3, minWidth: 1140 }}>
        <div></div>
        {D3.TEAMS.map(t => (
          <div key={t.id} style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: t.id === 1 ? "var(--flame)" : "var(--faint)", padding: "2px 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
        ))}
        {Array.from({ length: rounds }, (_, r) => r + 1).map((round) => (
          <React.Fragment key={round}>
            <div className="disp" style={{ fontSize: 12, color: "var(--faint)", display: "grid", placeItems: "center" }}>{round}</div>
            {D3.TEAMS.map((t) => {
              const pick = board.find(p => p.round === round && p.teamId === t.id);
              const done = pick.overall < upTo;
              const isCur = current === pick.overall;
              const justMine = pickedNow && pick.overall === current - 1 && false;
              return (
                <div key={t.id} style={{
                  background: isCur ? "var(--flame)" : done ? "var(--surface)" : "transparent",
                  border: "1px solid " + (isCur ? "var(--flame)" : "var(--line)"),
                  padding: "4px 6px", minHeight: 34,
                }}>
                  {done ? (
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pick.player.name}</div>
                      <div style={{ fontSize: 9, color: "var(--faint)" }}>{pick.player.pos} · {pick.overall}</div>
                    </div>
                  ) : isCur ? (
                    <div className="disp" style={{ fontSize: 10, paddingTop: 4 }}>ON CLOCK</div>
                  ) : (
                    <div style={{ fontSize: 9, color: "var(--faint)", paddingTop: 6 }}>{pick.overall}</div>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { TradesPage, TransactionsPage, DraftPage });
