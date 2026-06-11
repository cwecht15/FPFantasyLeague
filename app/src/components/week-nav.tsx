import Link from "next/link";

/** Week selector strip 1..18 linking to ?week=N on the given base path. */
export function WeekNav({ base, week }: { base: string; week: number }) {
  return (
    <div className="flex flex-wrap gap-1 text-xs">
      {Array.from({ length: 18 }, (_, i) => i + 1).map((w) => (
        <Link
          key={w}
          href={`${base}?week=${w}`}
          className={`rounded px-2 py-1 ${
            w === week
              ? "bg-paper font-semibold text-ink"
              : "border border-line text-muted hover:bg-surface"
          }`}
        >
          {w}
        </Link>
      ))}
    </div>
  );
}
