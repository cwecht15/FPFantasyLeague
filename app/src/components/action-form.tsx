"use client";

/**
 * Generic wrapper for server-action forms that return { error }. Renders its
 * children inside a <form>, shows the returned error, and disables the submit
 * button while pending. Children are plain inputs (server-rendered markup ok).
 */

import { useActionState } from "react";
import type { FormState } from "@/lib/leagues/actions";

const initialState: FormState = { error: null };

export function ActionForm({
  action,
  submitLabel,
  children,
  className,
  successMessage,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children: React.ReactNode;
  className?: string;
  successMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: FormState & { done?: boolean }, formData: FormData) => {
      const result = await action(prev, formData);
      return { ...result, done: result.error === null };
    },
    initialState as FormState & { done?: boolean },
  );

  return (
    <form action={formAction} className={className ?? "flex flex-col gap-3"}>
      {children}
      {state.error && <p className="text-sm text-flame">{state.error}</p>}
      {!state.error && state.done && successMessage && (
        <p className="text-sm text-paper/80">{successMessage}</p>
      )}
      <button type="submit" disabled={pending} className="btn pri self-start">
        <span>{pending ? "…" : submitLabel}</span>
      </button>
    </form>
  );
}
