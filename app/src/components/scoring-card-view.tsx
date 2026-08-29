import type { CardSection } from "@/lib/scoring/rules-card";
import { SITE_NAME } from "@/lib/brand";

/**
 * The scoring card itself — header, grouped rule panels, footer note — shared
 * by the standalone /leagues/[slug]/scoring-card page and the Scoring Lab
 * overlay. Pure presentational (renders on server or client). The embedded
 * print stylesheet flips the `.print-card` subtree to a light palette since
 * browsers skip background graphics by default.
 */
export function ScoringCardView({
  title,
  meta,
  sections,
}: {
  title: string;
  meta: string;
  sections: CardSection[];
}) {
  return (
    <div className="print-card">
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

      <header className="mb-5">
        <div className="eyebrow">{SITE_NAME} · Scoring</div>
        <h1 className="display mt-1.5 text-[44px]">{title}</h1>
        <div className="label mt-2.5">{meta}</div>
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
  );
}
