import { useEffect, useRef, useState } from "preact/hooks";
import type { HostView } from "../../shared/protocol.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import type { MusicCue } from "../shared/music/index.ts";
import { play } from "../shared/sounds.ts";
import { ordinal, StreakBadge } from "../shared/ui.tsx";
import type { Send } from "./common.tsx";
import { ErrorsButton, ErrorsTable } from "./common.tsx";
import { NextButton, PacedQuestionIntro, PacedQuestionScreen, PacedStageHeader, usePacedShortcuts } from "./paced-question.tsx";
import { revealCue } from "./reveal-cue.ts";

type GameView = Extract<HostView, { kind: "classic" }>;

export function classicCue(view: GameView): MusicCue {
  if (view.phase === "podium") return { track: "classic-results" };
  if (view.phase === "reveal" || view.phase === "leaderboard") return { track: "classic-leaderboard" };
  const q = view.question;
  if (view.phase === "open" && q) {
    return { track: "classic-question", intensity: 0.2, rampTo: 1, rampMs: q.remainingMs, key: `q${q.index}-open` };
  }
  return { track: "classic-question", intensity: 0.1, key: `q${q?.index ?? 0}-intro` };
}

export function ClassicStage({ view, send, enteredFromLobby }: { view: GameView; send: Send; enteredFromLobby: boolean }) {
  const prev = useRef<GameView | null>(null);

  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (view.phase === "intro" && (p ? p.phase !== "intro" : enteredFromLobby)) play("start");
    if (!p) return;
    if (view.phase !== p.phase) {
      if (view.phase === "reveal") play(revealCue(p.phase === "open", view.answeredCount, view.players));
      if (view.phase === "podium") play("fanfare");
    }
  }, [view, enteredFromLobby]);

  const inGame = view.phase !== "podium";
  usePacedShortcuts(
    {
      advance: inGame ? "send" : "prevent-default",
      canSkip: view.phase === "open" || view.phase === "intro",
    },
    send,
  );
  const connectedCount = view.players.filter((p) => p.connected).length;

  return (
    <div class="stage">
      <PacedStageHeader
        title={view.quiz.title}
        questionLabel={view.question && inGame ? `Question ${view.question.index + 1} / ${view.question.total}` : undefined}
        connectedCount={connectedCount}
        totalPlayerCount={view.players.length}
        join={view.join}
        gameControls={inGame ? { pacing: view.pacing, autoAdvanceTitle: "Auto-advance after the reveal and leaderboard" } : undefined}
        send={send}
      />
      <PhaseView view={view} send={send} />
    </div>
  );
}

function PhaseView({ view, send }: { view: GameView; send: Send }) {
  switch (view.phase) {
    case "intro":
      return <PacedQuestionIntro question={view.question!} send={send} />;
    case "open":
    case "reveal":
      return (
        <PacedQuestionScreen
          question={view.question!}
          view={view}
          send={send}
          nextLabel={view.question!.index + 1 >= view.question!.total ? "Final results" : "Leaderboard"}
        />
      );
    case "leaderboard":
      return <Leaderboard view={view} send={send} />;
    case "podium":
      return <Podium view={view} send={send} />;
  }
}

function Leaderboard({ view, send }: { view: GameView; send: Send }) {
  const top = view.leaderboard.slice(0, 5);
  return (
    <main class="leaderboard">
      <h1>Leaderboard</h1>
      <ol class="lb-list">
        {top.map((p, i) => (
          <li key={p.id} class="lb-row" style={{ animationDelay: `${i * 80}ms` }}>
            <span class="lb-rank">{p.rank}</span>
            <Avatar choice={p.avatar} class="lb-avatar" />
            <span class="lb-name">
              {p.nickname}
              <StreakBadge streak={p.streak} />
            </span>
            {p.delta > 0 && <span class="lb-delta">+{p.delta}</span>}
            <span class="lb-score">{p.score.toLocaleString()}</span>
          </li>
        ))}
      </ol>
      <footer class="controls">
        <NextButton pacing={view.pacing} send={send} label="Next question" />
      </footer>
    </main>
  );
}

function Podium({ view, send }: { view: GameView; send: Send }) {
  const [showErrors, setShowErrors] = useState(false);
  const lb = view.leaderboard;
  const byPlace = (rankIdx: number) => lb[rankIdx];
  const places = [
    { entry: byPlace(1), cls: "second" },
    { entry: byPlace(0), cls: "first" },
    { entry: byPlace(2), cls: "third" },
  ];
  return (
    <main class="podium">
      <h1>🏆 Final results</h1>
      {showErrors ? (
        <ErrorsTable errors={view.errors ?? []} />
      ) : (
        <>
          <div class="podium-blocks">
            {places.map(({ entry, cls }) =>
              entry ? (
                <div key={cls} class={`place ${cls}`}>
                  <div class="place-avatar">
                    <Avatar choice={entry.avatar} title={entry.nickname} />
                  </div>
                  <div class="place-name">
                    {entry.nickname}
                    <StreakBadge streak={entry.streak} />
                  </div>
                  <div class="place-score">{entry.score.toLocaleString()}</div>
                  <div class="place-block">{ordinal(entry.rank)}</div>
                </div>
              ) : (
                <div key={cls} class={`place ${cls} empty`} />
              ),
            )}
          </div>
          {lb.length > 3 && (
            <ol class="rest" start={4}>
              {lb.slice(3).map((p) => (
                <li key={p.id}>
                  <span class="rest-who">
                    {ordinal(p.rank)} <Avatar choice={p.avatar} class="rest-avatar" /> {p.nickname}
                    <StreakBadge streak={p.streak} />
                  </span>
                  <span>{p.score.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      <footer class="controls">
        <ErrorsButton shown={showErrors} onToggle={() => setShowErrors(!showErrors)} />
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
