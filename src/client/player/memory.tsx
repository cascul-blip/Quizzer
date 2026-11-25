import { useContext, useState } from "preact/hooks";
import type { PlayerMemoryView } from "../../shared/modes/memory.ts";
import type { CardFlip } from "../shared/memory/card-flips.ts";
import { useCardFlips } from "../shared/memory/card-flips.ts";
import { memoryFacePosition, memoryFaceSize, memoryThemeArt } from "../shared/memory/themes.ts";
import { ordinal, useCountdown } from "../shared/ui.tsx";
import { PhoneResumeVersion } from "./after-answer-wait.ts";
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
  if (view.turn) {
    return <MemoryTurn turn={view.turn} boardSize={view.boardSize} remainingMs={view.phaseRemainingMs} send={send} />;
  }
  return (
    <Center>
      <h1>Watch the projector</h1>
      <p class="muted">Your phone will show the card controls on your turn.</p>
    </Center>
  );
}

type TurnProps = { turn: NonNullable<PlayerMemoryView["turn"]>; boardSize: number; remainingMs: number; send: Send };

/** Outlives the phase change inside a turn, so a card confirmed second still flips up when the result shows. */
function MemoryTurn(props: TurnProps) {
  const { turn, remainingMs } = props;
  const resumeVersion = useContext(PhoneResumeVersion);
  const flipBack = turn.step !== null || turn.matched === false;
  const flipOf = useCardFlips(turn.board, flipBack ? remainingMs : null, `${turn.step}:${turn.id}:${resumeVersion}`);
  return <MemoryPicks key={`${turn.step === null ? "feedback" : "turn"}:${turn.id}`} {...props} flipOf={flipOf} />;
}

function MemoryPicks({ turn, boardSize, remainingMs, send, flipOf }: TurnProps & { flipOf: (position: number) => CardFlip }) {
  const [pending, setPending] = useState<{ step: 1 | 2; position: number } | null>(null);
  const { step } = turn;
  const choosing = step !== null;
  const resumeVersion = useContext(PhoneResumeVersion);
  const selected = pending?.step === step ? pending.position : null;
  const { box, inner, pointerHandlers, isTap } = usePanZoom();
  const left = useCountdown(choosing ? remainingMs : 0, `turn:${turn.id}:${resumeVersion}`);
  const canSelect = choosing && left > 0;
  const { image, names } = memoryThemeArt.faces;
  return (
    <main class="memory-picks">
      <link rel="preload" as="image" href={image} />
      <div class="memory-board-controls">
        <div class="memory-timer-slot">
          {choosing && (
            <div class={`timer ${left <= 5 ? "urgent" : ""}`} role="timer" aria-label="Turn time remaining">
              {left}
            </div>
          )}
        </div>
        <div class="memory-heading">
          <h1>{step === null ? "Cards revealed" : step === 1 ? "Pick the first card" : "Pick the second card"}</h1>
          <p class={choosing ? "muted" : "muted memory-hint-reserved"}>Pinch to zoom</p>
        </div>
      </div>
      <div class="memory-board-fit">
        <div class="memory-board-viewport" ref={choosing ? box : undefined} {...(choosing ? pointerHandlers : undefined)}>
          <div class="memory-board-pan" ref={choosing ? inner : undefined} style={{ gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))` }}>
            {turn.board.map((card, position) => {
              if (card.state === "empty") return <div key={position} aria-hidden="true" />;
              if (card.state === "up") {
                const flip = flipOf(position);
                return (
                  <div
                    key={position}
                    class={flip ? `memory-phone-face ${flip}` : "memory-phone-face"}
                    role="img"
                    aria-label={`Card ${position + 1}, ${flip === "memory-flip-down" ? "face down" : (names[card.face] ?? "revealed")}`}
                    style={{
                      backgroundImage: `url("${image}")`,
                      backgroundSize: memoryFaceSize,
                      backgroundPosition: memoryFacePosition(card.face),
                    }}
                  >
                    {flip && <span class={`memory-flip-back ${memoryThemeArt.cardBackClass}`} aria-hidden="true" />}
                  </div>
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
