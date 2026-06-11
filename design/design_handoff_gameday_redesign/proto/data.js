// FPFL prototype mock data — Founders League, 2025, Week 15 (results pend until Tue 6am ET)
(function () {
  const TEAMS = [
    { id: 1, name: "Stick Route Merchants", owner: "Chris", you: true },
    { id: 2, name: "Glass Eaters DC", owner: "Dana" },
    { id: 3, name: "Route Tree Surgeons", owner: "Marcus" },
    { id: 4, name: "Hot Read Heroes", owner: "Priya" },
    { id: 5, name: "Play Action Hank", owner: "Hank" },
    { id: 6, name: "The Audibles", owner: "Sam" },
    { id: 7, name: "Pancake Blockers", owner: "Jo" },
    { id: 8, name: "Mesh Point Mafia", owner: "Theo" },
    { id: 9, name: "Scramble Drill", owner: "Lena" },
    { id: 10, name: "Pre-Snap Reads", owner: "Omar" },
    { id: 11, name: "Yards After Catch", owner: "Bea" },
    { id: 12, name: "Blitz Pickup", owner: "Ray" },
    { id: 13, name: "The Waggle", owner: "Min" },
    { id: 14, name: "Fourth & Short", owner: "Gus" },
  ];

  // deterministic pseudo-random
  function rnd(seed) {
    let x = Math.sin(seed * 999 + 7) * 10000;
    return x - Math.floor(x);
  }

  // round-robin (circle method), 14 teams, 13 unique weeks; week 14 repeats week 1 pairings rotated
  function pairingsForWeek(w) {
    const n = TEAMS.length;
    const ids = TEAMS.map(t => t.id);
    const fixed = ids[0];
    let rot = ids.slice(1);
    const r = (w - 1) % (n - 1);
    rot = rot.slice(r).concat(rot.slice(0, r));
    const left = [fixed].concat(rot.slice(0, n / 2 - 1));
    const right = rot.slice(n / 2 - 1).reverse();
    return left.map((a, i) => ({ home: a, away: right[i] }));
  }

  const CURRENT_WEEK = 15;

  // Team 1's season story is pinned: losses in weeks 3 and 7 → 12–2 through week 14.
  const T1_LOSS_WEEKS = [3, 7];

  function scoreFor(teamId, week) {
    return Math.round((82 + rnd(teamId * 31 + week * 17) * 62) * 10) / 10;
  }

  function matchupsForWeek(w) {
    return pairingsForWeek(w).map((p, i) => {
      const done = w < CURRENT_WEEK;
      let hp = done ? scoreFor(p.home, w) : null;
      let ap = done ? scoreFor(p.away, w) : null;
      // Force team 1's results to match the pinned narrative.
      if (done && (p.home === 1 || p.away === 1)) {
        const win = !T1_LOSS_WEEKS.includes(w);
        const mineHome = p.home === 1;
        let my = mineHome ? hp : ap;
        let opp = mineHome ? ap : hp;
        if (w === 14) { my = 124.6; opp = 101.2; }
        else if (win && my <= opp) my = Math.round((opp + 4 + rnd(w) * 12) * 10) / 10;
        else if (!win && my >= opp) opp = Math.round((my + 3 + rnd(w * 2) * 9) * 10) / 10;
        hp = mineHome ? my : opp;
        ap = mineHome ? opp : my;
      }
      return {
        id: w * 100 + i, week: w, home: p.home, away: p.away,
        homePts: hp, awayPts: ap,
        status: done ? "final" : "scheduled",
        winner: done ? (hp >= ap ? p.home : p.away) : null,
      };
    });
  }

  // Standings pinned to the narrative (sums balance: 98 W / 98 L over 14 weeks).
  const PINNED_STANDINGS = [
    { teamId: 1, w: 12, l: 2, pf: 1842.6, pa: 1611.2, hist: ["W", "W", "W", "W", "W"] },
    { teamId: 2, w: 11, l: 3, pf: 1798.1, pa: 1644.9, hist: ["W", "W", "L", "W", "W"] },
    { teamId: 3, w: 10, l: 4, pf: 1755.0, pa: 1682.3, hist: ["W", "W", "W", "W", "L"] },
    { teamId: 4, w: 9, l: 5, pf: 1701.3, pa: 1654.8, hist: ["L", "W", "W", "L", "W"] },
    { teamId: 5, w: 8, l: 6, pf: 1644.0, pa: 1688.4, hist: ["W", "L", "W", "W", "L"] },
    { teamId: 6, w: 8, l: 6, pf: 1590.2, pa: 1701.5, hist: ["L", "W", "L", "W", "W"] },
    { teamId: 7, w: 7, l: 7, pf: 1571.8, pa: 1665.0, hist: ["W", "L", "W", "L", "W"] },
    { teamId: 8, w: 7, l: 7, pf: 1532.4, pa: 1610.7, hist: ["L", "L", "W", "W", "L"] },
    { teamId: 9, w: 6, l: 8, pf: 1518.9, pa: 1646.2, hist: ["W", "L", "L", "W", "L"] },
    { teamId: 10, w: 6, l: 8, pf: 1488.5, pa: 1672.1, hist: ["L", "W", "L", "L", "W"] },
    { teamId: 11, w: 5, l: 9, pf: 1455.2, pa: 1635.8, hist: ["L", "L", "W", "L", "L"] },
    { teamId: 12, w: 4, l: 10, pf: 1410.6, pa: 1689.3, hist: ["L", "W", "L", "L", "L"] },
    { teamId: 13, w: 3, l: 11, pf: 1382.0, pa: 1714.6, hist: ["L", "L", "L", "W", "L"] },
    { teamId: 14, w: 2, l: 12, pf: 1339.7, pa: 1735.9, hist: ["L", "L", "L", "L", "L"] },
  ];

  function buildStandings() {
    return PINNED_STANDINGS.map((r, i) => ({ ...r, t: 0, rank: i + 1 }));
  }

  // --- my roster (15 players). slot: current week-15 lineup assignment ---
  const ROSTER = [
    { id: "p1", name: "Josh Allen", pos: "QB", nfl: "BUF", pts: 348.2, slot: "QB", kickoff: "Sun 1:00", locked: false },
    { id: "p2", name: "Bijan Robinson", pos: "RB", nfl: "ATL", pts: 289.5, slot: "RB", kickoff: "Sun 1:00", locked: false },
    { id: "p3", name: "Jahmyr Gibbs", pos: "RB", nfl: "DET", pts: 261.0, slot: "RB 2", kickoff: "Sun 4:25", locked: false },
    { id: "p4", name: "Ja'Marr Chase", pos: "WR", nfl: "CIN", pts: 312.8, slot: "WR", kickoff: "Sun 1:00", locked: false },
    { id: "p5", name: "Puka Nacua", pos: "WR", nfl: "LAR", pts: 254.1, slot: "WR 2", kickoff: "Sun 4:05", locked: false },
    { id: "p6", name: "Nico Collins", pos: "WR", nfl: "HOU", pts: 231.7, slot: "WR 3", kickoff: "Sat 8:15", locked: true },
    { id: "p7", name: "Brock Bowers", pos: "TE", nfl: "LV", pts: 198.4, slot: "TE", kickoff: "Sun 4:05", locked: false },
    { id: "p8", name: "James Cook", pos: "RB", nfl: "BUF", pts: 214.9, slot: "FLEX", kickoff: "Sun 1:00", locked: false },
    { id: "p9", name: "Jaylen Waddle", pos: "WR", nfl: "MIA", pts: 187.3, slot: "FLEX 2", kickoff: "Mon 8:15", locked: false },
    { id: "p10", name: "Baker Mayfield", pos: "QB", nfl: "TB", pts: 276.6, slot: "BENCH", kickoff: "Sun 1:00", locked: false },
    { id: "p11", name: "Chuba Hubbard", pos: "RB", nfl: "CAR", pts: 176.2, slot: "BENCH", kickoff: "Sun 1:00", locked: false },
    { id: "p12", name: "Jordan Addison", pos: "WR", nfl: "MIN", pts: 168.0, slot: "BENCH", kickoff: "Sun 8:20", locked: false },
    { id: "p13", name: "Dalton Kincaid", pos: "TE", nfl: "BUF", pts: 121.5, slot: "BENCH", kickoff: "Sun 1:00", locked: false },
    { id: "p14", name: "Tyjae Spears", pos: "RB", nfl: "TEN", pts: 109.8, slot: "BENCH", kickoff: "Sun 1:00", locked: false },
    { id: "p15", name: "Rashid Shaheed", pos: "WR", nfl: "NO", pts: 132.4, slot: "IR", kickoff: "Sun 4:25", locked: false },
  ];
  const ACQUIRED = { p1: "draft · Aug 28", p2: "draft · Aug 28", p3: "draft · Aug 28", p4: "draft · Aug 28", p5: "draft · Aug 28", p6: "trade · Oct 14", p7: "draft · Aug 28", p8: "draft · Aug 28", p9: "waiver · Sep 24", p10: "free agent · Oct 2", p11: "waiver · Sep 17", p12: "draft · Aug 28", p13: "draft · Aug 28", p14: "free agent · Nov 5", p15: "draft · Aug 28" };

  const SLOT_DEFS = [
    { slot: "QB", allow: ["QB"] },
    { slot: "RB", allow: ["RB"] }, { slot: "RB 2", allow: ["RB"] },
    { slot: "WR", allow: ["WR"] }, { slot: "WR 2", allow: ["WR"] }, { slot: "WR 3", allow: ["WR"] },
    { slot: "TE", allow: ["TE"] },
    { slot: "FLEX", allow: ["RB", "WR", "TE"] }, { slot: "FLEX 2", allow: ["RB", "WR", "TE"] },
  ];

  // --- free agents ---
  const FREE_AGENTS = [
    { id: "f1", name: "Jameson Williams", pos: "WR", nfl: "DET", pts: 152.6 },
    { id: "f2", name: "Tony Pollard", pos: "RB", nfl: "TEN", pts: 148.9 },
    { id: "f3", name: "Jakobi Meyers", pos: "WR", nfl: "LV", pts: 141.2 },
    { id: "f4", name: "Caleb Williams", pos: "QB", nfl: "CHI", pts: 238.7 },
    { id: "f5", name: "Tucker Kraft", pos: "TE", nfl: "GB", pts: 118.3 },
    { id: "f6", name: "Rico Dowdle", pos: "RB", nfl: "DAL", pts: 134.5 },
    { id: "f7", name: "Quentin Johnston", pos: "WR", nfl: "LAC", pts: 126.1 },
    { id: "f8", name: "Bryce Young", pos: "QB", nfl: "CAR", pts: 201.4 },
    { id: "f9", name: "Isaac Guerendo", pos: "RB", nfl: "SF", pts: 96.7 },
    { id: "f10", name: "Cedric Tillman", pos: "WR", nfl: "CLE", pts: 104.9 },
    { id: "f11", name: "Hunter Henry", pos: "TE", nfl: "NE", pts: 99.2 },
    { id: "f12", name: "Justice Hill", pos: "RB", nfl: "BAL", pts: 88.0 },
    { id: "f13", name: "Darius Slayton", pos: "WR", nfl: "NYG", pts: 92.5 },
    { id: "f14", name: "Sam Darnold", pos: "QB", nfl: "MIN", pts: 252.3 },
    { id: "f15", name: "Cade Otton", pos: "TE", nfl: "TB", pts: 94.8 },
    { id: "f16", name: "Roschon Johnson", pos: "RB", nfl: "CHI", pts: 71.6 },
    { id: "f17", name: "Adam Thielen", pos: "WR", nfl: "CAR", pts: 86.3 },
    { id: "f18", name: "Tyler Allgeier", pos: "RB", nfl: "ATL", pts: 90.1 },
    { id: "f19", name: "Demario Douglas", pos: "WR", nfl: "NE", pts: 77.4 },
    { id: "f20", name: "Michael Penix Jr.", pos: "QB", nfl: "ATL", pts: 64.2 },
  ];

  // owner map for players page (subset of other teams' players)
  const OWNED_BY_OTHERS = [
    { id: "o1", name: "Lamar Jackson", pos: "QB", nfl: "BAL", pts: 356.9, owner: 2 },
    { id: "o2", name: "Saquon Barkley", pos: "RB", nfl: "PHI", pts: 301.2, owner: 2 },
    { id: "o3", name: "Justin Jefferson", pos: "WR", nfl: "MIN", pts: 284.7, owner: 3 },
    { id: "o4", name: "Derrick Henry", pos: "RB", nfl: "BAL", pts: 277.4, owner: 4 },
    { id: "o5", name: "CeeDee Lamb", pos: "WR", nfl: "DAL", pts: 262.3, owner: 5 },
    { id: "o6", name: "Patrick Mahomes", pos: "QB", nfl: "KC", pts: 289.1, owner: 6 },
    { id: "o7", name: "Amon-Ra St. Brown", pos: "WR", nfl: "DET", pts: 269.8, owner: 7 },
    { id: "o8", name: "Trey McBride", pos: "TE", nfl: "ARI", pts: 188.6, owner: 8 },
    { id: "o9", name: "De'Von Achane", pos: "RB", nfl: "MIA", pts: 241.0, owner: 9 },
    { id: "o10", name: "Malik Nabers", pos: "WR", nfl: "NYG", pts: 233.5, owner: 10 },
    { id: "o11", name: "Jalen Hurts", pos: "QB", nfl: "PHI", pts: 312.4, owner: 11 },
    { id: "o12", name: "Breece Hall", pos: "RB", nfl: "NYJ", pts: 198.7, owner: 12 },
    { id: "o13", name: "George Kittle", pos: "TE", nfl: "SF", pts: 176.9, owner: 13 },
    { id: "o14", name: "Tyreek Hill", pos: "WR", nfl: "MIA", pts: 221.2, owner: 14 },
    { id: "o15", name: "Kyren Williams", pos: "RB", nfl: "LAR", pts: 229.6, owner: 3 },
    { id: "o16", name: "A.J. Brown", pos: "WR", nfl: "PHI", pts: 247.0, owner: 4 },
  ];

  // --- trades ---
  const TRADES = [
    {
      id: 1, from: 4, to: 1, status: "proposed",
      give: [{ name: "Derrick Henry", pos: "RB" }], get: [{ name: "Jaylen Waddle", pos: "WR" }, { name: "Tyjae Spears", pos: "RB" }],
      at: "Dec 9, 4:12 PM",
    },
    {
      id: 2, from: 1, to: 2, status: "applied",
      give: [{ name: "DK Metcalf", pos: "WR" }], get: [{ name: "Nico Collins", pos: "WR" }],
      at: "Oct 14, 9:30 AM",
    },
    {
      id: 3, from: 9, to: 1, status: "rejected",
      give: [{ name: "Breece Hall", pos: "RB" }], get: [{ name: "Ja'Marr Chase", pos: "WR" }],
      at: "Nov 2, 7:48 PM",
    },
  ];

  // --- transactions ---
  const PENDING_CLAIMS = [
    { id: 1, team: 5, add: "Jameson Williams", drop: "Tyler Allgeier", bid: 22, processes: "Wed 10:00 AM ET" },
    { id: 2, team: 9, add: "Rico Dowdle", drop: null, bid: 8, processes: "Wed 10:00 AM ET" },
  ];
  const TX_HISTORY = [
    { id: 1, type: "waiver", team: 1, add: "Jaylen Waddle", drop: "Romeo Doubs", at: "Sep 24, 10:02 AM" },
    { id: 2, type: "trade", team: 1, add: "Nico Collins", drop: "DK Metcalf", at: "Oct 14, 9:30 AM" },
    { id: 3, type: "free agent", team: 1, add: "Baker Mayfield", drop: null, at: "Oct 2, 1:11 PM" },
    { id: 4, type: "waiver", team: 11, add: "Sam Darnold", drop: "Will Levis", at: "Oct 30, 10:01 AM" },
    { id: 5, type: "free agent", team: 1, add: "Tyjae Spears", drop: "Zack Moss", at: "Nov 5, 8:55 PM" },
    { id: 6, type: "waiver", team: 7, add: "Cedric Tillman", drop: null, at: "Nov 12, 10:00 AM" },
    { id: 7, type: "drop", team: 13, add: null, drop: "Gus Edwards", at: "Nov 19, 3:24 PM" },
    { id: 8, type: "waiver", team: 2, add: "Quentin Johnston", drop: "Tutu Atwell", at: "Dec 3, 10:01 AM" },
  ];

  // --- alerts (week-14 opponent name derived from the actual schedule) ---
  const W14_OPP = (() => {
    const m = matchupsForWeek(14).find(x => x.home === 1 || x.away === 1);
    const oppId = m.home === 1 ? m.away : m.home;
    return (TEAMS.find(t => t.id === oppId) || {}).name || "—";
  })();
  const ALERTS = [
    { id: 1, title: "Trade offer from Hot Read Heroes", body: "Derrick Henry for Jaylen Waddle + Tyjae Spears. Respond on the Trades tab.", at: "Dec 9, 4:12 PM", unread: true },
    { id: 2, title: "Week 14 results are final", body: `You beat ${W14_OPP} 124.6–101.2. You're 12–2, first place.`, at: "Dec 9, 6:00 AM", unread: true },
    { id: 3, title: "Championship sprint field is locked", body: "You're seeded #3 of 100. Weeks 15–17 cumulative starter points decide the title.", at: "Dec 9, 6:05 AM", unread: false },
    { id: 4, title: "Waiver claim processed", body: "Your claim for Tyjae Spears was successful (bid $12).", at: "Nov 5, 10:00 AM", unread: false },
    { id: 5, title: "Your draft pick is in", body: "Round 8, pick 106: James Cook (RB · BUF).", at: "Aug 28, 9:41 PM", unread: false },
  ];

  // --- draft (async snake, 15 rounds) ---
  const DRAFT_POOL = ROSTER.map(p => ({ name: p.name, pos: p.pos, nfl: p.nfl }))
    .concat(OWNED_BY_OTHERS.map(p => ({ name: p.name, pos: p.pos, nfl: p.nfl })))
    .concat(FREE_AGENTS.map(p => ({ name: p.name, pos: p.pos, nfl: p.nfl })));

  function draftBoard(rounds) {
    const order = TEAMS.map(t => t.id);
    const picks = [];
    let overall = 1;
    for (let r = 1; r <= rounds; r++) {
      const seq = r % 2 === 1 ? order : [...order].reverse();
      for (const teamId of seq) {
        const pool = DRAFT_POOL[(overall * 7) % DRAFT_POOL.length];
        picks.push({ overall, round: r, teamId, player: pool, auto: rnd(overall) > 0.85 });
        overall++;
      }
    }
    return picks;
  }

  // championship sprint field (top 2 per league; pinned 3-week scores — you win the final)
  const SPRINT = [
    { seed: 1, team: "Cover Zero Heroes", league: "Wildcat League", you: false, wk: { 15: 128.4, 16: 131.0, 17: 118.2 } },
    { seed: 2, team: "Spider 2 Y Banana", league: "Midwest Charters", you: false, wk: { 15: 121.7, 16: 112.3, 17: 124.5 } },
    { seed: 3, team: "Stick Route Merchants", league: "Founders League", you: true, wk: { 15: 132.6, 16: 118.4, 17: 139.8 } },
    { seed: 4, team: "The Dink & Dunk", league: "Wildcat League", you: false, wk: { 15: 109.2, 16: 127.6, 17: 121.0 } },
    { seed: 5, team: "Glass Eaters DC", league: "Founders League", you: false, wk: { 15: 117.5, 16: 109.8, 17: 113.4 } },
    { seed: 6, team: "Max Protect", league: "Coastal Division", you: false, wk: { 15: 124.0, 16: 116.2, 17: 108.9 } },
    { seed: 7, team: "Hurry-Up Offense", league: "Night Slate League", you: false, wk: { 15: 102.8, 16: 121.4, 17: 117.6 } },
    { seed: 8, team: "Zone Flood", league: "Coastal Division", you: false, wk: { 15: 119.3, 16: 104.7, 17: 122.1 } },
    { seed: 9, team: "The Mike Backers", league: "Midwest Charters", you: false, wk: { 15: 111.6, 16: 118.9, 17: 106.4 } },
    { seed: 10, team: "Bootleg Kings", league: "Night Slate League", you: false, wk: { 15: 126.1, 16: 98.5, 17: 111.7 } },
    { seed: 11, team: "Press Coverage", league: "Sunday Ticket Club", you: false, wk: { 15: 96.4, 16: 113.2, 17: 119.5 } },
    { seed: 12, team: "Pull the Guard", league: "Sunday Ticket Club", you: false, wk: { 15: 104.9, 16: 107.1, 17: 95.8 } },
  ];

  // --- opponent lineups (deterministic per team) for the matchup detail view ---
  const OPP_POOL = {
    QB: [["Patrick Mahomes", "KC"], ["Joe Burrow", "CIN"], ["Jordan Love", "GB"], ["C.J. Stroud", "HOU"], ["Kyler Murray", "ARI"], ["Jared Goff", "DET"], ["Justin Herbert", "LAC"], ["Brock Purdy", "SF"], ["Dak Prescott", "DAL"], ["Trevor Lawrence", "JAX"], ["Tua Tagovailoa", "MIA"], ["Bo Nix", "DEN"], ["Jalen Hurts", "PHI"], ["Lamar Jackson", "BAL"]],
    RB: [["Saquon Barkley", "PHI"], ["Derrick Henry", "BAL"], ["Kyren Williams", "LAR"], ["De'Von Achane", "MIA"], ["Breece Hall", "NYJ"], ["Josh Jacobs", "GB"], ["Kenneth Walker", "SEA"], ["Joe Mixon", "HOU"], ["Aaron Jones", "MIN"], ["Rachaad White", "TB"], ["David Montgomery", "DET"], ["Najee Harris", "PIT"], ["Rhamondre Stevenson", "NE"], ["Zamir White", "LV"], ["Brian Robinson", "WAS"], ["D'Andre Swift", "CHI"]],
    WR: [["Justin Jefferson", "MIN"], ["CeeDee Lamb", "DAL"], ["Amon-Ra St. Brown", "DET"], ["A.J. Brown", "PHI"], ["Tyreek Hill", "MIA"], ["Malik Nabers", "NYG"], ["Garrett Wilson", "NYJ"], ["Drake London", "ATL"], ["DK Metcalf", "SEA"], ["DeVonta Smith", "PHI"], ["Chris Olave", "NO"], ["Marvin Harrison Jr.", "ARI"], ["Zay Flowers", "BAL"], ["Tee Higgins", "CIN"], ["Terry McLaurin", "WAS"], ["Courtland Sutton", "DEN"], ["Brian Thomas Jr.", "JAX"], ["Ladd McConkey", "LAC"]],
    TE: [["Trey McBride", "ARI"], ["George Kittle", "SF"], ["Travis Kelce", "KC"], ["Sam LaPorta", "DET"], ["Mark Andrews", "BAL"], ["David Njoku", "CLE"], ["Evan Engram", "JAX"], ["Jake Ferguson", "DAL"], ["Kyle Pitts", "ATL"], ["Pat Freiermuth", "PIT"], ["Dallas Goedert", "PHI"], ["Cole Kmet", "CHI"], ["Isaiah Likely", "BAL"], ["Jonnu Smith", "MIA"]],
  };
  const KICKOFFS = ["Sun 1:00", "Sun 4:05", "Sun 4:25", "Sun 8:20", "Mon 8:15", "Sat 8:15"];

  function opponentLineup(teamId) {
    const pick = (pos, i) => {
      const pool = OPP_POOL[pos];
      const [name, nfl] = pool[(teamId * 3 + i * 5) % pool.length];
      return { name, nfl, pos, kickoff: KICKOFFS[(teamId + i * 7) % KICKOFFS.length] };
    };
    const used = new Set();
    const uniq = (pos, i) => {
      let j = i, p = pick(pos, j);
      while (used.has(p.name)) { j++; p = pick(pos, j); }
      used.add(p.name);
      return p;
    };
    return [
      { slot: "QB", ...uniq("QB", 0) },
      { slot: "RB", ...uniq("RB", 0) }, { slot: "RB 2", ...uniq("RB", 1) },
      { slot: "WR", ...uniq("WR", 0) }, { slot: "WR 2", ...uniq("WR", 1) }, { slot: "WR 3", ...uniq("WR", 2) },
      { slot: "TE", ...uniq("TE", 0) },
      { slot: "FLEX", ...uniq("RB", 2) }, { slot: "FLEX 2", ...uniq("WR", 3) },
    ];
  }

  window.FPFL = {
    TEAMS, CURRENT_WEEK, ROSTER, ACQUIRED, SLOT_DEFS, FREE_AGENTS, OWNED_BY_OTHERS,
    TRADES, PENDING_CLAIMS, TX_HISTORY, ALERTS, SPRINT,
    matchupsForWeek, buildStandings, draftBoard, opponentLineup,
    teamName: (id) => (TEAMS.find(t => t.id === id) || {}).name || "—",
    LEAGUE: { name: "Founders League", season: 2025, numTeams: 14, status: "in season", scoring: "FP Advanced", inviteCode: "FNDRS-25" },
  };
})();
