// Shell components — ticker, top nav, league tabs, panels, toast
const { useState, useEffect } = React;

function Ticker({ show }) {
  if (!show) return null;
  const txt = "WEEK 15 — LINEUPS LOCK AT KICKOFF · WEEK 14 RESULTS ARE FINAL · CHAMPIONSHIP SPRINT: TOP 2 FROM EVERY LEAGUE, WEEKS 15–17 DECIDE THE TITLE · RESULTS POST TUESDAY 6:00 AM ET · ";
  return (
    <div className="ticker">
      <div className="ticker-track">{txt}{txt}</div>
    </div>
  );
}

function TopNav({ page, go, unread, onSignOut, isAdmin }) {
  return (
    <div>
      <div className="wrap">
        <nav className="topnav">
          <img className="mark" src="app/public/brand/Wordmark-Primary.svg" alt="Fantasy Points" onClick={() => go("home")} />
          <div className="right">
            <button className={"lk" + (page === "alerts" ? " on" : "")} onClick={() => go("alerts")}>
              Alerts{unread > 0 && <span className="badge">{unread}</span>}
            </button>
            <button className={"lk" + (page === "championship" ? " on" : "")} onClick={() => go("championship")}>Championship</button>
            {isAdmin && <button className={"lk" + (page === "scoringlab" ? " on" : "")} onClick={() => go("scoringlab")}>Scoring Lab</button>}
            {isAdmin && <button className={"lk" + (page === "adminleagues" ? " on" : "")} onClick={() => go("adminleagues")}>Manage Leagues</button>}
            <span className="who">Chris{isAdmin ? " · admin" : ""}</span>
            <button className="btn2" onClick={onSignOut}>SIGN OUT</button>
          </div>
        </nav>
      </div>
      <div className="red-rule"></div>
    </div>
  );
}

const LEAGUE_TABS = [
  { id: "home", label: "Home" },
  { id: "lineup", label: "Lineup" },
  { id: "roster", label: "Roster" },
  { id: "players", label: "Players" },
  { id: "matchups", label: "Matchups" },
  { id: "standings", label: "Standings" },
  { id: "trades", label: "Trades" },
  { id: "transactions", label: "Transactions" },
  { id: "draft", label: "Draft" },
  { id: "settings", label: "Settings" },
];

function LeagueTabs({ page, go }) {
  return (
    <div className="wrap">
      <div className="tabs">
        {LEAGUE_TABS.map((t) => (
          <button key={t.id} className={page === t.id ? "on" : ""} onClick={() => go(t.id)}>{t.label}</button>
        ))}
      </div>
    </div>
  );
}

function PageHead({ eyebrow, title, sub, right }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="disp">{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right}
    </header>
  );
}

function Panel({ title, action, children, style }) {
  return (
    <div className="panel" style={style}>
      {title && (
        <div className="ptitle">
          <span className="t">{title}</span>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return <div className="toast"><span>{msg}</span></div>;
}

function useToast() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2400);
    return () => clearTimeout(t);
  }, [msg]);
  return [msg, setMsg];
}

Object.assign(window, { Ticker, TopNav, LeagueTabs, PageHead, Panel, Toast, useToast, LEAGUE_TABS });
