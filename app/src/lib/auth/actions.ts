"use server";

/**
 * Auth server actions: signup (create user + sign in), login, logout.
 * Forms call these via useActionState; errors return as plain strings so the
 * form can render them (redirects throw, per Next.js convention).
 */

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { and, eq, gt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { leagues, users, verificationTokens } from "@/lib/db/schema";
import { signIn, signOut } from "@/lib/auth";
import { rateLimit } from "@/lib/auth/rate-limit";
import { SITE_NAME_BARE } from "@/lib/brand";

export interface AuthFormState {
  error: string | null;
}

const signupSchema = z.object({
  displayName: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function signup(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { displayName, email, password } = parsed.data;

  if (!rateLimit(`signup:${email.toLowerCase()}`, 3, 60 * 60 * 1000)) {
    return { error: "Too many attempts — try again later" };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);
  if (existing) {
    return { error: "An account with that email already exists. Sign in instead." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(users).values({
    email,
    name: displayName,
    displayName,
    passwordHash,
  });

  // Sign the new user in; throws a redirect on success.
  return login(_prev, formData);
}

/** Only allow same-site paths as a post-login destination ("/join/abc"). */
function safeNext(formData: FormData): string {
  const next = String(formData.get("next") ?? "");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/leagues";
}

export async function login(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const emailKey = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!rateLimit(`login:${emailKey}`, 8, 15 * 60 * 1000)) {
    return { error: "Too many attempts — try again in a few minutes" };
  }
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: safeNext(formData),
    });
    return { error: null }; // unreachable — signIn redirects
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Invalid email or password" };
    }
    throw err; // NEXT_REDIRECT and friends must propagate
  }
}

// ---------------------------------------------------------------------------
// Invite-link signup: create the account AND join the league in one step
// (the /join/[code] page). Username = display name; login stays email-based.
// ---------------------------------------------------------------------------

const joinSignupSchema = signupSchema.extend({
  teamName: z.string().trim().min(2, "Team name must be at least 2 characters").max(40),
  // Codes are lowercase hex; phones auto-capitalize hand-typed ones.
  inviteCode: z.string().trim().toLowerCase().min(4).max(40),
});

export async function signupAndJoin(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = joinSignupSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    teamName: formData.get("teamName"),
    inviteCode: formData.get("inviteCode"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { displayName, email, password, teamName, inviteCode } = parsed.data;

  if (!rateLimit(`signup:${email.toLowerCase()}`, 3, 60 * 60 * 1000)) {
    return { error: "Too many attempts — try again later" };
  }

  // Validate the invite before creating the account, so a dead link doesn't
  // leave an orphaned user with no league.
  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.inviteCode, inviteCode))
    .limit(1);
  if (!league) return { error: "That invite link is no longer valid" };
  if (league.status !== "setup" && league.status !== "drafting") {
    return { error: "That league is no longer accepting new teams" };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);
  if (existing) {
    return { error: "An account with that email already exists. Sign in instead." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(users)
    .values({ email, name: displayName, displayName, passwordHash })
    .returning({ id: users.id });

  const { joinLeague } = await import("@/lib/leagues/service");
  const joined = await joinLeague({ inviteCode, teamName, userId: user.id });
  if (joined.error || !joined.league) {
    // The account was created; they can sign in normally and join elsewhere.
    return { error: joined.error ?? "Could not join the league" };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: `/leagues/${joined.league.slug}`,
    });
    return { error: null }; // unreachable — signIn redirects
  } catch (err) {
    if (err instanceof AuthError) return { error: "Invalid email or password" };
    throw err;
  }
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

// ---------------------------------------------------------------------------
// Password reset (token via verification_tokens; emailed link, 1h expiry)
// ---------------------------------------------------------------------------

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email" };
  if (!rateLimit(`reset:${email}`, 3, 60 * 60 * 1000)) {
    return { error: "Too many reset requests — try again later" };
  }

  // Same response whether or not the account exists (no enumeration).
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  if (user) {
    const token = randomBytes(32).toString("hex");
    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, email));
    await db.insert(verificationTokens).values({
      identifier: email,
      token: hashToken(token),
      expires: new Date(Date.now() + 60 * 60 * 1000),
    });
    const base = process.env.AUTH_URL ?? "http://localhost:3000";
    const link = `${base}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    const { notifyUser } = await import("@/lib/notifications/service");
    await notifyUser(user.id, null, {
      type: "your_turn", // reuse channel; subject line carries the meaning
      title: `Reset your ${SITE_NAME_BARE} password`,
      body: `Use this link within 1 hour: ${link}`,
    });
  }

  return { error: null };
}

export async function resetPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8 || password.length > 200) {
    return { error: "Password must be at least 8 characters" };
  }
  if (!rateLimit(`reset-confirm:${email}`, 5, 15 * 60 * 1000)) {
    return { error: "Too many attempts — try again later" };
  }

  const [row] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, email),
        eq(verificationTokens.token, hashToken(token)),
        gt(verificationTokens.expires, new Date()),
      ),
    )
    .limit(1);
  if (!row) return { error: "That reset link is invalid or expired — request a new one" };

  const passwordHash = await bcrypt.hash(password, 12);
  await db
    .update(users)
    .set({ passwordHash })
    .where(sql`lower(${users.email}) = ${email}`);
  await db.delete(verificationTokens).where(eq(verificationTokens.identifier, email));

  return login(_prev, formData); // signs in with the new password → redirects
}
