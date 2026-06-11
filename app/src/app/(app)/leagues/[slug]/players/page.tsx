import Link from "next/link";
import { and, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { players, playerWeekScores, rosterEntries, teams } from "@/lib/db/schema";
import { getLeagueForUser } from "@/lib/leagues/service";
import { fmt1 } from "@/lib/format";
import { AddButton, DropButton } from "@/components/player-row-actions";

// No kickers, no defenses on this platform.
const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"];
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

  const conditions = [inArray(players.position, ["QB", "RB", "WR", "TE"])];
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
    .orderBy(sql`coalesce(sum(${playerWeekScores.fantasyPoints}), 0) DESC`)
    .limit(150);

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.leagueId, league.id));
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]));
  const myTeamId = ctx.myTeam?.id ?? null;

  const filtered =
    view === "available"
      ? rows.filter((r) => r.ownerTeamId === null)
      : view === "mine"
        ? rows.filter((r) => r.ownerTeamId === myTeamId)
        : rows;

  const pillHref = (next: Record<string, string>) => {
    const sp = new URLSearchParams({ q, pos, view, ...next });
    return `/leagues/${slug}/players?${sp.toString()}`;
  };

  return (
    <div>
      <header className="page-head">
        <div>
          <div className="eyebrow">{league.name}</div>
          <h1 className="display">Players</h1>
        </div>
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
            {filtered.map((r) => (
              <tr key={r.gsisId} className="hov">
                <td className="tm">{r.name}</td>
                <td>
                  <span className={`pos ${r.position}`}>{r.position}</span>
                </td>
                <td className="dim">{r.nflTeam}</td>
                <td className="r num">{fmt1(Number(r.points))}</td>
                <td>
                  {r.ownerTeamId === null ? (
                    <span className="font-extrabold">Free agent</span>
                  ) : (
                    <span className="dim">{teamName.get(r.ownerTeamId) ?? "—"}</span>
                  )}
                </td>
                <td className="r">
                  {r.ownerTeamId === null && myTeamId && <AddButton slug={slug} gsisId={r.gsisId} />}
                  {r.ownerTeamId === myTeamId && myTeamId && (
                    <DropButton slug={slug} gsisId={r.gsisId} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="empty">No players match.</p>}
      </div>
      <p className="note mb-11 mt-3">
        Adds in waiver leagues become claims and process at the league&apos;s weekly waiver
        time; free-agency leagues add instantly.
      </p>
    </div>
  );
}
