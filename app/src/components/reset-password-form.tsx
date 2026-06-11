"use client";

import { useActionState } from "react";
import { resetPassword, type AuthFormState } from "@/lib/auth/actions";

const initialState: AuthFormState = { error: null };

export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const [state, formAction, pending] = useActionState(resetPassword, initialState);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="email" value={email} />
      <label className="flex flex-col gap-1 text-sm">
        New password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-paper focus:outline-none"
        />
      </label>
      {state.error && <p className="text-sm text-flame">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="btn-flame rounded-md px-4 py-2 disabled:opacity-50"
      >
        {pending ? "…" : "Set password & sign in"}
      </button>
    </form>
  );
}
