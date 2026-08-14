import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications/service";
import { listMyLeagues } from "@/lib/leagues/service";
import { TopNav } from "@/components/top-nav";
import { ToastHost } from "@/components/toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const unread = await unreadCount(session.user.id);

  // One league per user: the wordmark goes straight to their league home.
  const myLeagues = await listMyLeagues(session.user.id, session.user.isSiteAdmin);
  const homeHref = session.user.isSiteAdmin
    ? "/admin/leagues"
    : myLeagues[0]
      ? `/leagues/${myLeagues[0].slug}`
      : "/leagues";

  return (
    <div className="min-h-screen">
      <TopNav
        homeHref={homeHref}
        userLabel={session.user.name ?? session.user.email ?? ""}
        isAdmin={session.user.isSiteAdmin}
        unread={unread}
      />
      <main className="wrap pb-16">{children}</main>
      <ToastHost />
    </div>
  );
}
