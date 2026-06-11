import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness probe for Fly's health check. Returns 200 without touching the DB
 *  so a slow query can't pull the machine out of rotation. */
export function GET() {
  return NextResponse.json({ ok: true });
}
