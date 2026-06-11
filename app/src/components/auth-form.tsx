"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { AuthFormState } from "@/lib/auth/actions";

const initialState: AuthFormState = { error: null };

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction}>
      {mode === "signup" && (
        <div className="field">
          <label>Display name</label>
          <input name="displayName" required minLength={2} maxLength={60} className="input" />
        </div>
      )}
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
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className="input"
        />
      </div>
      {state.error && <p className="mb-3 text-sm text-flame">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="btn pri w-full"
        style={{ width: "100%" }}
      >
        <span>{pending ? "…" : mode === "login" ? "Sign in" : "Create account"}</span>
      </button>
      <p className="mt-4 text-center text-[13px] text-muted">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/signup" className="linkish">
              Create an account
            </Link>
            {" · "}
            <Link href="/forgot-password" className="linkish">
              Forgot password?
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="linkish">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
