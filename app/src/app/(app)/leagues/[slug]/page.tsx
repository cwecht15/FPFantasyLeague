import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getLeagueForUser } from "@/lib/leagues/service";
import { getHomeData } from "@/lib/leagues/home";
import { fmt1, fmtKick, ord } from "@/lib/format";

export default async function LeagueHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const ctx = await getLeagueForUser(slug, session.user.id);
  if (!ctx) notFound();
  if (!ctx.myTeam) {
    return <p className="empty">You don&apos;t have a team in this league.</p>;
  }

  const league = ctx.league;
  const d = await getHomeData(league, ctx.myTeam);
  const base = `/leagues/${slug}`;

  // Standings preview: top 6, or top 5 + you when you're outside it.
  const top6 = d.standings.slice(0, 6);
  const rows =
    d.me && !top6.some((r) => r.teamId === d.me!.teamId)
      ? [...d.standings.slice(0, 5), d.me]
      : top6;

  return (
    <div>
      <header className="page-head">
        <div>
          <div className="eyebrow">
            {league.name} · {league.season} · {league.numTeams} teams
          </div>
          <h1 className="display">{ctx.myTeam.name}</h1>
          {d.me && (
            <div className="sub">
              <b>
                {d.me.w}–{d.me.l}
                {d.me.t > 0 ? `–${d.me.t}` : ""}
              </b>{" "}
              · {ord(d.me.rank)} place · {fmt1(d.me.pf)} points for
            </div>
          )}
        </div>
        <div className="chip">
          <span>Week {d.week}</span>
        </div>
      </header>

      <div className="mt-2 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="panel min-w-0">
          <div className="ptitle">
            <span className="t">Week {d.week} matchup</span>
            <span className="m">Results post Tue 6:00 AM ET</span>
          </div>
          {d.matchup ? (
            <>
              <div
                className="grid items-center gap-2.5 px-3 pb-3 pt-[30px] sm:gap-[18px] sm:px-[26px]"
                style={{ gridTemplateColumns: "1fr auto 1fr" }}
              >
                <div className="min-w-0 text-center">
                  <div className="display text-[17px] sm:text-[20px]">{ctx.myTeam.name}</div>
                  {d.me && (
                    <div className="mt-[5px] text-xs text-faint">
                      {d.me.w}–{d.me.l} · {ord(d.me.rank)}
                    </div>
                  )}
                  <div className="mt-3 font-mono text-3xl font-bold sm:text-[52px]">
                    {fmt1(d.matchup.myPoints)}
                  </div>
                </div>
                <div className="display text-[18px] text-faint">VS</div>
                <div className="min-w-0 text-center">
                  <div className="display text-[17px] sm:text-[20px]">{d.matchup.oppName}</div>
                  {d.matchup.oppRow && (
                    <div className="mt-[5px] text-xs text-faint">
                      {d.matchup.oppRow.w}–{d.matchup.oppRow.l} · {ord(d.matchup.oppRow.rank)}
                    </div>
                  )}
                  <div className="mt-3 font-mono text-3xl font-bold text-muted sm:text-[52px]">
                    {fmt1(d.matchup.oppPoints)}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-[26px] pb-5 pt-1.5 text-xs text-faint">
                <span>
                  Lineup:{" "}
                  <b className="text-muted">
                    {d.lineup.filled} / {d.lineup.total} set
                  </b>{" "}
                  · locks at kickoff
                </span>
                {d.lineup.firstLock && <span>First lock: {fmtKick(d.lineup.firstLock)} ET</span>}
              </div>
              <div className="flex flex-wrap justify-center gap-2.5 px-[26px] pb-6">
                <Link href={`${base}/lineup`} className="btn pri">
                  <span>Set lineup</span>
                </Link>
                <Link href={`${base}/matchups/${d.matchup.id}`} className="btn gho">
                  <span>Full matchup</span>
                </Link>
              </div>
            </>
          ) : (
            <p className="empty">
              No matchup this week{d.week === 1 ? " — schedule pending" : " (bye)"}.
            </p>
          )}
          {d.lastWeek && (
            <div
              className="mx-[26px] flex items-center gap-2.5 border-t border-line pb-[18px] pt-[13px] text-[12.5px] text-muted"
            >
              <span className={`res ${d.lastWeek.won ? "W" : "L"}`}>
                {d.lastWeek.won ? "W" : d.lastWeek.tie ? "T" : "L"}
              </span>
              <span>
                Week {d.lastWeek.week} final —{" "}
                <b className="font-mono text-paper">
                  {fmt1(d.lastWeek.myPoints)} – {fmt1(d.lastWeek.oppPoints)}
                </b>{" "}
                vs {d.lastWeek.oppName}
              </span>
            </div>
          )}
        </div>

        <div className="panel min-w-0">
          <div className="ptitle">
            <span className="t">Standings</span>
            <Link href={`${base}/standings`} className="m">
              All {league.numTeams} teams →
            </Link>
          </div>
          {rows.length === 0 ? (
            <p className="empty">Standings appear once a week is scored.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th></th>
                  <th>Team</th>
                  <th className="r">W–L</th>
                  <th className="r">PF</th>
                  <th className="r">PA</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.teamId} className={s.teamId === ctx.myTeam!.id ? "you" : "hov"}>
                    <td className="rk">{s.rank}</td>
                    <td className="tm">
                      {s.name}
                      {s.teamId === ctx.myTeam!.id && <span className="youchip">YOU</span>}
                    </td>
                    <td className="r num">
                      {s.w}–{s.l}
                    </td>
                    <td className="r num">{fmt1(s.pf)}</td>
                    <td className="r num">{fmt1(s.pa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      <div
        className="mb-11 mt-4 flex flex-wrap items-center justify-between gap-4 border border-line bg-surface px-[26px] py-[18px] sm:gap-6"
        style={{ borderLeft: "3px solid var(--color-flame)" }}
      >
        <div>
          <div className="display text-[18px]">
            Playoff race —{" "}
            {d.playoffTeams >= d.standings.length
              ? "everyone makes the bracket — seeding is the game"
              : d.me && d.me.rank > 0
                ? d.me.rank <= d.playoffTeams
                  ? "you're inside the line"
                  : "you're on the outside"
                : `top ${d.playoffTeams} qualify`}
          </div>
          <p className="m-0 mt-[5px] max-w-[760px] text-[13px] text-muted">
            {d.playoffTeams >= d.standings.length
              ? `All ${d.playoffTeams} teams seed by wins`
              : `Top ${d.playoffTeams} by wins make the playoffs`}{" "}
            — points for breaks ties. Bracket runs weeks {d.playoffStartWeek}–
            {d.playoffEndWeek}
            {d.playoffByes > 0
              ? `; the top ${d.playoffByes} ${d.playoffByes === 1 ? "seed gets" : "seeds get"} a first-round bye`
              : ""}
            .{d.me && d.me.rank > 0 ? ` You're currently ${ord(d.me.rank)}.` : ""}
          </p>
        </div>
        <Link
          href={`${base}/standings`}
          className="whitespace-nowrap pb-0.5 text-xs font-extrabold uppercase tracking-[0.1em] text-paper"
          style={{ borderBottom: "2px solid var(--color-flame)" }}
        >
          Standings →
        </Link>
      </div>
    </div>
  );
}
