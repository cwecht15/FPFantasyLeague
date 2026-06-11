"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import {
  makePickAction,
  queueAddAction,
  queueRemoveAction,
  type DraftFormState,
} from "@/lib/draft/actions";

const initialState: DraftFormState = { error: null };

/** Re-fetch the RSC payload every `seconds` while mounted (async draft polling). */
export function PollRefresher({ seconds = 12 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

export function PickButton({
  slug,
  gsisId,
  canPick,
}: {
  slug: string;
  gsisId: string;
  canPick: boolean;
}) {
  const [state, formAction, pending] = useActionState(makePickAction, initialState);
  return (
    <span className="inline-flex items-center gap-2">
      {canPick && (
        <form action={formAction}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="gsisId" value={gsisId} />
          <button
            type="submit"
            disabled={pending}
            className="rounded btn-flame px-2 py-0.5 text-xs disabled:opacity-50"
          >
            {pending ? "…" : "Draft"}
          </button>
        </form>
      )}
      <QueueAdd slug={slug} gsisId={gsisId} />
      {state.error && <span className="text-xs text-flame">{state.error}</span>}
    </span>
  );
}

function QueueAdd({ slug, gsisId }: { slug: string; gsisId: string }) {
  const [state, formAction, pending] = useActionState(queueAddAction, initialState);
  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="gsisId" value={gsisId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line-strong px-2 py-0.5 text-xs text-paper/80 hover:bg-surface disabled:opacity-50"
        title="Add to my autopick queue"
      >
        {pending ? "…" : "+Queue"}
      </button>
      {state.error && <span className="text-xs text-flame">{state.error}</span>}
    </form>
  );
}

export function QueueRemove({ slug, queueId }: { slug: string; queueId: number }) {
  const [, formAction, pending] = useActionState(queueRemoveAction, initialState);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="queueId" value={queueId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line px-1.5 py-0.5 text-xs text-muted hover:bg-surface"
      >
        ✕
      </button>
    </form>
  );
}

/** Live countdown to the pick deadline. */
export function Countdown({ deadline }: { deadline: string | null }) {
  if (!deadline) return null;
  return <CountdownInner deadline={deadline} />;
}

import { useState } from "react";

function CountdownInner({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return <span className="text-flame">expired — autopick imminent</span>;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return (
    <span className="font-mono">
      {h > 0 ? `${h}h ` : ""}
      {m}m {s}s
    </span>
  );
}
