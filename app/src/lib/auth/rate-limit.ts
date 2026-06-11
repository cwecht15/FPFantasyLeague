/**
 * Minimal in-memory rate limiter for auth actions (per-process; resets on
 * deploy — adequate for a single Fly machine, revisit if app scales out).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Returns true when the call is ALLOWED. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  if (buckets.size > 10_000) {
    // sweep expired buckets so the map can't grow unbounded
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  return bucket.count <= max;
}
