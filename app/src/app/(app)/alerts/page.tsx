import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { auth, requireUser } from "@/lib/auth";
import { listNotifications, markAllRead } from "@/lib/notifications/service";

export const metadata = { title: "Alerts — FP Fantasy League" };

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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-3xl">Alerts</h1>
        {unread > 0 && (
          <form action={markReadAction}>
            <button type="submit" className="btn-ghost rounded-md px-3 py-1.5 text-xs font-bold">
              Mark all read ({unread})
            </button>
          </form>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted">Nothing yet — draft turns, waiver results, and trade
          updates land here.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((n) => (
            <li
              key={n.id}
              className={`rounded-lg border p-4 ${
                n.readAt ? "border-line opacity-70" : "border-flame/50"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold">{n.title}</span>
                <span className="text-xs text-faint">{n.createdAt.toLocaleString()}</span>
              </div>
              {n.body && <p className="mt-1 text-sm text-muted">{n.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
