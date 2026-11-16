import { useEffect, useRef, useState } from "preact/hooks";
import type { GiftStanding, HostView } from "../../shared/protocol.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import { formatClock, useCountdown } from "../shared/ui.tsx";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen, type Send } from "./common.tsx";
import { Award } from "./tower.tsx";
import workshop from "../shared/gift/workshop-projector.webp";
import chest from "../shared/gift/chest.webp";
import present from "../shared/gift/present.webp";
import "./gift.css";

type GiftView = Extract<HostView, { kind: "gift" }>;

// Wider lower tiers keep a tall pile visually balanced above its chest.
const PILE_ROWS = [
  [-26, -8, 10, 27],
  [-23, -5, 13, 23],
  [-17, 0, 17],
  [-11, 7],
  [0],
];
const PARCEL_COLORS = [0, 75, 155, 210, 300];
const HALF_PILE_SCORE = 120;

function GiftStation({ player, final }: { player: GiftStanding; final: boolean }) {
  const previousScore = useRef(player.score);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (!final && player.score > previousScore.current) setBurst((value) => value + 1);
    previousScore.current = player.score;
  }, [player.score, final]);

  // Use the same curve for every station so a rival gaining points never shrinks this pile.
  const height = PILE_ROWS.length * player.score / (player.score + HALF_PILE_SCORE);
  const leading = player.rank === 1 && (player.score > 0 || final);
  return (
    <li class={`gift-station ${leading ? "gift-leading" : ""} ${!player.connected && !final ? "gift-offline" : ""}`}>
      <div class="gift-station-art" aria-hidden="true">
        <div class="gift-chest-glow" />
        {PILE_ROWS.map((row, tier) => {
          const fill = Math.min(1, height - tier);
          if (fill <= 0) return null;
          return (
            <div class="gift-pile-row" key={tier} style={{ bottom: `${24 + tier * 12}%` }}>
              {row.map((offset, i) => (
                <img
                  key={offset}
                  src={present}
                  alt=""
                  style={{
                    left: `${50 + offset * (tier === 0 ? 1.16 : 1)}%`,
                    "--parcel-turn": `${(i % 2 ? 1 : -1) * (8 + (tier + i) % 3 * 4)}deg`,
                    "--parcel-color": `${PARCEL_COLORS[(i + tier * 2) % PARCEL_COLORS.length]}deg`,
                    "--parcel-fill": 0.44 + fill * 0.56,
                  }}
                />
              ))}
            </div>
          );
        })}
        <img class="gift-station-chest" src={chest} alt="" />
        {burst > 0 && !final && <img key={burst} class="gift-scored-parcel" src={present} alt="" />}
      </div>
      <div class="gift-station-plaque">
        <strong class="gift-station-score">{player.score.toLocaleString()} pts</strong>
        <div class="gift-station-identity">
          <Avatar choice={player.avatar} class="gift-avatar" />
          <span class="gift-name">{player.nickname}</span>
          {final && <span class="gift-final-rank" aria-label={`Rank ${player.rank}`}>#{player.rank}</span>}
        </div>
        {player.inBonus && <span class="gift-in-bonus">Bonus round</span>}
      </div>
    </li>
  );
}

export function GiftStage({ view, send }: { view: GiftView; send: Send }) {
  const seconds = useCountdown(view.remainingMs, view.phase);
  const [showErrors, setShowErrors] = useState(false);
  const final = view.phase === "podium";
  const seats = useRef(new Map<string, number>());
  for (const player of view.standings) {
    if (!seats.current.has(player.id)) seats.current.set(player.id, seats.current.size);
  }
  const stations = final ? view.standings : [...view.standings].sort((a, b) => seats.current.get(a.id)! - seats.current.get(b.id)!);
  const columns = Math.max(1, Math.min(6, stations.length > 6 ? Math.ceil(stations.length / 2) : stations.length));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "f" && !(event.target as HTMLElement)?.closest("input, select, textarea")) toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div class="stage gift-stage" style={{ "--workshop": `url("${workshop}")` }}>
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        <div class="spacer" />
        <ScreenControls join={view.join} />
        {!final && <button class="btn ghost small" onClick={() => confirm("End Gift Grab now?") && send({ type: "host.end" })}>End game</button>}
      </header>
      <main class="gift-host-main">
        <div class="gift-host-heading">
          <h1>🎁 Gift Grab</h1>
          {final ? <h2>Final standings</h2> : view.phase === "finishing" ? (
            <h2>Finishing bonus rounds…</h2>
          ) : (
            <div class="gift-host-clock">
              {view.phase === "countdown" ? Math.max(1, seconds) : formatClock(seconds)}
            </div>
          )}
          {view.phase === "countdown" && <p>Five correct answers earn 15 seconds at the gift chest.</p>}
        </div>
        {final && showErrors ? <ErrorsTable errors={view.errors} /> : (
          <>
            <ul class={`gift-standings ${stations.length > 6 ? "gift-standings-dense" : ""}`} style={{ "--gift-columns": columns }} aria-label={final ? "Final standings" : "Live standings"}>
              {stations.map((player) => <GiftStation key={player.id} player={player} final={final} />)}
            </ul>
            {final && view.mostCorrect && <Award icon="✓" title="Most correct answers" award={view.mostCorrect} unit="correct" />}
          </>
        )}
        {final && (
          <footer class="gift-host-controls">
            <ErrorsButton shown={showErrors} onToggle={() => setShowErrors(!showErrors)} />
            <button class="btn ghost" onClick={() => send({ type: "host.open", quizId: view.quiz.id })}>Play again</button>
            <button class="btn primary" onClick={() => send({ type: "host.close" })}>Done</button>
          </footer>
        )}
      </main>
    </div>
  );
}
