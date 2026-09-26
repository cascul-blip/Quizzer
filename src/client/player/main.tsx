import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { STREAK_MIN, type ClientMsg, type PlayerView, type ServerMsg } from "../../shared/protocol.ts";
import { connect, type ConnStatus } from "../shared/ws.ts";
import { ConnBanner, ErrorBoundary, Shape, StreakBadge, Toast, optionColor, ordinal, useCountdown } from "../shared/ui.tsx";
import { SubPlayer } from "./submarine.tsx";
import { TowerPlayer } from "./tower.tsx";

const TOKEN_KEY = "quizzer.token";
const NAME_KEY = "quizzer.nickname";

const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // Private mode etc.: reconnect-after-refresh won't work, everything else does.
    }
  },
};

type Joined = Extract<PlayerView, { kind: "player" }>;

function App() {
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kicked, setKicked] = useState(false);
  const [joining, setJoining] = useState(false);
  const conn = useRef<{ send(m: ClientMsg): void } | null>(null);

  useEffect(() => {
    const c = connect({
      onStatus: setStatus,
      onOpen: (send) => {
        const token = storage.get(TOKEN_KEY);
        if (token) send({ type: "resume", token });
      },
      onMessage: (msg: ServerMsg) => {
        switch (msg.type) {
          case "player.state":
            setView(msg.view);
            setJoining(false);
            break;
          case "joined":
            storage.set(TOKEN_KEY, msg.token);
            break;
          case "resumeFailed":
            storage.set(TOKEN_KEY, null);
            break;
          case "kicked":
            storage.set(TOKEN_KEY, null);
            setKicked(true);
            break;
          case "error":
            setError(msg.message);
            setJoining(false);
            break;
        }
      },
    });
    conn.current = c;
    return () => c.close();
  }, []);

  const send = (m: ClientMsg) => conn.current?.send(m);

  let body;
  if (kicked) {
    body = (
      <Center>
        <h1>You were removed from the game</h1>
        <button class="btn primary" onClick={() => setKicked(false)}>
          OK
        </button>
      </Center>
    );
  } else if (!view) {
    body = (
      <Center>
        <div class="spinner" />
      </Center>
    );
  } else if (view.kind === "none") {
    if (!view.game) {
      body = (
        <Center>
          <Logo />
          <p class="muted">Waiting for the host to open a game…</p>
          <div class="spinner" />
        </Center>
      );
    } else if (view.game.phase === "podium") {
      body = (
        <Center>
          <Logo />
          <p class="muted">This game has finished. Wait for the host to start the next one.</p>
        </Center>
      );
    } else {
      body = (
        <JoinForm
          title={view.game.title}
          busy={joining}
          onJoin={(nickname) => {
            setJoining(true);
            storage.set(NAME_KEY, nickname);
            send({ type: "join", nickname });
          }}
        />
      );
    }
  } else if (view.kind === "tower") {
    body = <TowerPlayer view={view} send={send} />;
  } else if (view.kind === "sub") {
    body = <SubPlayer view={view} send={send} />;
  } else {
    body = <Game view={view} send={send} />;
  }

  return (
    <>
      <ConnBanner status={view ? status : "open"} />
      {body}
      <Toast message={error} onDone={() => setError(null)} />
    </>
  );
}

function Center({ children }: { children: preact.ComponentChildren }) {
  return <main class="center">{children}</main>;
}

function Logo() {
  return <div class="logo">Quizzer</div>;
}

function JoinForm({ title, busy, onJoin }: { title: string; busy: boolean; onJoin: (name: string) => void }) {
  const [name, setName] = useState(() => storage.get(NAME_KEY) ?? "");
  return (
    <Center>
      <Logo />
      <form
        class="card join"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onJoin(name.trim());
        }}
      >
        <div class="join-title">{title}</div>
        <label for="nick">Your nickname</label>
        <input
          id="nick"
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
          maxLength={20}
          autoComplete="nickname"
          autoCapitalize="words"
          enterKeyHint="go"
          placeholder="e.g. Sam"
        />
        <button class="btn primary big" disabled={!name.trim() || busy}>
          {busy ? "Joining…" : "Join"}
        </button>
      </form>
    </Center>
  );
}

function Game({ view, send }: { view: Joined; send: (m: ClientMsg) => void }) {
  return (
    <div class="game">
      <header class="bar">
        <span class="name">
          {view.me.nickname}
          <StreakBadge streak={view.me.streak} />
        </span>
        {view.question && view.phase !== "lobby" && (
          <span class="qnum">
            {view.question.index + 1} / {view.question.total}
          </span>
        )}
        {view.phase !== "lobby" && <span class="score">{view.me.score.toLocaleString()}</span>}
      </header>
      <Phase view={view} send={send} />
    </div>
  );
}

function Phase({ view, send }: { view: Joined; send: (m: ClientMsg) => void }) {
  const q = view.question;
  switch (view.phase) {
    case "lobby":
      return (
        <Center>
          <div class="big-check">✓</div>
          <h1>You're in!</h1>
          {view.team && (
            <div class="team-badge" style={{ background: view.team.color }}>
              Team {view.team.name}
            </div>
          )}
          <p class="muted">See your nickname on the big screen? The game starts soon.</p>
          <p class="muted small">{view.playerCount} player{view.playerCount === 1 ? "" : "s"} joined</p>
        </Center>
      );
    case "intro":
      return (
        <Center>
          <p class="muted">Question {q!.index + 1} of {q!.total}</p>
          <h1 class="q-text">{q!.text}</h1>
          <p class="muted">Get ready…</p>
        </Center>
      );
    case "open":
      return <Answering view={view} send={send} />;
    case "reveal":
    case "leaderboard":
      return <Result view={view} />;
    case "podium":
      return (
        <Center>
          <p class="muted">Final result</p>
          <div class={`final-rank ${view.me.rank <= 3 ? "top" : ""}`}>{ordinal(view.me.rank)}</div>
          <h1>
            {view.me.rank === 1 ? "You won!" : view.me.rank <= 3 ? "On the podium!" : "Well played!"}
          </h1>
          <p class="big-score">{view.me.score.toLocaleString()} points</p>
          <p class="muted small">
            out of {view.playerCount} player{view.playerCount === 1 ? "" : "s"}
          </p>
        </Center>
      );
  }
}

function Answering({ view, send }: { view: Joined; send: (m: ClientMsg) => void }) {
  const q = view.question!;
  const [pending, setPending] = useState<number | null>(null);
  const secs = useCountdown(q.remainingMs, `open:${q.index}`);
  useEffect(() => setPending(null), [q.index]);
  const chosen = view.myChoice ?? pending;

  if (chosen !== null) {
    return (
      <Center>
        <div class={`locked opt-${optionColor(q.type, chosen)}`}>
          <Shape index={optionColor(q.type, chosen)} />
          <span>{q.options[chosen]}</span>
        </div>
        <h1>Answer locked in</h1>
        <p class="muted">Waiting for the others…</p>
      </Center>
    );
  }

  return (
    <main class="answering">
      <div class="q-head">
        <div class={`timer ${secs <= 5 ? "urgent" : ""}`}>{secs}</div>
        <h2 class="q-text">{q.text}</h2>
      </div>
      {q.image && <img class="q-img" src={`/${q.image}`} alt="" />}
      <div class={`answers n${q.options.length}`}>
        {q.options.map((text, i) => {
          const c = optionColor(q.type, i);
          return (
            <button
              key={i}
              class={`answer opt-${c}`}
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(30);
                setPending(i);
                send({ type: "answer", qIndex: q.index, option: i });
              }}
            >
              <Shape index={c} />
              <span>{text}</span>
            </button>
          );
        })}
      </div>
    </main>
  );
}

function Result({ view }: { view: Joined }) {
  const q = view.question!;
  const r = view.result!;
  const correctSet = new Set(r.correct);
  const heading = r.choice === null ? "Time's up!" : r.wasCorrect ? "Correct!" : "Wrong";
  return (
    <main class={`result ${r.wasCorrect ? "good" : "bad"}`}>
      <div class="verdict">
        <div class="verdict-icon">{r.wasCorrect ? "✓" : "✗"}</div>
        <h1>{heading}</h1>
        <div class="points">{r.wasCorrect ? `+${r.points.toLocaleString()}` : "+0"}</div>
        {r.wasCorrect && view.me.streak >= STREAK_MIN && <div class="streak-note">🔥 {view.me.streak} in a row!</div>}
      </div>
      <p class="q-text small-q">{q.text}</p>
      <ul class="reveal-list">
        {q.options.map((text, i) => {
          const isCorrect = correctSet.has(i);
          const isMine = r.choice === i;
          const c = optionColor(q.type, i);
          return (
            <li key={i} class={`reveal-item opt-${c} ${isCorrect ? "is-correct" : "is-other"} ${isMine && !isCorrect ? "is-wrong-pick" : ""}`}>
              <Shape index={c} />
              <span class="t">{text}</span>
              {isCorrect && <span class="tag">✓ {r.correct.length > 1 ? "Correct" : "Answer"}</span>}
              {isMine && <span class="tag mine">{isCorrect ? "Your pick" : "✗ Your pick"}</span>}
            </li>
          );
        })}
      </ul>
      <p class="standing">
        {view.me.score.toLocaleString()} points · {ordinal(view.me.rank)} of {view.playerCount}
      </p>
    </main>
  );
}

render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
  document.getElementById("app")!,
);
