import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { players, teams } from "@/lib/db/schema";
import { getLeagueForUser } from "@/lib/leagues/service";
import { getDraft, getDraftBoard } from "@/lib/draft/service";
import { PollRefresher } from "@/components/draft-client";
import { DraftBoard, type BoardPlayer } from "@/components/draft-board";

export const metadata = { title: "Draft board" };

export default async function DraftBoardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const ctx = await getLeagueForUser(slug, session.user.id);
  if (!ctx) notFound();

  const draft = await getDraft(ctx.league.id);
  if (!draft) redirect(`/leagues/${slug}/draft`);

  const board = await getDraftBoard(draft.id);
  const teamRows = await db
    .select({ id: teams.id, name: teams.name, draftPosition: teams.draftPosition })
    .from(teams)
    .where(eq(teams.leagueId, ctx.league.id));
  const orderedTeams = [...teamRows].sort(
    (a, b) => (a.draftPosition ?? 99) - (b.draftPosition ?? 99),
  );

  const boardPlayers = new Map<string, BoardPlayer>();
  const rows = await db
    .select({
      gsisId: players.gsisId,
      name: players.displayName,
      position: players.position,
      nflTeam: players.nflTeam,
    })
    .from(players);
  for (const r of rows) {
    boardPlayers.set(r.gsisId, { name: r.name, position: r.position, nflTeam: r.nflTeam });
  }

  return (
    <div>
      {(draft.status === "in_progress" || draft.status === "paused") && <PollRefresher />}
      <div className="flex items-baseline justify-between">
        <h2 className="display text-2xl">Draft board</h2>
        <Link href={`/leagues/${slug}/draft`} className="text-xs font-bold text-muted hover:text-paper">
          ← Back to draft room
        </Link>
      </div>
      <div className="mt-4">
        <DraftBoard
          teams={orderedTeams}
          picks={board}
          players={boardPlayers}
          currentPickId={draft.status === "complete" ? null : draft.currentPickId}
          myTeamId={ctx.myTeam?.id ?? null}
        />
      </div>
    </div>
  );
}
