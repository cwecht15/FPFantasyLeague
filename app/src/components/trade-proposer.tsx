"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { proposeTradeAction, type TradeFormState } from "@/lib/trades/actions";
import { fireToast } from "@/components/toast";

export interface TradePlayer {
  gsisId: string;
  name: string;
  position: string;
}

type State = TradeFormState & { done?: boolean };
const initialState: State = { error: null };

/** Game Day propose-a-trade panel: team select in the title bar, two pill
 *  columns (YOU SEND / YOU RECEIVE), submit enabled once both sides pick. */
export function TradeProposer({
  slug,
  myRoster,
  otherTeams,
}: {
  slug: string;
  myRoster: TradePlayer[];
  otherTeams: { id: number; name: string; roster: TradePlayer[] }[];
}) {
  const [teamId, setTeamId] = useState(otherTeams[0]?.id ?? 0);
  const [give, setGive] = useState<Set<string>>(new Set());
  const [get, setGet] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState(
    async (prev: State, fd: FormData): Promise<State> => {
      const r = await proposeTradeAction(prev, fd);
      return { ...r, done: r.error === null };
    },
    initialState,
  );

  useEffect(() => {
    if (state.done) {
      fireToast("Trade proposed");
      setGive(new Set());
      setGet(new Set());
    }
  }, [state]);

  const team = useMemo(() => otherTeams.find((t) => t.id === teamId), [otherTeams, teamId]);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  const pillCol = (
    title: string,
    list: TradePlayer[],
    selected: Set<string>,
    setter: (s: Set<string>) => void,
  ) => (
    <div className="flex-1 px-[22px] py-4">
      <div className="label mb-2.5">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {list.map((p) => (
          <button
            key={p.gsisId}
            type="button"
            className={`pill ${selected.has(p.gsisId) ? "on" : ""}`}
            onClick={() => toggle(selected, setter, p.gsisId)}
          >
            {p.name} · {p.position}
          </button>
        ))}
        {list.length === 0 && <span className="note">No players.</span>}
      </div>
    </div>
  );

  if (otherTeams.length === 0) return null;

  return (
    <form action={formAction} className="panel">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="receivingTeamId" value={teamId} />
      {[...give].map((g) => (
        <input key={g} type="hidden" name="give" value={g} />
      ))}
      {[...get].map((g) => (
        <input key={g} type="hidden" name="get" value={g} />
      ))}

      <div className="ptitle">
        <span className="t">Propose a trade</span>
        <select
          className="input"
          style={{ padding: "5px 10px", fontSize: 13 }}
          value={teamId}
          onChange={(e) => {
            setTeamId(Number(e.target.value));
            setGet(new Set());
          }}
        >
          {otherTeams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col divide-y divide-line md:flex-row md:divide-x md:divide-y-0">
        {pillCol("You send", myRoster, give, setGive)}
        {pillCol(`You receive — ${team?.name ?? ""}`, team?.roster ?? [], get, setGet)}
      </div>

      <div className="flex items-center gap-3 border-t border-line px-[22px] py-3.5">
        <button
          type="submit"
          className="btn pri"
          disabled={pending || give.size === 0 || get.size === 0}
        >
          <span>{pending ? "Proposing…" : "Propose trade"}</span>
        </button>
        {state.error && <span className="text-sm text-flame">{state.error}</span>}
        <span className="note">
          The other manager accepts, then a site admin approves before rosters change.
        </span>
      </div>
    </form>
  );
}
