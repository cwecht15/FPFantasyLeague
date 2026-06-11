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
import { users, verificationTokens } from "@/lib/db/schema";
import { signIn, signOut } from "@/lib/auth";
import { rateLimit } from "@/lib/auth/rate-limit";

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
      redirectTo: "/leagues",
    });
    return { error: null }; // unreachable — signIn redirects
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Invalid email or password" };
    }
    throw err; // NEXT_REDIRECT and friends must propagate
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
      title: "Reset your FP Fantasy League password",
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
