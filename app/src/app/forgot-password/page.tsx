"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type AuthFormState } from "@/lib/auth/actions";

const initialState: AuthFormState = { error: null };

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(
    async (prev: AuthFormState & { sent?: boolean }, fd: FormData) => {
      const r = await requestPasswordReset(prev, fd);
      return { ...r, sent: r.error === null };
    },
    initialState as AuthFormState & { sent?: boolean },
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6">
      <h1 className="display text-4xl">Reset password</h1>
      {state.sent ? (
        <p className="max-w-sm text-center text-muted">
          If that email has an account, a reset link is on its way. It expires in one hour.
        </p>
      ) : (
        <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-paper focus:outline-none"
            />
          </label>
          {state.error && <p className="text-sm text-flame">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="btn-flame rounded-md px-4 py-2 disabled:opacity-50"
          >
            {pending ? "…" : "Send reset link"}
          </button>
          <p className="text-sm text-muted">
            <Link href="/login" className="underline">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </main>
  );
}
