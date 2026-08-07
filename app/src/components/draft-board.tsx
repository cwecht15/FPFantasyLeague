import type { ReactNode } from "react";

export interface BoardTeam {
  id: number;
  name: string;
}

export interface BoardPick {
  id: number;
  overallPick: number;
  round: number;
  teamId: number;
  gsisId: string | null;
  isAutopick: boolean;
}

export interface BoardPlayer {
  name: string;
  position: string;
  nflTeam: string | null;
}

/** Brand-styled draft board: rounds down the side, teams across the top, one
 *  card per pick. The on-clock cell burns flame; everything else stays in the
 *  ink/paper system. Server component — pure render. */
export function DraftBoard({
  teams,
  picks,
  players,
  currentPickId,
  myTeamId = null,
  compact = false,
}: {
  teams: BoardTeam[];
  picks: BoardPick[];
  players: Map<string, BoardPlayer>;
  currentPickId: number | null;
  myTeamId?: number | null;
  compact?: boolean;
}) {
  const rounds = picks.length ? Math.max(...picks.map((p) => p.round)) : 0;
  const cell = new Map<string, BoardPick>();
  for (const p of picks) cell.set(`${p.round}:${p.teamId}`, p);

  const pad = compact ? "p-1.5" : "p-2";

  const renderCard = (pick: BoardPick | undefined): ReactNode => {
    if (!pick) return <div className={`${pad} h-full`} />;
    const isCurrent = pick.id === currentPickId;
    const player = pick.gsisId ? players.get(pick.gsisId) : null;
    return (
      <div
        className={`${pad} flex h-full min-h-[52px] flex-col justify-between rounded-md border ${
          isCurrent
            ? "border-flame bg-flame text-paper"
            : player
              ? `border-line bg-surface pk-${player.position}`
              : "border-line/50 bg-pit"
        }`}
      >
        <div className="flex items-baseline justify-between gap-1">
          <span className="font-mono text-[10px] text-faint">{pick.overallPick}</span>
          {player && (
            <span className="flex items-center gap-1">
              <span className={`pos ${player.position} !min-w-0 !px-1 !text-[9px]`}>
                {player.position}
              </span>
              {player.nflTeam && (
                <span className="label !text-[9px]">{player.nflTeam}</span>
              )}
            </span>
          )}
        </div>
        {player ? (
          <div className="truncate text-xs font-bold leading-tight">
            {player.name}
            {pick.isAutopick && <span className="ml-1 text-[9px] font-normal text-faint">auto</span>}
          </div>
        ) : isCurrent ? (
          <div className="display text-xs">On the clock</div>
        ) : (
          <div className="text-[10px] text-faint">—</div>
        )}
      </div>
    );
  };

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[760px] gap-1"
        style={{ gridTemplateColumns: `2.25rem repeat(${teams.length}, minmax(0, 1fr))` }}
      >
        <div />
        {teams.map((t) => (
          <div
            key={t.id}
            className={`label truncate px-1 pb-1 text-center ${t.id === myTeamId ? "!text-flame" : ""}`}
            title={t.name}
          >
            {t.name}
          </div>
        ))}
        {Array.from({ length: rounds }, (_, i) => i + 1).map((round) => (
          <div key={round} className="contents">
            <div className="display flex items-center justify-center text-sm text-faint">
              {round}
            </div>
            {teams.map((t) => (
              <div key={t.id}>{renderCard(cell.get(`${round}:${t.id}`))}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
