import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { listMyLeagues } from "@/lib/leagues/service";
import { joinLeagueAction } from "@/lib/leagues/actions";
import { ActionForm } from "@/components/action-form";

/** One league per user: this route just routes you home. Users with no league
 *  yet land on the join-with-code screen; admins go to Manage Leagues. */
export default async function LeaguesPage() {
  const user = await requireUser();
  const myLeagues = await listMyLeagues(user.id, false);

  if (myLeagues[0]) redirect(`/leagues/${myLeagues[0].slug}`);
  if (user.isSiteAdmin) redirect("/admin/leagues");

  return (
    <div className="mx-auto max-w-[480px]">
      <header className="page-head">
        <div>
          <div className="eyebrow">Welcome</div>
          <h1 className="display" style={{ fontSize: 40 }}>
            Join your league
          </h1>
          <div className="sub">
            Paste the invite code from your league admin — or ask them to assign you directly.
          </div>
        </div>
      </header>

      <div className="panel">
        <div className="px-[26px] py-6">
          <ActionForm action={joinLeagueAction} submitLabel="Join league">
            <div className="field">
              <label>Invite code</label>
              <input name="inviteCode" required className="input code" placeholder="a1b2c3d4e5f6" />
            </div>
            <div className="field">
              <label>Your team name</label>
              <input name="teamName" required minLength={2} maxLength={40} className="input" />
            </div>
          </ActionForm>
        </div>
      </div>
    </div>
  );
}
