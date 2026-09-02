import { notFound, redirect } from "next/navigation";

import { getPublicLeague } from "@/lib/leagues/service";
import { getDraft } from "@/lib/draft/service";

export default async function WatchIndexPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pub = await getPublicLeague(slug);
  if (!pub) notFound();

  // While the draft is live (or upcoming) that's what followers came to see;
  // after it completes the weekly matchups take over.
  const draft = await getDraft(pub.league.id);
  if (draft && draft.status !== "complete") redirect(`/watch/${slug}/draft`);
  redirect(`/watch/${slug}/matchups`);
}
