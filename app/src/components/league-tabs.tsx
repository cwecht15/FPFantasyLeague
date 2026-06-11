"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "Home" },
  { href: "/lineup", label: "Lineup" },
  { href: "/roster", label: "Roster" },
  { href: "/players", label: "Players" },
  { href: "/matchups", label: "Matchups" },
  { href: "/standings", label: "Standings" },
  { href: "/trades", label: "Trades" },
  { href: "/transactions", label: "Transactions" },
  { href: "/draft", label: "Draft" },
  { href: "/settings", label: "Settings" },
];

export function LeagueTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/leagues/${slug}`;

  return (
    <div className="tabs">
      {TABS.map((t) => {
        const href = `${base}${t.href}`;
        const on = t.href === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link key={t.label} href={href} className={on ? "on" : ""}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
