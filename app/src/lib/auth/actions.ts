"use server";

/**
 * Auth server actions: signup (create user + sign in), login, logout.
 * Forms call these via useActionState; errors return as plain strings so the
 * form can render them (redirects throw, per Next.js convention).
 */

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { signIn, signOut } from "@/lib/auth";

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
