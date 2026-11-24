import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { QuestionView } from "../../shared/mode-views.ts";
import { STREAK_MIN } from "../../shared/protocol.ts";
import { PinBoard, PinDragger } from "../shared/pin.tsx";
import { Tex } from "../shared/tex.tsx";
import { LockedChoice, optionColor, ordinal, Shape, TextAnswer, useCountdown } from "../shared/ui.tsx";
import type { ClassicView, Send } from "./common.tsx";
import { Bar, Center } from "./common.tsx";

/** Phone screen for Classic: the question, the answer buttons, the result and the final rank. */
export function ClassicPlayer({ view, send }: { view: ClassicView; send: Send }) {
  return (
    <div class="game">
      <Bar view={view} />
      <Phase view={view} send={send} />
    </div>
  );
}

function Phase({ view, send }: { view: ClassicView; send: Send }) {
  const q = view.question;
  switch (view.phase) {
    case "intro":
      return <PacedQuestionIntro question={q!} label={`Question ${q!.index + 1} of ${q!.total}`} />;
    case "open":
      return <PacedQuestionAnswering question={q!} view={view} submit={(option, text) => send({ type: "answer", qIndex: q!.index, option, text })} />;
    case "reveal":
    case "leaderboard":
      return <Result view={view} />;
    case "podium":
      return (
        <Center>
          <p class="muted">Final result</p>
          <div class={`final-rank ${view.me.rank <= 3 ? "top" : ""}`}>{ordinal(view.me.rank)}</div>
          <h1>{view.me.rank === 1 ? "You won!" : view.me.rank <= 3 ? "On the podium!" : "Well played!"}</h1>
          <p class="big-score">{view.me.score.toLocaleString()} points</p>
          <p class="muted small">
            out of {view.playerCount} player{view.playerCount === 1 ? "" : "s"}
          </p>
        </Center>
      );
  }
}

export function PacedQuestionIntro({ question, label }: { question: QuestionView; label: string }) {
  return (
    <Center>
      <p class="muted">{label}</p>
      <h1 class="q-text">
        <Tex text={question.text} />
      </h1>
      <p class="muted">Get ready…</p>
    </Center>
  );
}

export function PacedQuestionAnswering({
  question: q,
  view,
  submit,
}: {
  question: QuestionView;
  view: Pick<ClassicView, "myChoice" | "myText">;
  submit: (option: number, text?: string) => void;
}) {
  const [pending, setPending] = useState<number | null>(null);
  const secs = useCountdown(q.remainingMs, `open:${q.index}`);
  useEffect(() => setPending(null), [q.index]);
  const [pendingText, setPendingText] = useState<string | null>(null);
  useEffect(() => setPendingText(null), [q.index]);
  const chosen = view.myChoice ?? pending;
  const typed = view.myText ?? pendingText;

  if (chosen !== null || typed !== null) {
    return (
      <Center>
        {typed !== null ? <div class="locked-text">{typed}</div> : <LockedChoice type={q.type} index={chosen!} label={q.options[chosen!] ?? ""} />}
        <h1>Answer locked in</h1>
        <p class="muted">Waiting for the others…</p>
      </Center>
    );
  }

  const choose = (i: number) => {
    if (navigator.vibrate) navigator.vibrate(30);
    setPending(i);
    submit(i);
  };
  const head = (
    <div class="q-head">
      <div class={`timer ${secs <= 5 ? "urgent" : ""}`}>{secs}</div>
      <h2 class="q-text">
        <Tex text={q.text} />
      </h2>
    </div>
  );
  if (q.type === "pin" && q.image && q.spots) {
    return (
      <main class="answering">
        {head}
        <PinDragger key={q.index} image={q.image} spots={q.spots} labels={q.options} onSubmit={choose} />
      </main>
    );
  }

  return (
    <main class="answering">
      {head}
      {q.image && <img class="q-img" src={`/${q.image}`} alt="" />}
      {q.type === "text" ? (
        <TextAnswer
          key={q.index}
          onSubmit={(text) => {
            if (navigator.vibrate) navigator.vibrate(30);
            setPendingText(text);
            submit(0, text);
          }}
        />
      ) : (
        <div class={`answers n${q.options.length}`}>
          {q.options.map((text, i) => {
            const c = optionColor(q.type, i);
            return (
              <button key={i} class={`answer opt-${c}`} onClick={() => choose(i)}>
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

function Result({ view }: { view: ClassicView }) {
  const r = view.result!;
  return (
    <PacedQuestionFeedback
      question={view.question!}
      result={r}
      myText={view.myText}
      reward={r.wasCorrect ? `+${r.points.toLocaleString()}` : "+0"}
      streak={r.wasCorrect && view.me.streak >= STREAK_MIN ? view.me.streak : 0}
    >
      {view.me.score.toLocaleString()} points · {ordinal(view.me.rank)} of {view.playerCount}
    </PacedQuestionFeedback>
  );
}

export function PacedQuestionFeedback({
  question: q,
  result: r,
  myText,
  reward,
  streak = 0,
  children,
}: {
  question: QuestionView;
  result: Pick<NonNullable<ClassicView["result"]>, "choice" | "correct" | "wasCorrect">;
  myText: string | null;
  reward: string;
  streak?: number;
  children: ComponentChildren;
}) {
  const correctSet = new Set(r.correct);
  const heading = r.choice === null && myText === null ? "Time's up!" : r.wasCorrect ? "Correct!" : "Wrong";
  return (
    <main class={`result ${r.wasCorrect ? "good" : "bad"}`}>
      <div class="verdict">
        <div class="verdict-icon">{r.wasCorrect ? "✓" : "✗"}</div>
        <h1>{heading}</h1>
        <div class="points">{reward}</div>
        {streak > 0 && <div class="streak-note">🔥 {streak} in a row!</div>}
      </div>
      <p class="q-text small-q">
        <Tex text={q.text} />
      </p>
      {myText !== null && (
        <p class="muted">
          You typed: <b>{myText}</b>
        </p>
      )}
      {q.type === "pin" && q.image && q.spots ? (
        <div class="pin-result">
          <PinBoard
            image={q.image}
            spots={q.spots}
            labels={q.options}
            correct={r.correct}
            pinAt={r.choice}
            wrong={r.choice !== null && !correctSet.has(r.choice) ? r.choice : null}
          />
        </div>
      ) : (
        <ul class="reveal-list">
          {q.options.map((text, i) => {
            const isCorrect = correctSet.has(i);
            const isMine = r.choice === i;
            const c = optionColor(q.type, i);
            return (
              <li key={i} class={`reveal-item opt-${c} ${isCorrect ? "is-correct" : "is-other"} ${isMine && !isCorrect ? "is-wrong-pick" : ""}`}>
                <Shape index={c} />
                <span class="t">
                  <Tex text={text} />
                </span>
                {isCorrect && <span class="tag">✓ {r.correct.length > 1 ? "Correct" : "Answer"}</span>}
                {isMine && <span class="tag mine">{isCorrect ? "Your pick" : "✗ Your pick"}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <p class="standing">{children}</p>
    </main>
  );
}
