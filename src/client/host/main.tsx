import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { HostView, ServerMsg } from "../../shared/protocol.ts";
import type { QuizSummary } from "../../shared/quiz-schema.ts";
import { loadCustomMusic, useMusic } from "../shared/music/index.ts";
import { play, unlockAudio } from "../shared/sounds.ts";
import { ConnBanner, ErrorBoundary, Toast } from "../shared/ui.tsx";
import type { ConnStatus } from "../shared/ws.ts";
import { connect } from "../shared/ws.ts";
import type { Send } from "./common.tsx";
import { LobbyStage } from "./lobby.tsx";
import { stageOf } from "./modes.tsx";
import { musicFor } from "./music-cues.ts";

function App() {
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [view, setView] = useState<HostView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingQuiz, setPendingQuiz] = useState<string | null>(() => new URLSearchParams(location.search).get("quiz"));
  const conn = useRef<{ send: Send } | null>(null);

  useEffect(() => {
    const c = connect({
      onStatus: setStatus,
      onOpen: (send) => send({ type: "host.hello" }),
      onMessage: (msg: ServerMsg) => {
        if (msg.type === "host.state") setView(msg.view);
        else if (msg.type === "error") setError(msg.message);
      },
    });
    conn.current = c;
    return () => c.close();
  }, []);

  const send: Send = (m) => conn.current?.send(m);

  useEffect(() => void loadCustomMusic(), []);
  useMusic(musicFor(view));

  // Keep the previous view across stage changes for lobby joins and gameplay entry.
  const previousView = useRef<HostView | null>(null);
  useEffect(() => {
    const previous = previousView.current;
    previousView.current = view;
    if (previous?.kind !== "lobby" || !view) return;
    if (view.kind === "lobby" && view.players.length > previous.players.length) play("join");
  }, [view]);

  // Arriving from the admin page with ?quiz=… opens that quiz, unless a game is already running.
  useEffect(() => {
    if (!pendingQuiz || !view) return;
    if (view.kind === "idle") {
      send({ type: "host.open", quizId: pendingQuiz });
      clearPending();
    } else if (view.quiz.id === pendingQuiz) {
      clearPending();
    }
  }, [pendingQuiz, view?.phase]);

  function clearPending() {
    setPendingQuiz(null);
    history.replaceState(null, "", location.pathname);
  }

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  let body;
  if (!view) {
    body = (
      <div class="center">
        <div class="spinner" />
      </div>
    );
  } else if (view.kind === "idle") {
    body = <Idle onOpen={(quizId) => send({ type: "host.open", quizId })} />;
  } else if (view.kind === "lobby") {
    body = <LobbyStage view={view} send={send} />;
  } else {
    const Stage = stageOf(view);
    body = <Stage view={view} send={send} enteredFromLobby={previousView.current?.kind === "lobby"} />;
  }

  return (
    <>
      <ConnBanner status={view ? status : "open"} />
      {pendingQuiz && view && view.kind !== "idle" && view.quiz.id !== pendingQuiz && (
        <div class="replace-banner">
          <span>
            A game of <b>{view.quiz.title}</b> is still open.
          </span>
          <button
            class="btn primary"
            onClick={() => {
              send({ type: "host.open", quizId: pendingQuiz });
              clearPending();
            }}
          >
            Close it and open the new quiz
          </button>
          <button class="btn ghost" onClick={clearPending}>
            Keep current game
          </button>
        </div>
      )}
      {body}
      <Toast message={error} onDone={() => setError(null)} />
    </>
  );
}

function Idle({ onOpen }: { onOpen: (id: string) => void }) {
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  useEffect(() => {
    fetch("/api/quizzes")
      .then((r) => (r.ok ? r.json() : []))
      .then(setQuizzes)
      .catch(() => setQuizzes([]));
  }, []);
  const playable = (quizzes ?? []).filter((q) => !q.error && q.questionCount > 0);
  return (
    <div class="center idle">
      <div class="logo">Quizzer</div>
      <p class="muted">Pick a quiz to open a game lobby.</p>
      {quizzes === null ? (
        <div class="spinner" />
      ) : playable.length === 0 ? (
        <p>
          No playable quizzes yet. <a href="/admin">Create one in the admin page</a>.
        </p>
      ) : (
        <ul class="pick-list">
          {playable.map((q) => (
            <li key={q.id}>
              <button class="pick" onClick={() => onOpen(q.id)}>
                <span class="t">{q.title}</span>
                <span class="n">{q.questionCount} questions</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <a class="admin-link" href="/admin">
        Manage quizzes →
      </a>
    </div>
  );
}

render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
  document.getElementById("app")!,
);
