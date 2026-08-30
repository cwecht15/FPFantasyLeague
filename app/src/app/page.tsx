import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SITE_NAME } from "@/lib/brand";

const FEATURES = [
  {
    k: "01",
    title: "Draft at your pace",
    body: "Slow snake draft with no pick clock — pick when you're ready, queue your board, and the room updates for everyone.",
  },
  {
    k: "02",
    title: "Charting-scored",
    body: "Points from FantasyPoints charting — turnover-worthy throws, drops, air yards, YAC, MTF.",
  },
  {
    k: "03",
    title: "Draft the coaches",
    body: "Every NFL coaching staff is a draftable COACH slot, scored on play-action, motion, wins and 30-point games.",
  },
  {
    k: "04",
    title: "Playoff push",
    body: "Top six by wins make the bracket — points for breaks ties. Weeks 15–17 decide the champion.",
  },
];

export default async function Home() {
  // Signed-in managers skip the pitch: /leagues routes to their league (or the
  // join screen / admin list) so this page never asks them to create an account.
  const session = await auth();
  if (session?.user) redirect("/leagues");

  return (
    <main className="flex min-h-screen flex-col">
      <div className="smoke flex flex-1 flex-col">
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
          <Image
            src="/brand/Wordmark-Primary.svg"
            alt={SITE_NAME}
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
          <p className="label">{SITE_NAME}</p>
          <h1 className="display mt-4 text-6xl sm:text-8xl">
            Every yard
            <br />
            <span className="text-flame">earns</span> its point
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">
            Scored from post-game NFL charting data — accurate throws, hero catches,
            missed tackles forced. Slow-draft at your own pace, set your lineup, and
            results post Tuesday morning.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/signup"
              className="btn-flame rounded-md px-7 py-3 text-sm uppercase tracking-wide"
            >
              Join with your invite
            </Link>
            <Link href="/login" className="btn-ghost rounded-md px-7 py-3 text-sm font-bold">
              Sign in
            </Link>
          </div>
        </section>
      </div>

      <section className="mx-auto grid w-full max-w-5xl gap-px bg-line px-0 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.k} className="bg-ink p-8">
            <div className="label text-flame">{f.k}</div>
            <h3 className="display mt-2 text-2xl">{f.title}</h3>
            <p className="mt-3 text-sm text-muted">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-auto border-t border-line">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-6">
          <span className="flex items-center gap-3">
            <Image src="/brand/Lettermark-Primary.svg" alt="FantasyPoints" width={54} height={40} />
            <span className="label">Charting by FantasyPoints</span>
          </span>
          <span className="label text-right">
            {SITE_NAME} · {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </main>
  );
}
