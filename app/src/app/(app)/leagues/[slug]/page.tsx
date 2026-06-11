import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLeagueForUser, listTeams } from "@/lib/leagues/service";
import { generateScheduleAction, renameTeamAction } from "@/lib/leagues/actions";
import { ActionForm } from "@/components/action-form";

export default async function LeagueHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const ctx = await getLeagueForUser(slug, session.user.id);
  if (!ctx) notFound();

  const teams = await listTeams(ctx.league.id);
  const commish = session.user.isSiteAdmin; // central admin shares invite codes

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section>
        <h2 className="display text-xl">Teams ({teams.length}/{ctx.league.numTeams})</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {teams.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-md border border-line px-4 py-2"
            >
              <span>{t.name}</span>
              {t.ownerUserId === session.user.id && (
                <span className="text-xs text-faint">you</span>
              )}
              {!t.ownerUserId && <span className="text-xs text-faint">unclaimed</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-6">
        {commish && (
          <div className="rounded-lg border border-line p-4">
            <h3 className="font-semibold">Invite managers</h3>
            <p className="mt-2 text-sm text-muted">
              Share this invite code — new managers paste it on the leagues page:
            </p>
            <code className="mt-2 inline-block rounded bg-surface px-3 py-1.5 font-mono text-flame">
              {ctx.league.inviteCode}
            </code>
          </div>
        )}

        {commish && (
          <div className="rounded-lg border border-line p-4">
            <h3 className="font-semibold">Schedule</h3>
            <p className="mt-2 text-sm text-muted">
              (Re)generate the regular-season round-robin schedule. Safe while the league is
              in setup; existing regular-season matchups are replaced.
            </p>
            <div className="mt-3">
              <ActionForm
                action={generateScheduleAction}
                submitLabel="Generate schedule"
                successMessage="Schedule generated"
              >
                <input type="hidden" name="slug" value={slug} />
              </ActionForm>
            </div>
          </div>
        )}

        {ctx.myTeam && (
          <div className="rounded-lg border border-line p-4">
            <h3 className="font-semibold">My team</h3>
            <div className="mt-3">
              <ActionForm
                action={renameTeamAction}
                submitLabel="Rename"
                successMessage="Saved"
                className="flex items-end gap-3"
              >
                <input type="hidden" name="slug" value={slug} />
                <label className="flex flex-col gap-1 text-sm">
                  Team name
                  <input
                    name="teamName"
                    defaultValue={ctx.myTeam.name}
                    required
                    minLength={2}
                    maxLength={40}
                    className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-paper focus:outline-none"
                  />
                </label>
              </ActionForm>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
