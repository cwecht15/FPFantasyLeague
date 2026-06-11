/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Providers: email/password (bcryptjs against users.password_hash) and Google
 * (auto-enabled when AUTH_GOOGLE_ID/SECRET are set). The Drizzle adapter
 * persists users/accounts; sessions are JWT because the credentials provider
 * does not support database sessions. The JWT carries the user id + site-admin
 * flag so RSC pages can authorize without a DB round-trip.
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";

const providers = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      allowDangerousEmailAccountLinking: true, // same verified email = same person
    }),
  );
}

providers.push(
  Credentials({
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = typeof credentials?.email === "string" ? credentials.email.trim() : "";
      const password = typeof credentials?.password === "string" ? credentials.password : "";
      if (!email || !password) return null;

      const [user] = await db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
        .limit(1);
      if (!user?.passwordHash) return null; // unknown email or OAuth-only account

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.displayName ?? user.name,
        image: user.image,
      };
    },
  }),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
        const [row] = await db
          .select({ isSiteAdmin: users.isSiteAdmin })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);
        token.isSiteAdmin = row?.isSiteAdmin ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
        session.user.isSiteAdmin = (token.isSiteAdmin as boolean) ?? false;
      }
      return session;
    },
  },
});

/** RSC/server-action guard: return the session user or throw (caller redirects). */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("UNAUTHENTICATED");
  }
  return session.user;
}
