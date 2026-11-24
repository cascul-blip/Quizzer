import { useState } from "preact/hooks";
import type { PlayerMemoryView } from "../../shared/modes/memory.ts";
import { memoryFacePosition, memoryThemeArt } from "../shared/memory/themes.ts";
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
  const [pending, setPending] = useState<{ step: 1 | 2; position: number } | null>(null);
  const { step } = turn;
  const selected = pending?.step === step ? pending.position : null;
  const { box, inner, zoomIn, zoomOut, pointerHandlers, isTap } = usePanZoom();
  const left = useCountdown(step === null ? 0 : remainingMs, step === null ? "feedback" : `turn:${turn.id}`);
  const canSelect = step !== null && left > 0;
  const { image, columns, names } = memoryThemeArt.faces;
  const rows = names.length / columns;
  return (
    <main class="memory-picks">
      <link rel="preload" as="image" href={image} />
      <div class="memory-board-controls">
        {step !== null && (
          <div class={`timer ${left <= 5 ? "urgent" : ""}`} role="timer" aria-label="Turn time remaining">
            {left}
          </div>
        )}
        <h1>{step === null ? "Cards revealed" : step === 1 ? "Pick the first card" : "Pick the second card"}</h1>
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
            {turn.board.map((card, position) => {
              if (card.state === "empty") return <div key={position} aria-hidden="true" />;
              if (card.state === "up") {
                return (
                  <div
                    key={position}
                    class="memory-phone-face"
                    role="img"
                    aria-label={`Card ${position + 1}, ${names[card.face] ?? "revealed"}`}
                    style={{
                      backgroundImage: `url("${image}")`,
                      backgroundSize: `${columns * 100}% ${rows * 100}%`,
                      backgroundPosition: memoryFacePosition(card.face),
                    }}
                  />
                );
              }
              return (
                <button
                  key={position}
                  class={memoryThemeArt.cardBackClass}
                  aria-label={`Card ${position + 1}`}
                  aria-pressed={selected === position}
                  aria-disabled={!canSelect}
                  onClick={(e) => {
                    if (canSelect && isTap(e)) setPending(selected === position ? null : { step, position });
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
      <button
        class="btn primary memory-confirm"
        disabled={selected === null || !canSelect}
        onClick={() => {
          if (selected === null || !canSelect) return;
          setPending(null);
          send({ type: "memory.confirm", turnId: turn.id, step, position: selected });
        }}
      >
        Confirm card
      </button>
    </main>
  );
}
