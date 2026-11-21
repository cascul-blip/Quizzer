import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { HostView, ServerMsg } from "../../shared/protocol.ts";
import type { QuizSummary } from "../../shared/quiz-schema.ts";
import { unlockAudio } from "../shared/sounds.ts";
import { connect, type ConnStatus } from "../shared/ws.ts";
import { ConnBanner, ErrorBoundary, Toast } from "../shared/ui.tsx";
import { loadCustomMusic, useMusic } from "../shared/music/index.ts";
import type { Send } from "./common.tsx";
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

  // Background music follows whatever screen the projector is showing.
  useEffect(() => void loadCustomMusic(), []);
  useMusic(musicFor(view));

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
  } else {
    const Stage = stageOf(view);
    body = <Stage view={view} send={send} />;
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
