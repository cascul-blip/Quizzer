import { STREAK_MIN } from "../../shared/protocol.ts";
import { ordinal } from "../shared/ui.tsx";
import type { ClassicView, Send } from "./common.tsx";
import { Bar, Center } from "./common.tsx";
import { PacedQuestionAnswering, PacedQuestionFeedback, PacedQuestionIntro } from "./paced-question.tsx";

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
