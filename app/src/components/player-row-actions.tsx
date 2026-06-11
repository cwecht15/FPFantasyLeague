"use client";

import { useActionState, useEffect } from "react";
import {
  addPlayerAction,
  dropPlayerAction,
  type TxFormState,
} from "@/lib/transactions/actions";
import { fireToast } from "@/components/toast";

type RowState = TxFormState & { done?: boolean };
const initialState: RowState = { error: null };

function RowForm({
  action,
  slug,
  gsisId,
  label,
  primary,
  toast,
}: {
  action: (prev: TxFormState, fd: FormData) => Promise<TxFormState>;
  slug: string;
  gsisId: string;
  label: string;
  primary?: boolean;
  toast: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: RowState, fd: FormData): Promise<RowState> => {
      const r = await action(prev, fd);
      return { ...r, done: r.error === null };
    },
    initialState,
  );

  useEffect(() => {
    if (state.done) fireToast(toast);
  }, [state, toast]);

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="gsisId" value={gsisId} />
      <button type="submit" disabled={pending} className={`btn2 ${primary ? "pri" : ""}`}>
        {pending ? "…" : label}
      </button>
      {state.error && <span className="text-xs text-flame">{state.error}</span>}
    </form>
  );
}

export function AddButton({ slug, gsisId }: { slug: string; gsisId: string }) {
  return (
    <RowForm
      action={addPlayerAction}
      slug={slug}
      gsisId={gsisId}
      label="Add"
      primary
      toast="Request submitted"
    />
  );
}

export function DropButton({ slug, gsisId }: { slug: string; gsisId: string }) {
  return (
    <RowForm
      action={dropPlayerAction}
      slug={slug}
      gsisId={gsisId}
      label="Drop"
      toast="Player dropped"
    />
  );
}
