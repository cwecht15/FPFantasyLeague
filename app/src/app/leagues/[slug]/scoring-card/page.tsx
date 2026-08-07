import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getLeagueForUser, getSettings } from "@/lib/leagues/service";
import {
  presetLabel,
  scoringCardSections,
  scoringCardText,
} from "@/lib/scoring/rules-card";
import { CopyButton } from "@/components/copy-button";
import { PrintButton } from "@/components/print-button";
import { ScoringCardView } from "@/components/scoring-card-view";
import { ToastHost } from "@/components/toast";

/**
 * Shareable scoring card — the league's active scoring rules on a single
 * chrome-free page (no nav/ticker; this route sits outside the (app) group)
 * sized for a screenshot, with copy-as-text and print/PDF export.
 */
export default async function ScoringCardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const ctx = await getLeagueForUser(slug, session.user.id);
  if (!ctx) notFound();

  const league = ctx.league;
  const settings = await getSettings(league.id);
  const rules = settings.scoringRules;

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[760px] px-6 py-8">
        <div className="mb-6 flex items-center gap-2.5 print:hidden">
          <Link href={`/leagues/${slug}/settings`} className="btn2">
            ← Settings
          </Link>
          <span className="flex-1" />
          <CopyButton
            text={scoringCardText(league.name, league.season, rules)}
            toast="Scoring rules copied as text"
          />
          <PrintButton />
        </div>

        <ScoringCardView
          title={league.name}
          meta={`${presetLabel(rules)} · Season ${league.season} · ${league.numTeams} teams`}
          sections={scoringCardSections(rules)}
        />
      </div>
      <ToastHost />
    </div>
  );
}
