/**
 * Seed/promote a site-admin account. Leagues are administered centrally, so at
 * least one admin must exist before any league can be created.
 *
 *   npm run db:seed -- <email> [password] [display name]
 *
 * If the user exists they are promoted to site admin (password unchanged
 * unless one is supplied); otherwise the account is created.
 */

import "./load-env";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";

async function main() {
  const [email, password, displayName] = process.argv.slice(2);
  if (!email) {
    console.error("usage: npm run db:seed -- <email> [password] [display name]");
    process.exit(1);
  }

  const { db } = await import("./index");
  const { users } = await import("./schema");

  const [existing] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        isSiteAdmin: true,
        ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
        ...(displayName ? { displayName } : {}),
      })
      .where(sql`${users.id} = ${existing.id}`);
    console.log(`[seed] promoted ${email} to site admin${password ? " (password set)" : ""}`);
  } else {
    if (!password) {
      console.error("[seed] user does not exist yet — supply a password to create them");
      process.exit(1);
    }
    await db.insert(users).values({
      email,
      name: displayName ?? email.split("@")[0],
      displayName: displayName ?? email.split("@")[0],
      passwordHash: await bcrypt.hash(password, 12),
      isSiteAdmin: true,
    });
    console.log(`[seed] created site admin ${email}`);
  }
  process.exit(0);
}

void main();
