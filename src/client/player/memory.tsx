import { useState } from "preact/hooks";
import type { PlayerMemoryView } from "../../shared/modes/memory.ts";
import { memoryThemeArt } from "../shared/memory/themes.ts";
import { ordinal, useCountdown } from "../shared/ui.tsx";
import type { Send } from "./common.tsx";
import { Center } from "./common.tsx";
import { PacedQuestionAnswering, PacedQuestionFeedback, PacedQuestionIntro } from "./paced-question.tsx";
import { usePanZoom } from "./pan-zoom.ts";
import "./memory.css";

export function MemoryPlayer({ view, send }: { view: PlayerMemoryView; send: Send }) {
  return (
    <div class={view.turn ? "game memory-turn" : "game"}>
      <header class="bar">
        <span class="name">{view.me.nickname}</span>
        <span class="score">
          {view.me.chips} {view.me.chips === 1 ? "chip" : "chips"}
        </span>
      </header>
      <MemoryPhase view={view} send={send} />
    </div>
  );
}

function MemoryPhase({ view, send }: { view: PlayerMemoryView; send: Send }) {
  const question = view.question;
  if (question) {
    if (view.phase === "intro") return <PacedQuestionIntro question={question} label={`Question ${question.index + 1}`} />;
    if (view.phase === "open") {
      return (
        <PacedQuestionAnswering
          question={question}
          view={view}
          submit={(option, text) => send({ type: "memory.answer", index: question.index, option, text })}
        />
      );
    }
    if (view.reveal) {
      return (
        <PacedQuestionFeedback question={question} result={view.reveal} myText={view.myText} reward={view.reveal.wasCorrect ? "+1 chip" : "+0 chips"}>
          {view.me.chips} {view.me.chips === 1 ? "chip" : "chips"}
        </PacedQuestionFeedback>
      );
    }
  }
  if (view.result) {
    return (
      <Center>
        <p class="muted">Final result</p>
        <div class={`final-rank ${view.result.rank <= 3 ? "top" : ""}`}>{ordinal(view.result.rank)}</div>
        <p class="big-score">
          {view.me.pairs} {view.me.pairs === 1 ? "matched pair" : "matched pairs"}
        </p>
        <p class="muted">
          Rank {view.result.rank} of {view.result.playerCount}
        </p>
      </Center>
    );
  }
  if (view.turn) return <MemoryPicks key={view.turn.id} turn={view.turn} boardSize={view.boardSize} remainingMs={view.phaseRemainingMs} send={send} />;
  return (
    <Center>
      <h1>Watch the projector</h1>
      <p class="muted">Your phone will show the card controls on your turn.</p>
    </Center>
  );
}

function MemoryPicks({
  turn,
  boardSize,
  remainingMs,
  send,
}: {
  turn: NonNullable<PlayerMemoryView["turn"]>;
  boardSize: number;
  remainingMs: number;
  send: Send;
}) {
  const [picks, setPicks] = useState<number[]>([]);
  const { box, inner, zoomIn, zoomOut, pointerHandlers, isTap } = usePanZoom();
  const left = useCountdown(remainingMs, `turn:${turn.id}`);
  const toggle = (position: number) => {
    setPicks((previous) => {
      if (previous.includes(position)) return previous.filter((pick) => pick !== position);
      return previous.length < 2 ? [...previous, position] : previous;
    });
  };
  return (
    <main class="memory-picks">
      <div class="memory-board-controls">
        <div class={`timer ${left <= 5 ? "urgent" : ""}`} role="timer" aria-label="Turn time remaining">
          {left}
        </div>
        <h1>Pick two cards</h1>
        <button class="btn ghost" aria-label="Zoom in" onClick={zoomIn}>
          +
        </button>
        <button class="btn ghost" aria-label="Zoom out" onClick={zoomOut}>
          −
        </button>
      </div>
      <div class="memory-board-fit">
        <div class="memory-board-viewport" ref={box} {...pointerHandlers}>
          <div class="memory-board-pan" ref={inner} style={{ gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))` }}>
            {turn.available.map((available, position) =>
              available ? (
                <button
                  key={position}
                  class={memoryThemeArt.cardBackClass}
                  aria-label={`Card ${position + 1}`}
                  aria-pressed={picks.includes(position)}
                  aria-disabled={left === 0 || (picks.length === 2 && !picks.includes(position))}
                  onClick={(e) => left > 0 && isTap(e) && toggle(position)}
                />
              ) : (
                <div key={position} aria-hidden="true" />
              ),
            )}
          </div>
        </div>
      </div>
      <button
        class="btn primary memory-confirm"
        disabled={picks.length !== 2 || left === 0}
        onClick={() => {
          const [first, second] = picks;
          if (first !== undefined && second !== undefined) send({ type: "memory.confirm", turnId: turn.id, positions: [first, second] });
        }}
      >
        Confirm pair
      </button>
    </main>
  );
}
