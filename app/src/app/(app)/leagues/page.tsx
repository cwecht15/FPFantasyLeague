import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listMyLeagues } from "@/lib/leagues/service";
import { createLeagueAction, joinLeagueAction } from "@/lib/leagues/actions";
import { ActionForm } from "@/components/action-form";
import { SCORING_PRESET_OPTIONS } from "@/lib/scoring/scoring-systems";

export const metadata = { title: "My leagues — FP Fantasy League" };

const inputClass =
  "rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-paper focus:outline-none";

export default async function LeaguesPage() {
  const user = await requireUser();
  // Demo leagues surface for site admins only.
  const myLeagues = await listMyLeagues(user.id, user.isSiteAdmin);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="display text-3xl">My leagues</h1>
        {myLeagues.length === 0 ? (
          <p className="mt-3 text-muted">
            You&apos;re not in any leagues yet — create one or join with an invite code.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {myLeagues.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/leagues/${l.slug}`}
                  className="block rounded-lg border border-line p-4 hover:border-line-strong"
                >
                  <div className="font-semibold">{l.name}</div>
                  <div className="mt-1 text-sm text-muted">
                    {l.season} · {l.numTeams} teams · {l.status.replace("_", " ")}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-10 md:grid-cols-2">
        {user.isSiteAdmin && (
        <section className="rounded-lg border border-line p-5">
          <h2 className="display text-xl">Create a league</h2>
          <div className="mt-4">
            <ActionForm action={createLeagueAction} submitLabel="Create league">
              <label className="flex flex-col gap-1 text-sm">
                League name
                <input name="name" required minLength={3} maxLength={60} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Your team name
                <input name="teamName" required minLength={2} maxLength={40} className={inputClass} />
              </label>
              <div className="flex gap-4">
                <label className="flex flex-1 flex-col gap-1 text-sm">
                  Teams
                  <select name="numTeams" defaultValue="12" className={inputClass}>
                    {[4, 6, 8, 10, 12, 14, 16, 18, 20].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-1 flex-col gap-1 text-sm">
                  Scoring
                  <select name="scoringPreset" defaultValue="fp_advanced" className={inputClass}>
                    {SCORING_PRESET_OPTIONS.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </ActionForm>
          </div>
        </section>
        )}

        <section className="rounded-lg border border-line p-5">
          <h2 className="display text-xl">Join with an invite code</h2>
          <div className="mt-4">
            <ActionForm action={joinLeagueAction} submitLabel="Join league">
              <label className="flex flex-col gap-1 text-sm">
                Invite code
                <input name="inviteCode" required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Your team name
                <input name="teamName" required minLength={2} maxLength={40} className={inputClass} />
              </label>
            </ActionForm>
          </div>
        </section>
      </div>
    </div>
  );
}
