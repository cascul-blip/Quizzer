import { MEMORY_BOARD_SIZES, MEMORY_QUESTIONS_PER_PHASE } from "../../shared/modes/memory.ts";
import type { HostView } from "../../shared/protocol.ts";
import { themedLabel, themedTrack } from "../../shared/themed-modes.ts";
import { memoryThemeArt as art } from "../shared/memory/themes.ts";
import type { MusicCue } from "../shared/music/index.ts";
import { ordinal, useCountdown } from "../shared/ui.tsx";
import type { Send } from "./common.tsx";
import type { LobbyModeEntry } from "./lobby-modes.tsx";
import { PacedQuestionIntro, PacedQuestionScreen, PacedStageHeader, usePacedShortcuts } from "./paced-question.tsx";
import "./memory.css";

type MemoryView = Extract<HostView, { kind: "memory" }>;

export const memoryLobby: LobbyModeEntry<"memory"> = {
  label: () => themedLabel("memory"),
  lobbyTrack: () => themedTrack("memory", undefined, "lobby"),
  Settings: ({ children, settings, send }) => (
    <>
      <label class="opt">
        Board size
        <select
          value={settings.boardSize}
          onChange={(event) => {
            const boardSize = MEMORY_BOARD_SIZES[event.currentTarget.selectedIndex];
            if (boardSize !== undefined) send({ type: "host.setModeSettings", mode: "memory", settings: { boardSize } });
          }}
        >
          {MEMORY_BOARD_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}×{size}
            </option>
          ))}
        </select>
      </label>
      {children}
      <span class="opt mode-hint">Correct answers earn chips to turn over pairs of cards on the shared board.</span>
    </>
  ),
};

export function memoryCue(view: MemoryView): MusicCue {
  if (view.phase === "podium") return { track: themedTrack("memory", undefined, "results") };
  return { track: themedTrack("memory", undefined, "play"), intensity: view.phase === "turn" ? 0.7 : 0.4 };
}

export function MemoryStage({ view, send }: { view: MemoryView; send: Send }) {
  const { phase, question } = view;
  usePacedShortcuts(
    {
      advance: question ? "send" : "ignore",
      canSkip: !!question && (phase === "intro" || phase === "open"),
      ignoreButtons: true,
    },
    send,
  );

  return (
    <div class="stage">
      <link rel="preload" as="image" href={art.faces.image} />
      <PacedStageHeader
        title={view.quiz.title}
        questionLabel={question ? `Question ${(question.index % MEMORY_QUESTIONS_PER_PHASE) + 1} / ${MEMORY_QUESTIONS_PER_PHASE} this phase` : undefined}
        connectedCount={view.players.filter((p) => p.connected).length}
        join={view.join}
        gameControls={phase !== "podium" ? { pacing: view.pacing, autoAdvanceTitle: "Auto-advance after the answer reveal" } : undefined}
        send={send}
      />
      {phase === "podium" ? (
        <MemoryPodium view={view} send={send} />
      ) : phase === "intro" && question ? (
        <PacedQuestionIntro question={question} send={send} />
      ) : question ? (
        <PacedQuestionScreen question={question} view={view} send={send} nextLabel={view.revealTurnsNext ? "Reveal turns" : "Next question"} />
      ) : (
        <MemoryBoard view={view} />
      )}
    </div>
  );
}

function MemoryBoard({ view }: { view: MemoryView }) {
  const left = useCountdown(view.phaseRemainingMs, `${view.phase}:${view.turn?.id}`);
  const { image, columns, names } = art.faces;
  const rows = names.length / columns;
  return (
    <main class="memory-stage" style={{ "--memory-wood": `url("${art.table}")` }}>
      <section class="memory-table" aria-label="Memory board">
        <div class="memory-turn">
          <h1>{view.turn?.nickname}</h1>
          {view.phase === "turn" ? (
            <span class={`memory-turn-clock${left <= 5 ? " urgent" : ""}`} aria-label={`${left} seconds left`}>
              {left}s
            </span>
          ) : (
            <span class="memory-turn-result">{view.feedback?.matched ? "Matched a pair!" : "Missed"}</span>
          )}
        </div>
        <div class="memory-board-space">
          <div
            class="memory-board"
            style={{
              "--memory-size": view.boardSize,
              "--memory-face-image": `url("${image}")`,
              "--memory-face-size": `${columns * 100}% ${rows * 100}%`,
            }}
          >
            {view.board.map((card, position) => (
              <div
                key={position}
                class={`memory-card memory-${card.state}${card.state === "down" ? ` ${art.cardBackClass}` : ""}`}
                role="img"
                aria-label={`Card ${position + 1}, ${card.state === "up" ? (names[card.face] ?? "revealed") : card.state === "empty" ? "empty" : "face down"}`}
                style={
                  card.state === "up"
                    ? { backgroundPosition: `${((card.face % columns) / (columns - 1)) * 100}% ${(Math.floor(card.face / columns) / (rows - 1)) * 100}%` }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      </section>
      <aside class="memory-scores">
        <h2>Matched pairs</h2>
        <ol>
          {view.players.map((player) => (
            <li key={player.id} class={player.id === view.turn?.playerId ? "memory-active-score" : ""}>
              <span title={player.nickname}>{player.nickname}</span>
              <strong>{player.pairs}</strong>
            </li>
          ))}
        </ol>
      </aside>
    </main>
  );
}

function MemoryPodium({ view, send }: { view: MemoryView; send: Send }) {
  return (
    <main class="podium">
      <h1>🏆 Final results</h1>
      <ol class="rest">
        {view.players.map((player) => (
          <li key={player.id}>
            <span class="rest-who">
              {ordinal(player.rank)} {player.nickname}
            </span>
            <span>
              {player.pairs} {player.pairs === 1 ? "pair" : "pairs"}
            </span>
          </li>
        ))}
      </ol>
      <footer class="controls">
        <button class="btn ghost" onClick={() => send({ type: "host.open", quizId: view.quiz.id })}>
          ↻ Play again
        </button>
        <button class="btn primary" onClick={() => send({ type: "host.close" })}>
          Done
        </button>
      </footer>
    </main>
  );
}
