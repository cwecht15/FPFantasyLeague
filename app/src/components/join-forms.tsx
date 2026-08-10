"use client";

/**
 * Invite-link join forms for /join/[code].
 *  - JoinSignupForm: new manager — username + email + password + team name,
 *    creates the account and joins the league in one submit.
 *  - JoinTeamForm: already signed in — just picks a team name.
 */

import { useActionState } from "react";
import Link from "next/link";
import { signupAndJoin, type AuthFormState } from "@/lib/auth/actions";
import { joinLeagueAction, type FormState } from "@/lib/leagues/actions";

const initialAuth: AuthFormState = { error: null };
const initialJoin: FormState = { error: null };

export function JoinSignupForm({ inviteCode }: { inviteCode: string }) {
  const [state, formAction, pending] = useActionState(signupAndJoin, initialAuth);

  return (
    <form action={formAction}>
      <input type="hidden" name="inviteCode" value={inviteCode} />
      <div className="field">
        <label>Username</label>
        <input name="displayName" required minLength={2} maxLength={60} className="input" />
      </div>
      <div className="field">
        <label>Email</label>
        <input name="email" type="email" required autoComplete="email" className="input" />
      </div>
      <div className="field">
        <label>Password</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="input"
        />
      </div>
      <div className="field">
        <label>Team name</label>
        <input name="teamName" required minLength={2} maxLength={40} className="input" />
      </div>
      {state.error && <p className="mb-3 text-sm text-flame">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn pri w-full" style={{ width: "100%" }}>
        <span>{pending ? "…" : "Create account & join"}</span>
      </button>
      <p className="mt-4 text-center text-[13px] text-muted">
        Already have an account?{" "}
        <Link href={`/login?next=${encodeURIComponent(`/join/${inviteCode}`)}`} className="linkish">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function JoinTeamForm({ inviteCode }: { inviteCode: string }) {
  const [state, formAction, pending] = useActionState(joinLeagueAction, initialJoin);

  return (
    <form action={formAction}>
      <input type="hidden" name="inviteCode" value={inviteCode} />
      <div className="field">
        <label>Your team name</label>
        <input name="teamName" required minLength={2} maxLength={40} className="input" />
      </div>
      {state.error && <p className="mb-3 text-sm text-flame">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn pri w-full" style={{ width: "100%" }}>
        <span>{pending ? "…" : "Join league"}</span>
      </button>
    </form>
  );
}
