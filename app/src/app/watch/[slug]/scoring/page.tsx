/**
 * Spectator scoring card — the league's active rules via the same pure
 * ScoringCardView the authed scoring-card page and Lab overlay use.
 */

import { notFound } from "next/navigation";

import { getPublicLeague, getSettings } from "@/lib/leagues/service";
import { presetLabel, scoringCardSections } from "@/lib/scoring/rules-card";
import { ScoringCardView } from "@/components/scoring-card-view";

export const metadata = { title: "Scoring" };

export default async function WatchScoringPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pub = await getPublicLeague(slug);
  if (!pub) notFound();
  const league = pub.league;

  const settings = await getSettings(league.id);
  const rules = settings.scoringRules;

  return (
    <div className="mx-auto max-w-[760px]">
      <ScoringCardView
        title={league.name}
        meta={`${presetLabel(rules)} · Season ${league.season} · ${league.numTeams} teams`}
        sections={scoringCardSections(rules)}
      />
    </div>
  );
}
