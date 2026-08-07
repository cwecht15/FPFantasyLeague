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
import { ToastHost } from "@/components/toast";

/**
 * Shareable scoring card — the league's active scoring rules on a single
 * chrome-free page (no nav/ticker; this route sits outside the (app) group)
 * sized for a screenshot, with copy-as-text and print/PDF export. Printing
 * flips to a light palette since browsers skip background graphics by default.
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
  const sections = scoringCardSections(rules);
  const asText = scoringCardText(league.name, league.season, rules);

  return (
    <div className="print-card min-h-screen">
      <style>{`
        @media print {
          body { background: #fff; }
          .print-card {
            --color-ink: #ffffff;
            --color-paper: #111111;
            --color-pit: #ffffff;
            --color-surface: #f4f4f4;
            --color-line: rgba(17, 17, 17, 0.2);
            --color-line-strong: rgba(17, 17, 17, 0.35);
            --color-muted: rgba(17, 17, 17, 0.68);
            --color-faint: rgba(17, 17, 17, 0.52);
            color: #111;
          }
        }
      `}</style>

      <div className="mx-auto max-w-[760px] px-6 py-8">
        <div className="mb-6 flex items-center gap-2.5 print:hidden">
          <Link href={`/leagues/${slug}/settings`} className="btn2">
            ← Settings
          </Link>
          <span className="flex-1" />
          <CopyButton text={asText} toast="Scoring rules copied as text" />
          <PrintButton />
        </div>

        <header className="mb-5">
          <div className="eyebrow">FP Fantasy League · Scoring</div>
          <h1 className="display mt-1.5 text-[44px]">{league.name}</h1>
          <div className="label mt-2.5">
            {presetLabel(rules)} · Season {league.season} · {league.numTeams} teams
          </div>
        </header>

        <div className="gap-4 md:columns-2">
          {sections.map((s) => (
            <div key={s.title} className="panel mb-4 break-inside-avoid">
              <div className="ptitle !py-2.5">
                <span className="t !text-[15px]">{s.title}</span>
                {s.positions && <span className="m">{s.positions}</span>}
              </div>
              <table className="tbl">
                <tbody>
                  {s.rows.map((r, i) => (
                    <tr key={`${r.label}-${i}`}>
                      <td className="dim">
                        {r.label}
                        {r.positions && (
                          <span className="ml-2 inline-flex gap-1 align-[1px]">
                            {r.positions.map((p) => (
                              <span key={p} className={`pos ${p} !min-w-0 !px-1 !text-[9px]`}>
                                {p}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="r num whitespace-nowrap">{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <p className="note mt-1">
          Scored from post-game charting — results post Tuesday 6:00 AM ET, final Thursday
          noon. Advanced stats count only for the tagged positions.
        </p>
      </div>
      <ToastHost />
    </div>
  );
}
