import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLeagueForUser } from "@/lib/leagues/service";

const TABS = [
  { href: "", label: "Home" },
  { href: "/roster", label: "My Roster" },
  { href: "/players", label: "Players" },
  { href: "/draft", label: "Draft" },
  { href: "/lineup", label: "Lineup" },
  { href: "/matchups", label: "Matchups" },
  { href: "/standings", label: "Standings" },
  { href: "/trades", label: "Trades" },
  { href: "/transactions", label: "Transactions" },
  { href: "/settings", label: "Settings" },
];

export default async function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const ctx = await getLeagueForUser(slug, session.user.id);
  if (!ctx) notFound();

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="display text-3xl">{ctx.league.name}</h1>
        <span className="text-sm text-muted">
          {ctx.league.season} · {ctx.league.status.replace("_", " ")}
        </span>
      </div>
      <nav className="mt-4 flex flex-wrap gap-1 border-b border-line pb-2 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={`/leagues/${slug}${t.href}`}
            className="rounded-md px-3 py-1.5 text-paper/80 hover:bg-surface hover:text-paper"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">{children}</div>
    </div>
  );
}
