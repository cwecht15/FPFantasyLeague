"use client";

import { useActionState, useEffect, useState } from "react";
import {
  addPlayerAction,
  cancelClaimAction,
  dropPlayerAction,
  type TxFormState,
} from "@/lib/transactions/actions";
import { fireToast } from "@/components/toast";

type RowState = TxFormState & { done?: boolean };
const initialState: RowState = { error: null };

/** A player on my roster, offered as the drop half of an add. */
export interface DropOption {
  gsisId: string;
  name: string;
  position: string;
  locked: boolean;
}

function useRowAction(action: (prev: TxFormState, fd: FormData) => Promise<TxFormState>) {
  const [state, formAction, pending] = useActionState(
    async (prev: RowState, fd: FormData): Promise<RowState> => {
      const r = await action(prev, fd);
      return { ...r, done: r.error === null };
    },
    initialState,
  );
  useEffect(() => {
    if (state.done) fireToast(state.notice ?? "Done");
  }, [state]);
  return { state, formAction, pending };
}

function DropSelect({
  myRoster,
  rosterFull,
}: {
  myRoster: DropOption[];
  rosterFull: boolean;
}) {
  return (
    <select
      name="dropGsisId"
      defaultValue=""
      required={rosterFull}
      className="input"
      style={{ padding: "4px 8px", fontSize: 12.5, maxWidth: 190 }}
      aria-label="Player to drop"
    >
      <option value="">{rosterFull ? "— pick a player to drop —" : "No drop"}</option>
      {myRoster.map((p) => (
        <option key={p.gsisId} value={p.gsisId} disabled={p.locked}>
          Drop {p.name} ({p.position}
          {p.locked ? " — locked" : ""})
        </option>
      ))}
    </select>
  );
}

/** Add flow: the button expands into a drop picker + confirm, so a full
 *  roster can swap in one transaction instead of erroring. */
export function AddButton({
  slug,
  gsisId,
  myRoster,
  rosterFull,
}: {
  slug: string;
  gsisId: string;
  myRoster: DropOption[];
  rosterFull: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { state, formAction, pending } = useRowAction(addPlayerAction);

  if (!open) {
    return (
      <button type="button" className="btn2 pri" onClick={() => setOpen(true)}>
        Add
      </button>
    );
  }
  return (
    <form action={formAction} className="inline-flex flex-wrap items-center justify-end gap-1.5">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="gsisId" value={gsisId} />
      <DropSelect myRoster={myRoster} rosterFull={rosterFull} />
      <button type="submit" disabled={pending} className="btn2 pri">
        {pending ? "…" : "Add"}
      </button>
      <button type="button" className="btn2" onClick={() => setOpen(false)} aria-label="Cancel add">
        ✕
      </button>
      {state.error && <span className="text-xs text-flame">{state.error}</span>}
    </form>
  );
}

/** Locked free agent: blind FAAB bid (+ optional drop), processed at the
 *  waiver boundary. */
export function BidButton({
  slug,
  gsisId,
  maxBid,
  currentBid,
  myRoster,
  rosterFull,
}: {
  slug: string;
  gsisId: string;
  maxBid: number;
  currentBid?: number | null;
  myRoster: DropOption[];
  rosterFull: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { state, formAction, pending } = useRowAction(addPlayerAction);

  if (!open) {
    return (
      <button type="button" className="btn2 pri" onClick={() => setOpen(true)}>
        {currentBid != null ? `Bid $${currentBid} · edit` : "Bid"}
      </button>
    );
  }
  return (
    <form action={formAction} className="inline-flex flex-wrap items-center justify-end gap-1.5">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="gsisId" value={gsisId} />
      <span className="num text-[12px] text-faint">$</span>
      <input
        name="bid"
        type="number"
        min={0}
        max={maxBid}
        defaultValue={currentBid ?? 0}
        className="input num"
        style={{ width: 64, padding: "4px 8px", fontSize: 13 }}
        aria-label="FAAB bid"
      />
      <DropSelect myRoster={myRoster} rosterFull={rosterFull} />
      <button type="submit" disabled={pending} className="btn2 pri">
        {pending ? "…" : currentBid != null ? "Update bid" : "Place bid"}
      </button>
      <button type="button" className="btn2" onClick={() => setOpen(false)} aria-label="Cancel bid">
        ✕
      </button>
      {state.error && <span className="text-xs text-flame">{state.error}</span>}
    </form>
  );
}

export function DropButton({ slug, gsisId }: { slug: string; gsisId: string }) {
  const { state, formAction, pending } = useRowAction(dropPlayerAction);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="gsisId" value={gsisId} />
      <button type="submit" disabled={pending} className="btn2">
        {pending ? "…" : "Drop"}
      </button>
      {state.error && <span className="text-xs text-flame">{state.error}</span>}
    </form>
  );
}

export function CancelClaimButton({ slug, claimId }: { slug: string; claimId: number }) {
  const { state, formAction, pending } = useRowAction(cancelClaimAction);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="claimId" value={claimId} />
      <button type="submit" disabled={pending} className="btn2">
        {pending ? "…" : "Cancel"}
      </button>
      {state.error && <span className="text-xs text-flame">{state.error}</span>}
    </form>
  );
}
