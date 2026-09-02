/**
 * Anonymous spectator chrome for a public league (/watch/<slug>). Sits outside
 * the (app) group so no auth layout runs; getPublicLeague is the only gate —
 * private/demo leagues 404. Read-only: no TopNav, no ToastHost, no actions.
 *
 * force-dynamic matters here: with no auth()/cookies() call these routes would
 * otherwise be eligible for the full-route cache and the live draft board
 * would freeze (the app's revalidatePath calls only cover /leagues/... paths).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getPublicLeague } from "@/lib/leagues/service";
import { SITE_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const pub = await getPublicLeague(slug);
  return {
    title: pub
      ? { default: pub.league.name, template: `%s — ${pub.league.name}` }
      : undefined,
  };
}

const TABS = [
  { href: "draft", label: "Draft" },
  { href: "matchups", label: "Matchups" },
  { href: "standings", label: "Standings" },
];

export default async function WatchLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pub = await getPublicLeague(slug);
  if (!pub) notFound();

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="wrap flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <div className="label">{SITE_NAME} · Spectator view</div>
            <div className="display text-2xl">{pub.league.name}</div>
          </div>
          <nav className="flex items-center gap-2">
            {TABS.map((t) => (
              <Link key={t.href} href={`/watch/${slug}/${t.href}`} className="btn2">
                {t.label}
              </Link>
            ))}
            <Link href="/login" className="btn2" style={{ opacity: 0.7 }}>
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <main className="wrap pb-16 pt-6">{children}</main>
    </div>
  );
}
