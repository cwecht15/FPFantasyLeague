import Link from "next/link";
import { and, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { players, playerWeekScores, rosterEntries, teams, waiverClaims } from "@/lib/db/schema";
import { getLeagueForUser, getSettings } from "@/lib/leagues/service";
import { lockedNflTeams, nextWeeklyEt, WAIVER_DOW, WAIVER_HOUR_ET } from "@/lib/transactions/game-lock";
import { faabRemaining } from "@/lib/transactions/waivers";
import { rosterCap } from "@/lib/transactions/service";
import { fmt1 } from "@/lib/format";
import {
  AddButton,
  BidButton,
  DropButton,
  type DropOption,
} from "@/components/player-row-actions";
import { PlayerName } from "@/components/player-log";

// No kickers, no defenses on this platform. COACH = team coaching staffs.
const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "COACH"];
const VIEWS = [
  { key: "all", label: "All" },
  { key: "available", label: "Available" },
  { key: "mine", label: "My team" },
];

export default async function PlayersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; pos?: string; view?: string }>;
}) {
  const { slug } = await params;
  const { q = "", pos = "ALL", view = "all" } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const ctx = await getLeagueForUser(slug, session.user.id);
  if (!ctx) notFound();

  const league = ctx.league;
  const settings = await getSettings(league.id);
  const waiverMode = settings.waiverConfig.mode;
  const gameLock = waiverMode !== "none";

  const conditions = [inArray(players.position, ["QB", "RB", "WR", "TE", "COACH"])];
  if (pos !== "ALL") conditions.push(eq(players.position, pos));
  if (q.trim()) conditions.push(ilike(players.displayName, `%${q.trim()}%`));

  const rows = await db
    .select({
      gsisId: players.gsisId,
      name: players.displayName,
      position: players.position,
      nflTeam: players.nflTeam,
      points: sql<number>`coalesce(sum(${playerWeekScores.fantasyPoints}), 0)`,
      ownerTeamId: sql<number | null>`max(${rosterEntries.teamId})`,
    })
    .from(players)
    .leftJoin(
      playerWeekScores,
      and(
        eq(playerWeekScores.gsisId, players.gsisId),
        eq(playerWeekScores.leagueId, league.id),
        eq(playerWeekScores.season, league.season),
        eq(playerWeekScores.seasonType, "REG"),
      ),
    )
    .leftJoin(
      rosterEntries,
      and(
        eq(rosterEntries.gsisId, players.gsisId),
        eq(rosterEntries.leagueId, league.id),
        isNull(rosterEntries.droppedAt),
      ),
    )
    .where(and(...conditions))
    .groupBy(players.gsisId, players.displayName, players.position, players.nflTeam)
    // View filter must run in SQL, before the row limit — otherwise "mine" /
    // "available" only see whatever happens to land in the first 150 rows.
    .having(
      view === "available"
        ? sql`max(${rosterEntries.teamId}) is null`
        : view === "mine"
          ? sql`max(${rosterEntries.teamId}) = ${ctx.myTeam?.id ?? -1}`
          : sql`true`,
    )
    .orderBy(sql`coalesce(sum(${playerWeekScores.fantasyPoints}), 0) DESC`)
    .limit(150)
    // pg returns max(bigint) as a string — normalize before comparing to ids.
    .then((rs) =>
      rs.map((r) => ({ ...r, ownerTeamId: r.ownerTeamId == null ? null : Number(r.ownerTeamId) })),
    );

  const teamRows = await db
    .select({ id: teams.id, name: teams.name, faabBudget: teams.faabBudget })
    .from(teams)
    .where(eq(teams.leagueId, league.id));
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]));
  const myTeamId = ctx.myTeam?.id ?? null;
  const myTeam = teamRows.find((t) => t.id === myTeamId);
  const myBudget = myTeam ? faabRemaining(myTeam, settings.waiverConfig) : null;

  const locked = gameLock ? await lockedNflTeams(league.season) : new Set<string>();
  const isLocked = (nflTeam: string | null) => !!nflTeam && locked.has(nflTeam);

  // My roster, offered as drop choices inside the Add/Bid flows.
  const POS_ORDER = ["QB", "RB", "WR", "TE", "COACH"];
  let myRoster: DropOption[] = [];
  if (myTeamId) {
    const mine = await db
      .select({ gsisId: players.gsisId, name: players.displayName, position: players.position, nflTeam: players.nflTeam })
      .from(rosterEntries)
      .innerJoin(players, eq(players.gsisId, rosterEntries.gsisId))
      .where(and(eq(rosterEntries.teamId, myTeamId), isNull(rosterEntries.droppedAt)));
    myRoster = mine
      .map((p) => ({
        gsisId: p.gsisId,
        name: p.name,
        position: p.position,
        locked: isLocked(p.nflTeam),
      }))
      .sort(
        (a, b) =>
          POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position) ||
          a.name.localeCompare(b.name),
      );
  }
  const rosterFull = myRoster.length >= rosterCap(settings.rosterTemplate);

  // My pending bids, so a locked row shows the current bid instead of $0.
  const myBids = new Map<string, number | null>();
  if (myTeamId && gameLock) {
    const pending = await db
      .select({ addGsisId: waiverClaims.addGsisId, bidAmount: waiverClaims.bidAmount })
      .from(waiverClaims)
      .where(
        and(
          eq(waiverClaims.leagueId, league.id),
          eq(waiverClaims.teamId, myTeamId),
          eq(waiverClaims.status, "pending"),
        ),
      );
    for (const c of pending) myBids.set(c.addGsisId, c.bidAmount);
  }

  const nextRun = nextWeeklyEt(
    settings.waiverConfig.processDow ?? WAIVER_DOW,
    settings.waiverConfig.processHourEt ?? WAIVER_HOUR_ET,
  );
  const nextRunLabel = nextRun.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  const pillHref = (next: Record<string, string>) => {
    const sp = new URLSearchParams({ q, pos, view, ...next });
    return `/leagues/${slug}/players?${sp.toString()}`;
  };

  const filtered = rows;

  return (
    <div>
      <header className="page-head">
        <div>
          <div className="eyebrow">{league.name}</div>
          <h1 className="display">Players</h1>
          {gameLock && (
            <div className="sub">
              Free agents until kickoff — then locked and bid-only. Waivers run {nextRunLabel} ET.
            </div>
          )}
        </div>
        {waiverMode === "faab" && myBudget !== null && (
          <div className="chip">
            <span>Waiver budget</span>
            <span className="num font-mono text-[18px] font-extrabold">${myBudget}</span>
          </div>
        )}
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form action={`/leagues/${slug}/players`} method="get" className="flex items-center gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search players…"
            className="input"
            style={{ width: 230 }}
          />
          <input type="hidden" name="pos" value={pos} />
          <input type="hidden" name="view" value={view} />
          <button type="submit" className="btn2">
            Search
          </button>
        </form>
        <div className="flex gap-1.5">
          {POSITIONS.map((p) => (
            <Link key={p} href={pillHref({ pos: p })} className={`pill ${p === pos ? "on" : ""}`}>
              {p}
            </Link>
          ))}
        </div>
        <div className="flex gap-1.5">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={pillHref({ view: v.key })}
              className={`pill ${v.key === view ? "on" : ""}`}
            >
              {v.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="panel">
        <table className="tbl">
          <thead>
            <tr>
              <th>Player</th>
              <th>Pos</th>
              <th>NFL</th>
              <th className="r">Season pts</th>
              <th>Owner</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const rowLocked = isLocked(r.nflTeam);
              return (
                <tr key={r.gsisId} className="hov">
                  <td className="tm">
                    <PlayerName slug={slug} gsisId={r.gsisId} name={r.name} />
                    {rowLocked && <span className="lu-tag">LOCKED</span>}
                  </td>
                  <td>
                    <span className={`pos ${r.position}`}>{r.position}</span>
                  </td>
                  <td className="dim">{r.nflTeam}</td>
                  <td className="r num">{fmt1(Number(r.points))}</td>
                  <td>
                    {r.ownerTeamId === null ? (
                      <span className="font-extrabold">
                        {rowLocked ? "Waivers" : "Free agent"}
                      </span>
                    ) : (
                      <span className="dim">{teamName.get(r.ownerTeamId) ?? "—"}</span>
                    )}
                  </td>
                  <td className="r">
                    {r.ownerTeamId === null &&
                      myTeamId &&
                      (rowLocked && waiverMode === "faab" ? (
                        <BidButton
                          slug={slug}
                          gsisId={r.gsisId}
                          maxBid={myBudget ?? 0}
                          currentBid={myBids.has(r.gsisId) ? (myBids.get(r.gsisId) ?? 0) : null}
                          myRoster={myRoster}
                          rosterFull={rosterFull}
                        />
                      ) : (
                        <AddButton
                          slug={slug}
                          gsisId={r.gsisId}
                          myRoster={myRoster}
                          rosterFull={rosterFull}
                        />
                      ))}
                    {r.ownerTeamId === myTeamId &&
                      myTeamId &&
                      (rowLocked && gameLock ? (
                        <span className="dim text-[11px]">LOCKED</span>
                      ) : (
                        <DropButton slug={slug} gsisId={r.gsisId} />
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="empty">No players match.</p>}
      </div>
      <p className="note mb-11 mt-3">
        {gameLock
          ? "Players lock everywhere at their game's kickoff. Locked free agents take blind $ bids " +
            "(ties go to the worse record); claims process Wednesday 3:00 AM ET, then everyone " +
            "unclaimed is a free agent again."
          : "Free-agency league — adds apply instantly."}
      </p>
    </div>
  );
}
