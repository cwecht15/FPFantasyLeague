"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthFormState } from "@/lib/auth/actions";

const initialState: AuthFormState = { error: null };

const inputClass =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm " +
  "placeholder:text-faint focus:border-paper focus:outline-none";

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      {mode === "signup" && (
        <label className="flex flex-col gap-1 text-sm">
          Display name
          <input name="displayName" required minLength={2} maxLength={60} className={inputClass} />
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input name="email" type="email" required autoComplete="email" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className={inputClass}
        />
      </label>
      {state.error && <p className="text-sm text-flame">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md btn-flame px-4 py-2 disabled:opacity-50"
      >
        {pending ? "…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
      <p className="text-sm text-muted">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/signup" className="underline">
              Create an account
            </Link>
            {" · "}
            <Link href="/forgot-password" className="underline">
              Forgot password?
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
