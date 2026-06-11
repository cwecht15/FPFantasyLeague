import Link from "next/link";
import { and, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { players, playerWeekScores, rosterEntries, teams } from "@/lib/db/schema";
import { getLeagueForUser } from "@/lib/leagues/service";
import { AddButton, DropButton } from "@/components/player-row-actions";

// No kickers, no defenses on this platform.
const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"];

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

  // Season fantasy points under THIS league's rules (zero until scored).
  const pointsExpr = sql<number>`coalesce(sum(${playerWeekScores.fantasyPoints}), 0)`;

  const conditions = [inArray(players.position, ["QB", "RB", "WR", "TE"])];
  if (pos !== "ALL") conditions.push(eq(players.position, pos));
  if (q.trim()) conditions.push(ilike(players.displayName, `%${q.trim()}%`));

  const rows = await db
    .select({
      gsisId: players.gsisId,
      name: players.displayName,
      position: players.position,
      nflTeam: players.nflTeam,
      points: pointsExpr,
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
    .where(conditions.length ? and(...conditions) : undefined)
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

  const filterLink = (label: string, params: Record<string, string>) => {
    const sp = new URLSearchParams({ q, pos, view, ...params });
    return (
      <Link
        key={label}
        href={`/leagues/${slug}/players?${sp.toString()}`}
        className={`rounded px-2 py-1 text-xs ${
          (params.pos ?? pos) === pos && (params.view ?? view) === view && !("pos" in params || "view" in params)
            ? ""
            : ""
        } ${
          params.pos === pos || params.view === view
            ? "bg-paper font-semibold text-ink"
            : "border border-line text-muted hover:bg-surface"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <form className="flex items-center gap-2" action={`/leagues/${slug}/players`} method="get">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search players…"
            className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm focus:border-paper focus:outline-none"
          />
          <input type="hidden" name="pos" value={pos} />
          <input type="hidden" name="view" value={view} />
          <button type="submit" className="rounded border border-line-strong px-3 py-1.5 text-sm hover:bg-surface">
            Search
          </button>
        </form>
        <div className="flex flex-wrap gap-1">
          {POSITIONS.map((p) => filterLink(p, { pos: p }))}
        </div>
        <div className="flex flex-wrap gap-1">
          {filterLink("All", { view: "all" })}
          {filterLink("Available", { view: "available" })}
          {filterLink("My team", { view: "mine" })}
        </div>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line-strong text-left text-xs text-faint">
            <th className="px-2 py-2">Player</th>
            <th className="px-2 py-2">Pos</th>
            <th className="px-2 py-2">NFL</th>
            <th className="px-2 py-2 text-right">Season pts</th>
            <th className="px-2 py-2">Owner</th>
            <th className="px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.gsisId} className="border-b border-line hover:bg-pit">
              <td className="px-2 py-1.5">{r.name}</td>
              <td className="px-2 py-1.5">{r.position}</td>
              <td className="px-2 py-1.5 text-muted">{r.nflTeam}</td>
              <td className="px-2 py-1.5 text-right font-mono">{Number(r.points).toFixed(1)}</td>
              <td className="px-2 py-1.5 text-muted">
                {r.ownerTeamId ? (teamName.get(r.ownerTeamId) ?? "—") : ""}
              </td>
              <td className="px-2 py-1.5">
                {r.ownerTeamId === null && myTeamId && <AddButton slug={slug} gsisId={r.gsisId} />}
                {r.ownerTeamId === myTeamId && myTeamId && <DropButton slug={slug} gsisId={r.gsisId} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="text-sm text-faint">No players match.</p>}
    </div>
  );
}
