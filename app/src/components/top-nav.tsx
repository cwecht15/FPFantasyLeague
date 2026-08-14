"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth/actions";

export function TopNav({
  homeHref,
  userLabel,
  isAdmin,
  unread,
}: {
  homeHref: string;
  userLabel: string;
  isAdmin: boolean;
  unread: number;
}) {
  const pathname = usePathname();
  const lk = (href: string) =>
    `lk ${pathname === href || pathname.startsWith(href + "/") ? "on" : ""}`;

  return (
    <div>
      <div className="wrap">
        <nav className="topnav">
          <Link href={homeHref} className="shrink-0">
            <Image
              src="/brand/Wordmark-Primary.svg"
              alt="Fantasy Points"
              width={131}
              height={24}
              style={{ height: 24, width: "auto" }}
              priority
            />
          </Link>
          <div className="right">
            <Link href="/alerts" className={lk("/alerts")}>
              Alerts
              {unread > 0 && <span className="badge">{unread}</span>}
            </Link>
            {isAdmin && (
              <Link href="/admin/scoring-lab" className={lk("/admin/scoring-lab")}>
                Scoring Lab
              </Link>
            )}
            {isAdmin && (
              <Link href="/admin/leagues" className={lk("/admin/leagues")}>
                Manage Leagues
              </Link>
            )}
            <span className="who">
              {userLabel}
              {isAdmin ? " · admin" : ""}
            </span>
            <form action={logout}>
              <button type="submit" className="btn2">
                SIGN OUT
              </button>
            </form>
          </div>
        </nav>
      </div>
      <div className="red-rule" />
    </div>
  );
}
