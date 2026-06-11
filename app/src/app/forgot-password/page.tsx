"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type AuthFormState } from "@/lib/auth/actions";
import { AuthStage } from "@/components/auth-stage";

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
    <AuthStage title="Reset password">
      {state.sent ? (
        <p className="lsub">
          If that email has an account, a reset link is on its way. It expires in one hour.
        </p>
      ) : (
        <form action={formAction}>
          <div className="field">
            <label>Email</label>
            <input name="email" type="email" required autoComplete="email" className="input" />
          </div>
          {state.error && <p className="mb-3 text-sm text-flame">{state.error}</p>}
          <button type="submit" disabled={pending} className="btn pri" style={{ width: "100%" }}>
            <span>{pending ? "…" : "Send reset link"}</span>
          </button>
          <p className="mt-4 text-center text-[13px] text-muted">
            <Link href="/login" className="linkish">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthStage>
  );
}
