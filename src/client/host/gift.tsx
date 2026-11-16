import { useEffect, useRef, useState } from "preact/hooks";
import type { GiftStanding, HostView } from "../../shared/protocol.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import { formatClock, useCountdown } from "../shared/ui.tsx";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen, type Send } from "./common.tsx";
import { Award } from "./tower.tsx";
import workshop from "../shared/gift/workshop-projector.webp";
import present from "../shared/gift/present.webp";
import chestFull from "../shared/gift/chest-projector-full.webp";
import chestOverflowing from "../shared/gift/chest-projector-overflowing.webp";
import chestMedium from "../shared/gift/chest-projector-medium.webp";
import chestMaximum from "../shared/gift/chest-projector-maximum.webp";
import "./gift.css";

type GiftView = Extract<HostView, { kind: "gift" }>;

// Standings order selects exactly three featured heaps, including when ranks tie.
const PODIUM_HEAPS = [chestMaximum, chestOverflowing, chestMedium];

function GiftStation({ player, position, final }: { player: GiftStanding; position: number; final: boolean }) {
  const previousScore = useRef(player.score);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (!final && player.score > previousScore.current) setBurst((value) => value + 1);
    previousScore.current = player.score;
  }, [player.score, final]);

  const heap = PODIUM_HEAPS[position] ?? chestFull;
  const leading = player.rank === 1 && (player.score > 0 || final);
  return (
    <li class={`gift-station ${leading ? "gift-leading" : ""} ${!player.connected && !final ? "gift-offline" : ""}`}>
      <div class="gift-station-art" aria-hidden="true">
        <div class="gift-chest-glow" />
        <img
          class="gift-station-chest gift-station-heap"
          src={heap}
          alt=""
        />
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
  const scoringPositions = new Map(view.standings.map((player, index) => [player.id, index]));
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
              {stations.map((player) => <GiftStation key={player.id} player={player} position={scoringPositions.get(player.id)!} final={final} />)}
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
