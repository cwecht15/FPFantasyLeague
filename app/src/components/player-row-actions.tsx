"use client";

import { useActionState } from "react";
import {
  addPlayerAction,
  dropPlayerAction,
  type TxFormState,
} from "@/lib/transactions/actions";

const initialState: TxFormState = { error: null };

export function AddButton({ slug, gsisId }: { slug: string; gsisId: string }) {
  const [state, formAction, pending] = useActionState(addPlayerAction, initialState);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="gsisId" value={gsisId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line-strong px-2 py-0.5 text-xs text-paper hover:bg-surface disabled:opacity-50"
      >
        {pending ? "…" : "Add"}
      </button>
      {state.error && <span className="text-xs text-flame">{state.error}</span>}
    </form>
  );
}

export function DropButton({ slug, gsisId }: { slug: string; gsisId: string }) {
  const [state, formAction, pending] = useActionState(dropPlayerAction, initialState);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="gsisId" value={gsisId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-flame/60 px-2 py-0.5 text-xs text-flame hover:bg-flame/10 disabled:opacity-50"
      >
        {pending ? "…" : "Drop"}
      </button>
      {state.error && <span className="text-xs text-flame">{state.error}</span>}
    </form>
  );
}
