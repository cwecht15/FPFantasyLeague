import Image from "next/image";
import Link from "next/link";

const TICKER =
  "FP FANTASY LEAGUE · CHARTING-SCORED · ASYNC DRAFTS · WEEKS 15–17 CHAMPIONSHIP SPRINT · ";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <div className="smoke flex flex-1 flex-col">
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
          <Image
            src="/brand/Wordmark-Primary.svg"
            alt="Fantasy Points"
            width={196}
            height={36}
            priority
          />
          <Link
            href="/login"
            className="btn-ghost rounded-md px-4 py-2 text-sm font-bold"
          >
            Sign in
          </Link>
        </header>

        <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 pb-24 pt-12">
          <p className="label">Fantasy football, charted</p>
          <h1 className="display mt-4 text-6xl sm:text-8xl">
            Every yard
            <br />
            <span className="text-flame">earns</span> its point
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">
            Leagues scored from post-game NFL charting data — accurate throws, hero
            catches, missed tackles forced. Draft async on your schedule, set your
            lineup, and play for the title.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/signup"
              className="btn-flame rounded-md px-7 py-3 text-sm uppercase tracking-wide"
            >
              Create account
            </Link>
            <Link href="/login" className="btn-ghost rounded-md px-7 py-3 text-sm font-bold">
              Sign in
            </Link>
          </div>
        </section>
      </div>

      <div className="ticker" aria-hidden>
        <div className="ticker-track">
          {TICKER.repeat(4)}
          {TICKER.repeat(4)}
        </div>
      </div>

      <section className="mx-auto grid w-full max-w-5xl gap-px bg-line px-0 sm:grid-cols-3">
        {[
          {
            k: "01",
            title: "Draft async",
            body: "Slow snake drafts with an 8-hour clock, pick queues, and autopick that respects your board.",
          },
          {
            k: "02",
            title: "Charting-scored",
            body: "Points from FantasyPoints charting — turnover-worthy throws, drops, air yards, YAC, MTF.",
          },
          {
            k: "03",
            title: "Playoff push",
            body: "Top six by wins make the bracket — points for breaks ties. Weeks 15–17 decide the champion.",
          },
        ].map((f) => (
          <div key={f.k} className="bg-ink p-8">
            <div className="label text-flame">{f.k}</div>
            <h3 className="display mt-2 text-2xl">{f.title}</h3>
            <p className="mt-3 text-sm text-muted">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-auto border-t border-line">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
          <Image src="/brand/Lettermark-Primary.svg" alt="FPTS" width={54} height={40} />
          <span className="label">FP Fantasy League · {new Date().getFullYear()}</span>
        </div>
      </footer>
    </main>
  );
}
