import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLeagueForUser } from "@/lib/leagues/service";
import { LeagueTabs } from "@/components/league-tabs";

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
      <LeagueTabs slug={slug} />
      <div>{children}</div>
    </div>
  );
}
