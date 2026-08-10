import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { leagues, teams } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { getMembership } from "@/lib/leagues/service";
import { AuthStage } from "@/components/auth-stage";
import { JoinSignupForm, JoinTeamForm } from "@/components/join-forms";

export const metadata = { title: "Join league — FP Fantasy League" };

/** Invite link landing: /join/<inviteCode>. New managers create an account
 *  (username + password + team name) and join in one step; signed-in managers
 *  just pick a team name. */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.inviteCode, code.trim()))
    .limit(1);

  if (!league || league.isDemo || (league.status !== "setup" && league.status !== "drafting")) {
    return (
      <AuthStage title="Invite not found" sub="This invite link is no longer valid">
        <p className="text-center text-[13px] text-muted">
          Ask your league admin for a fresh link.
        </p>
      </AuthStage>
    );
  }

  const filled = (
    await db.select({ id: teams.id }).from(teams).where(eq(teams.leagueId, league.id))
  ).length;

  const session = await auth();
  if (session?.user?.id) {
    const member = await getMembership(league.id, session.user.id);
    if (member) redirect(`/leagues/${league.slug}`);
  }

  const sub = `${league.name} — ${filled} of ${league.numTeams} spots filled`;

  if (filled >= league.numTeams) {
    return (
      <AuthStage title="League is full" sub={sub}>
        <p className="text-center text-[13px] text-muted">
          All spots are taken — contact your league admin.
        </p>
      </AuthStage>
    );
  }

  return session?.user?.id ? (
    <AuthStage title="Join league" sub={sub}>
      <JoinTeamForm inviteCode={league.inviteCode} />
    </AuthStage>
  ) : (
    <AuthStage title="You're invited" sub={sub}>
      <JoinSignupForm inviteCode={league.inviteCode} />
    </AuthStage>
  );
}
