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
          Nothing yet — draft turns, waiver results, and trade updates land here.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((n) => (
            <div
              key={n.id}
              className="panel px-[22px] py-3.5"
              style={
                n.readAt
                  ? { opacity: 0.7 }
                  : { borderColor: "rgba(204,51,51,0.5)" }
              }
            >
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
                <span className="text-[11.5px] text-faint">{n.createdAt.toLocaleString()}</span>
              </div>
              {n.body && <p className="mb-0 mt-1 text-[13px] text-muted">{n.body}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
