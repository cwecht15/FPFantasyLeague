import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { logout } from "@/lib/auth/actions";
import { unreadCount } from "@/lib/notifications/service";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const unread = await unreadCount(session.user.id);

  return (
    <div className="min-h-screen">
      <header className="bg-ink">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/leagues" className="shrink-0">
            <Image
              src="/brand/Wordmark-Primary.svg"
              alt="Fantasy Points"
              width={164}
              height={30}
              priority
            />
          </Link>
          <div className="flex items-center gap-5 text-sm">
            <Link href="/alerts" className="font-bold text-muted hover:text-paper">
              Alerts
              {unread > 0 && (
                <span className="ml-1 rounded bg-flame px-1.5 py-0.5 text-[10px] font-bold text-paper">
                  {unread}
                </span>
              )}
            </Link>
            <Link href="/championship" className="font-bold text-muted hover:text-paper">
              Championship
            </Link>
            {session.user.isSiteAdmin && (
              <Link href="/admin/scoring-lab" className="font-bold text-muted hover:text-paper">
                Scoring Lab
              </Link>
            )}
            <span className="hidden text-faint sm:inline">
              {session.user.name ?? session.user.email}
            </span>
            <form action={logout}>
              <button type="submit" className="btn-ghost rounded-md px-3 py-1.5 text-xs font-bold">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <div className="red-rule" />
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
