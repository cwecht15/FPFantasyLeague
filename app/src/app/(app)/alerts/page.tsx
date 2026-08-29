import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth, requireUser } from "@/lib/auth";
import { listNotifications, markAllRead } from "@/lib/notifications/service";

/** Where clicking an alert takes you — e.g. an on-the-clock alert opens the
 *  league's draft room. Alerts without a league (or an unmapped type) stay
 *  plain text. */
function alertHref(type: string, slug: string | null): string | null {
  if (!slug) return null;
  switch (type) {
    case "your_turn":
    case "pick_made":
      return `/leagues/${slug}/draft`;
    case "trade_offer":
      return `/leagues/${slug}/trades`;
    case "waiver_result":
      return `/leagues/${slug}/transactions`;
    case "matchup_result":
      return `/leagues/${slug}/matchups`;
    default:
      return `/leagues/${slug}`;
  }
}

export const metadata = { title: "Alerts" };

async function markReadAction() {
  "use server";
  const user = await requireUser();
  await markAllRead(user.id);
  revalidatePath("/alerts");
}

export default async function AlertsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const rows = await listNotifications(session.user.id);
  const unread = rows.filter((r) => !r.readAt).length;

  return (
    <div>
      <header className="page-head">
        <div>
          <div className="eyebrow">Inbox</div>
          <h1 className="display">Alerts</h1>
        </div>
        {unread > 0 && (
          <form action={markReadAction}>
            <button type="submit" className="btn gho">
              <span>Mark all read ({unread})</span>
            </button>
          </form>
        )}
      </header>

      {rows.length === 0 ? (
        <p className="empty">
          Nothing yet — draft turns and waiver results land here.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((n) => {
            const href = alertHref(n.type, n.leagueSlug);
            const inner = (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-extrabold">
                    {!n.readAt && (
                      <span
                        className="mr-2.5 inline-block h-[7px] w-[7px] rounded-full align-middle"
                        style={{ background: "var(--color-flame)" }}
                      />
                    )}
                    {n.title}
                  </span>
                  <span className="text-[11.5px] text-faint">
                    {n.createdAt.toLocaleString()}
                    {href && <span className="ml-2 text-flame">→</span>}
                  </span>
                </div>
                {n.body && <p className="mb-0 mt-1 text-[13px] text-muted">{n.body}</p>}
              </>
            );
            const style = n.readAt
              ? { opacity: 0.7 }
              : { borderColor: "rgba(204,51,51,0.5)" };
            return href ? (
              <Link
                key={n.id}
                href={href}
                className="panel block px-[22px] py-3.5 transition-colors hover:border-flame"
                style={style}
              >
                {inner}
              </Link>
            ) : (
              <div key={n.id} className="panel px-[22px] py-3.5" style={style}>
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
