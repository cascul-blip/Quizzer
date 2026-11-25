import { useEffect, useRef, useState } from "preact/hooks";
import type { StreamFeedbackView, StreamQuestionView } from "../../shared/mode-views.ts";
import { PinDragger } from "../shared/pin.tsx";
import { Tex, TexList } from "../shared/tex.tsx";
import { optionColor, Shape, TextAnswer, useCountdown } from "../shared/ui.tsx";

export function StreamQuestion({ question, onAnswer }: { question: StreamQuestionView; onAnswer: (seq: number, option: number, text?: string) => void }) {
  const [sentSeq, setSentSeq] = useState<number | null>(null);
  const sent = useRef<number | null>(null);
  const locked = sentSeq === question.seq;
  const submit = (option: number, text?: string) => {
    if (sent.current === question.seq) return;
    sent.current = question.seq;
    setSentSeq(question.seq);
    onAnswer(question.seq, option, text);
  };
  if (question.type === "pin" && question.image && question.spots) {
    return (
      <main class="answering">
        <h2 class="q-text tower-q">
          <Tex text={question.text} />
        </h2>
        <PinDragger key={question.seq} image={question.image} spots={question.spots} labels={question.options} disabled={locked} onSubmit={(i) => submit(i)} />
      </main>
    );
  }
  return (
    <main class="answering">
      <h2 class="q-text tower-q">
        <Tex text={question.text} />
      </h2>
      {question.image && <img class="q-img" src={`/${question.image}`} alt="" />}
      {question.type === "text" ? (
        <TextAnswer key={question.seq} disabled={locked} onSubmit={(text) => submit(0, text)} />
      ) : (
        <div class={`answers n${question.options.length}`}>
          {question.options.map((text, i) => {
            const c = optionColor(question.type, i);
            return (
              <button key={`${question.seq}-${i}`} class={`answer opt-${c}`} disabled={locked} onClick={() => submit(i)}>
                <Shape index={c} />
                <span>
                  <Tex text={text} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}

/** Shown on the ✗ while a player who keeps answering wrong waits out the extra time. */
function PenaltyNote({ remainingMs, seq }: { remainingMs: number; seq: number }) {
  const secs = useCountdown(remainingMs, `penalty${seq}`);
  return (
    <div class="flash-penalty">
      Slow down and read the question!
      <b>Next question in {secs}s</b>
    </div>
  );
}

/** Full-screen ✓/✗ after each answer: a second, or longer after wrong answers in a row. */
export function Feedback({ feedback, rightText }: { feedback: StreamFeedbackView | null; rightText: string }) {
  // Decided during render, not in an effect: the snapshot that brings this feedback also brings
  // the next question, and an effect would let that question paint for a frame before the overlay.
  const last = useRef(feedback);
  if (feedback) last.current = feedback;
  const [hiddenSeq, setHiddenSeq] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!feedback) return;
    navigator.vibrate?.(feedback.correct ? 40 : [60, 40, 60]);
    const seq = feedback.seq;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHiddenSeq(seq), feedback.remainingMs);
  }, [feedback?.seq]);
  const shown = last.current;
  if (!shown || shown.seq === hiddenSeq) return null;
  return (
    <div class={`flash ${shown.correct ? "good" : "bad"}`} role="status">
      <div class="flash-icon">{shown.correct ? "✓" : "✗"}</div>
      <div class="flash-text">{shown.correct ? rightText : "Not quite"}</div>
      {!shown.correct && shown.answers.length > 0 && (
        <div class="flash-answer">
          <span>Correct answer{shown.answers.length > 1 ? "s" : ""}:</span>
          <b>
            <TexList items={shown.answers} sep=" / " />
          </b>
        </div>
      )}
      {shown.penaltyDurationMs > 0 && <PenaltyNote remainingMs={shown.remainingMs} seq={shown.seq} />}
    </div>
  );
}
