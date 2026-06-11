"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import {
  makePickAction,
  queueAddAction,
  queueRemoveAction,
  type DraftFormState,
} from "@/lib/draft/actions";
import { fireToast } from "@/components/toast";

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
  const [state, formAction, pending] = useActionState(
    async (prev: DraftFormState, fd: FormData) => {
      const r = await makePickAction(prev, fd);
      if (r.error === null) fireToast("Pick made");
      return r;
    },
    initialState,
  );
  return (
    <span className="inline-flex items-center gap-2">
      {canPick && (
        <form action={formAction}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="gsisId" value={gsisId} />
          <button type="submit" disabled={pending} className="btn2 pri">
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
      <button type="submit" disabled={pending} className="btn2" title="Add to my autopick queue">
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
      <button type="submit" disabled={pending} className="btn2" style={{ padding: "2px 8px" }}>
        ✕
      </button>
    </form>
  );
}

/** Big mono countdown to autopick — flame when under 10 minutes. */
export function Countdown({ deadline }: { deadline: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!deadline) return null;

  const ms = new Date(deadline).getTime() - now;
  const urgent = ms < 10 * 60 * 1000;
  let text: string;
  if (ms <= 0) {
    text = "0:00";
  } else {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    text =
      h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        : `${m}:${String(s).padStart(2, "0")}`;
  }

  return (
    <div className="text-right">
      <div className={`font-mono text-[26px] font-bold ${urgent ? "text-flame" : ""}`}>{text}</div>
      <div className="label">To autopick</div>
    </div>
  );
}
