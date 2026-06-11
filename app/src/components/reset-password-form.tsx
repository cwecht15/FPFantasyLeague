"use client";

import { useActionState } from "react";
import { resetPassword, type AuthFormState } from "@/lib/auth/actions";

const initialState: AuthFormState = { error: null };

export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="email" value={email} />
      <div className="field">
        <label>New password</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="input"
        />
      </div>
      {state.error && <p className="mb-3 text-sm text-flame">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn pri" style={{ width: "100%" }}>
        <span>{pending ? "…" : "Set password & sign in"}</span>
      </button>
    </form>
  );
}
