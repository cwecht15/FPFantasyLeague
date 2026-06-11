// App — router, global state, tweaks
const DA = window.FPFL;
const { useTweaks, TweaksPanel, TweakSection, TweakToggle, TweakRadio } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "ticker": true,
  "density": "comfortable",
  "draftMode": "live",
  "admin": true,
  "sprint": "midrun"
}/*EDITMODE-END*/;

function initialLineup() {
  const map = {};
  for (const def of DA.SLOT_DEFS) {
    const p = DA.ROSTER.find(r => r.slot === def.slot);
    map[def.slot] = p ? p.id : null;
  }
  return map;
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [page, setPage] = React.useState(() => localStorage.getItem("fpfl-proto-page") || "login");
  const [roster, setRoster] = React.useState(DA.ROSTER);
  const [freeAgents, setFreeAgents] = React.useState(DA.FREE_AGENTS);
  const [lineup, setLineup] = React.useState(initialLineup);
  const [trades, setTrades] = React.useState(DA.TRADES);
  const [alerts, setAlerts] = React.useState(DA.ALERTS);
  const [txs, setTxs] = React.useState(DA.TX_HISTORY);
  const [selMatch, setSelMatch] = React.useState(null);
  const [toast, setToast] = useToast();

  React.useEffect(() => { localStorage.setItem("fpfl-proto-page", page); }, [page]);
  React.useEffect(() => { document.body.dataset.density = t.density === "compact" ? "compact" : "comfortable"; }, [t.density]);

  const go = (p) => { setPage(p); window.scrollTo(0, 0); };
  const goMatch = (m) => { setSelMatch(m); go("matchdetail"); };

  const setSlot = (slot, pid) => {
    setLineup((prev) => {
      const next = { ...prev };
      if (pid) for (const k of Object.keys(next)) if (next[k] === pid) next[k] = null;
      next[slot] = pid;
      return next;
    });
  };

  const now = "Dec 11, " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const addPlayer = (faId) => {
    const fa = freeAgents.find(p => p.id === faId);
    if (!fa) return;
    setFreeAgents(freeAgents.filter(p => p.id !== faId));
    setRoster([...roster, { ...fa, slot: "BENCH", kickoff: "Sun 1:00", locked: false }]);
    setTxs([{ id: Date.now(), type: "free agent", team: 1, add: fa.name, drop: null, at: now }, ...txs]);
    setToast(`${fa.name} added`);
  };

  const dropPlayer = (pid) => {
    const p = roster.find(r => r.id === pid);
    if (!p || p.locked) return;
    setRoster(roster.filter(r => r.id !== pid));
    setFreeAgents([{ id: p.id, name: p.name, pos: p.pos, nfl: p.nfl, pts: p.pts }, ...freeAgents]);
    setLineup((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) if (next[k] === pid) next[k] = null;
      return next;
    });
    setTxs([{ id: Date.now(), type: "drop", team: 1, add: null, drop: p.name, at: now }, ...txs]);
    setToast(`${p.name} dropped`);
  };

  const respondTrade = (id, accept) => {
    setTrades(trades.map(tr => tr.id === id ? { ...tr, status: accept ? "accepted" : "rejected" } : tr));
    setToast(accept ? "Trade accepted — awaiting admin approval" : "Trade rejected");
  };

  const proposeTrade = (teamId, give, get) => {
    setTrades([{
      id: Date.now(), from: 1, to: teamId, status: "proposed",
      give: give.map(n => ({ name: n, pos: (roster.find(r => r.name === n) || {}).pos || "" })),
      get: get.map(n => ({ name: n, pos: (DA.OWNED_BY_OTHERS.find(r => r.name === n) || {}).pos || "" })),
      at: now,
    }, ...trades]);
    setToast("Trade proposed");
  };

  const markAlertsRead = () => { setAlerts(alerts.map(a => ({ ...a, unread: false }))); };
  const unread = alerts.filter(a => a.unread).length;

  const saveLineup = () => setToast("Lineup set");
  const signIn = () => go("home");
  const signOut = () => go("login");

  const tweaks = (
    <TweaksPanel>
      <TweakSection label="Role" />
      <TweakToggle label="Site admin view" value={t.admin} onChange={(v) => setTweak("admin", v)} />
      <TweakSection label="Layout" />
      <TweakToggle label="News ticker" value={t.ticker} onChange={(v) => setTweak("ticker", v)} />
      <TweakRadio label="Density" value={t.density} options={["comfortable", "compact"]} onChange={(v) => setTweak("density", v)} />
      <TweakSection label="Draft page" />
      <TweakRadio label="State" value={t.draftMode} options={["live", "complete"]} onChange={(v) => setTweak("draftMode", v)} />
      <TweakSection label="Championship" />
      <TweakRadio label="Sprint" value={t.sprint} options={["locked", "midrun", "final"]} onChange={(v) => setTweak("sprint", v)} />
    </TweaksPanel>
  );

  if (page === "login") {
    return (
      <div data-screen-label="Sign in">
        <LoginPage onSignIn={signIn} />
        {tweaks}
      </div>
    );
  }

  const leaguePage = ["home", "lineup", "roster", "players", "matchups", "matchdetail", "standings", "trades", "transactions", "draft", "settings"].includes(page);
  const tabPage = page === "matchdetail" ? "matchups" : page;

  return (
    <div data-screen-label={page}>
      <Ticker show={t.ticker} />
      <TopNav page={page} go={go} unread={unread} onSignOut={signOut} isAdmin={t.admin} />
      {leaguePage && <LeagueTabs page={tabPage} go={go} />}

      {page === "home" && <HomePage go={go} roster={roster} lineup={lineup} goMatch={goMatch} />}
      {page === "lineup" && <LineupPage roster={roster} lineup={lineup} setSlot={setSlot} onSave={saveLineup} />}
      {page === "roster" && <RosterPage roster={roster} lineup={lineup} onDrop={dropPlayer} go={go} />}
      {page === "players" && <PlayersPage roster={roster} freeAgents={freeAgents} onAdd={addPlayer} onDrop={dropPlayer} />}
      {page === "matchups" && <MatchupsPage onOpen={goMatch} />}
      {page === "matchdetail" && selMatch && <MatchupDetailPage match={selMatch} roster={roster} lineup={lineup} goBack={() => go("matchups")} />}
      {page === "matchdetail" && !selMatch && <MatchupsPage onOpen={goMatch} />}
      {page === "standings" && <StandingsPage />}
      {page === "trades" && <TradesPage trades={trades} roster={roster} onRespond={respondTrade} onPropose={proposeTrade} />}
      {page === "transactions" && <TransactionsPage txs={txs} />}
      {page === "draft" && <DraftPage draftMode={t.draftMode === "complete" ? "complete" : "live"} isAdmin={t.admin} />}
      {page === "settings" && <SettingsPage isAdmin={t.admin} setToast={setToast} go={go} />}
      {page === "championship" && <ChampionshipPage isAdmin={t.admin} setToast={setToast} />}
      {page === "alerts" && <AlertsPage alerts={alerts} onMarkRead={markAlertsRead} go={go} />}
      {page === "scoringlab" && <ScoringLabPage setToast={setToast} />}
      {page === "adminleagues" && <AdminLeaguesPage setToast={setToast} />}

      <Toast msg={toast} />
      {tweaks}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
