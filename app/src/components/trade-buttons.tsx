"use client";

import { useActionState } from "react";
import {
  respondTradeAction,
  resolveTradeAction,
  type TradeFormState,
} from "@/lib/trades/actions";

const initialState: TradeFormState = { error: null };

function SmallForm({
  action,
  fields,
  label,
  tone,
}: {
  action: (prev: TradeFormState, fd: FormData) => Promise<TradeFormState>;
  fields: Record<string, string>;
  label: string;
  tone: "flame" | "ghost";
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        disabled={pending}
        className={
          tone === "flame"
            ? "btn-flame rounded px-3 py-1 text-xs uppercase tracking-wide disabled:opacity-50"
            : "btn-ghost rounded px-3 py-1 text-xs font-bold disabled:opacity-50"
        }
      >
        {pending ? "…" : label}
      </button>
      {state.error && <span className="text-xs text-flame">{state.error}</span>}
    </form>
  );
}

export function RespondButtons({ slug, tradeId, canAccept }: { slug: string; tradeId: number; canAccept: boolean }) {
  return (
    <span className="inline-flex gap-2">
      {canAccept && (
        <SmallForm
          action={respondTradeAction}
          fields={{ slug, tradeId: String(tradeId), accept: "true" }}
          label="Accept"
          tone="flame"
        />
      )}
      <SmallForm
        action={respondTradeAction}
        fields={{ slug, tradeId: String(tradeId), accept: "false" }}
        label={canAccept ? "Reject" : "Cancel"}
        tone="ghost"
      />
    </span>
  );
}

export function ResolveButtons({ slug, tradeId }: { slug: string; tradeId: number }) {
  return (
    <span className="inline-flex gap-2">
      <SmallForm
        action={resolveTradeAction}
        fields={{ slug, tradeId: String(tradeId), approve: "true" }}
        label="Approve"
        tone="flame"
      />
      <SmallForm
        action={resolveTradeAction}
        fields={{ slug, tradeId: String(tradeId), approve: "false" }}
        label="Veto"
        tone="ghost"
      />
    </span>
  );
}
