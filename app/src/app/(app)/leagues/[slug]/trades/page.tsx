import { redirect } from "next/navigation";

/**
 * Trades are removed from the product (owner decision, 2026-08-14): rosters
 * change only through the draft, free agency, and waivers. The trade engine
 * (lib/trades/*) stays dormant behind this redirect in case it ever returns.
 */
export default async function TradesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/leagues/${slug}`);
}
