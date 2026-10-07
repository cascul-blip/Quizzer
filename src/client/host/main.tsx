import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { HILL_SETTINGS, LAND_MINUTES, LAND_MIN_TEAMS, MAX_TEAMS, TOWER_MINUTES, type GameMode, type HillSetting, type HostPlayer, type HostView, type Pacing, type ServerMsg } from "../../shared/protocol.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
import type { QuizSummary } from "../../shared/quiz-schema.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import { play, unlockAudio } from "../shared/sounds.ts";
import { connect, type ConnStatus } from "../shared/ws.ts";
import { ConnBanner, ErrorBoundary, Shape, StreakBadge, Toast, optionColor, ordinal, useCountdown } from "../shared/ui.tsx";
import { loadCustomMusic, useMusic } from "../shared/music/index.ts";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen, type Send } from "./common.tsx";
import { musicFor } from "./music-cues.ts";
import { FightStage } from "./fight.tsx";
import { LandStage } from "./land.tsx";
import { RobotStage } from "./robot.tsx";
import { SubStage } from "./submarine.tsx";
import { TowerStage } from "./tower.tsx";

type GameView = Extract<HostView, { kind: "classic" }>;

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
  } else if (view.kind === "tower") {
    body = <TowerStage view={view} send={send} />;
  } else if (view.kind === "sub") {
    body = <SubStage view={view} send={send} />;
  } else if (view.kind === "fight") {
    body = <FightStage view={view} send={send} />;
  } else if (view.kind === "robot") {
    body = <RobotStage view={view} send={send} />;
  } else if (view.kind === "land") {
    body = <LandStage view={view} send={send} />;
  } else {
    body = <Game view={view} send={send} />;
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

function Game({ view, send }: { view: GameView; send: Send }) {
  const prev = useRef<GameView | null>(null);

  // Sound cues on transitions.
  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!p) return;
    if (view.phase === "lobby" && view.players.length > p.players.length) play("join");
    if (view.phase !== p.phase) {
      if (view.phase === "intro") play("start");
      if (view.phase === "reveal") play(p.phase === "open" && view.answeredCount < view.players.length ? "timeUp" : "reveal");
      if (view.phase === "podium") play("fanfare");
    }
  }, [view]);

  // Keyboard: Space / → = next, S = skip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, select, textarea")) return;
      if (e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        if (view.phase === "lobby") {
          if (view.players.length > 0) send({ type: "host.start", pacing: view.pacing });
        } else if (view.phase !== "podium") send({ type: "host.next" });
      } else if (e.key === "s" || e.key === "S") {
        if (view.phase === "open" || view.phase === "intro") send({ type: "host.skip" });
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view.phase, view.players.length]);

  const inGame = view.phase !== "lobby" && view.phase !== "podium";

  return (
    <div class="stage">
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        {view.question && inGame && (
          <div class="pill">
            Question {view.question.index + 1} / {view.question.total}
          </div>
        )}
        <div class="spacer" />
        {inGame && (
          <label class="pacing-toggle" title="Auto-advance after the reveal and leaderboard">
            <input
              type="checkbox"
              checked={view.pacing === "auto"}
              onChange={(e) => send({ type: "host.setPacing", pacing: e.currentTarget.checked ? "auto" : "manual" })}
            />
            Auto-advance
          </label>
        )}
        <div class="pill">
          👥 {view.players.filter((p) => p.connected).length}
          {view.players.some((p) => !p.connected) && <span class="dim"> / {view.players.length}</span>}
        </div>
        <ScreenControls />
        {view.phase !== "podium" && (
          <button
            class="btn ghost small"
            onClick={() => {
              if (view.phase === "lobby") {
                if (confirm("Close this lobby?")) send({ type: "host.close" });
              } else if (confirm("End the game now and show the final results?")) send({ type: "host.end" });
            }}
          >
            {view.phase === "lobby" ? "Close" : "End game"}
          </button>
        )}
      </header>
      <PhaseView view={view} send={send} />
    </div>
  );
}

function PhaseView({ view, send }: { view: GameView; send: Send }) {
  switch (view.phase) {
    case "lobby":
      return <Lobby view={view} send={send} />;
    case "intro":
      return <Intro view={view} send={send} />;
    case "open":
    case "reveal":
      return <QuestionScreen view={view} send={send} />;
    case "leaderboard":
      return <Leaderboard view={view} send={send} />;
    case "podium":
      return <Podium view={view} send={send} />;
  }
}

const HILL_LABELS: Record<HillSetting, string> = { random: "🎲 Random", low: "Low", medium: "Medium", high: "High" };

function PlayerChip({ p, send }: { p: HostPlayer; send: Send }) {
  return (
    <button
      class={`chip ${p.connected ? "" : "offline"}`}
      title="Click to remove"
      onClick={() => confirm(`Remove ${p.nickname} from the game?`) && send({ type: "host.kick", playerId: p.id })}
    >
      <Avatar choice={p.avatar} />
      {p.nickname}
    </button>
  );
}

function Lobby({ view, send }: { view: GameView; send: Send }) {
  const { join } = view;
  const connected = view.players.length;
  const tower = view.mode === "tower";
  return (
    <main class="lobby">
      <section class="join-panel">
        <div class="join-steps">
          <div class="step-label">Join on your phone</div>
          <div class="step">
            Scan the QR code or go to
            <div class="join-url">{join.url.replace(/^http:\/\//, "").replace(/\/$/, "")}</div>
          </div>
          <div class="wifi-note">Connect to the same Wi-Fi as this computer first.</div>
        </div>
        <div class="qr" dangerouslySetInnerHTML={{ __html: join.qrSvg }} aria-label={`QR code for ${join.url}`} role="img" />
        <details class="net">
          <summary>Network settings</summary>
          <label>
            Address shown to players
            <select value={join.address} onChange={(e) => send({ type: "host.setAddress", address: e.currentTarget.value })}>
              {join.addresses.map((a) => (
                <option key={a.address} value={a.address}>
                  {a.address} ({a.iface})
                </option>
              ))}
              {join.addresses.length === 0 && <option value={join.address}>{join.address}</option>}
            </select>
          </label>
          <p>
            If phones can't load the page, pick the address of the Wi-Fi/Ethernet adapter, and allow port {join.port} through the firewall.
          </p>
        </details>
      </section>
      <section class="players-panel">
        <div class="players-head">
          <h2>
            {connected} player{connected === 1 ? "" : "s"}
          </h2>
          <button class="btn primary start" disabled={connected === 0} onClick={() => send({ type: "host.start", pacing: view.pacing })}>
            Start
          </button>
        </div>
        <div class="game-options">
          <label class="opt">
            Game mode
            <select value={view.mode} onChange={(e) => send({ type: "host.setMode", mode: e.currentTarget.value as GameMode })}>
              <option value="classic">Classic</option>
              <option value="tower">🏗 Tallest Tower</option>
              <option value="submarine">🐟 Submarine Squad</option>
              <option value="fight">🏰 Tower Fight</option>
              <option value="robot">🤖 Robot Attack</option>
              <option value="land">🚩 Land Grab</option>
            </select>
          </label>
          {tower ? (
            <>
              <label class="opt">
                Teams
                <select value={view.tower.teams} onChange={(e) => send({ type: "host.setTower", teams: Number(e.currentTarget.value), minutes: view.tower.minutes })}>
                  {Array.from({ length: MAX_TEAMS }, (_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label class="opt">
                Time
                <select value={view.tower.minutes} onChange={(e) => send({ type: "host.setTower", teams: view.tower.teams, minutes: Number(e.currentTarget.value) })}>
                  {TOWER_MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </label>
              <label class="opt check" title={view.tower.teams < 2 ? "The monster needs 2 or more teams" : "Monster eggs appear at 1/3 and 2/3 of the game"}>
                <input
                  type="checkbox"
                  disabled={view.tower.teams < 2}
                  checked={view.tower.monster && view.tower.teams >= 2}
                  onChange={(e) => send({ type: "host.setTower", teams: view.tower.teams, minutes: view.tower.minutes, monster: e.currentTarget.checked })}
                />
                👾 Monster{view.tower.teams < 2 ? " (needs 2+ teams)" : ""}
              </label>
            </>
          ) : view.mode === "fight" ? (
            <>
              <label class="opt">
                Hill
                <select value={view.fight.hill} onChange={(e) => send({ type: "host.setFight", hill: e.currentTarget.value as HillSetting })}>
                  {HILL_SETTINGS.map((h) => (
                    <option key={h} value={h}>
                      {HILL_LABELS[h]}
                    </option>
                  ))}
                </select>
              </label>
              <span class="opt mode-hint">Red vs Blue: knock down the other team's tower. The game runs until a tower falls or you end it.</span>
            </>
          ) : view.mode === "land" ? (
            <>
              <label class="opt">
                Teams
                <select value={view.land.teams} onChange={(e) => send({ type: "host.setLand", teams: Number(e.currentTarget.value), minutes: view.land.minutes })}>
                  {Array.from({ length: MAX_TEAMS - LAND_MIN_TEAMS + 1 }, (_, i) => (
                    <option key={i} value={i + LAND_MIN_TEAMS}>
                      {i + LAND_MIN_TEAMS}
                    </option>
                  ))}
                </select>
              </label>
              <label class="opt">
                Time
                <select value={view.land.minutes} onChange={(e) => send({ type: "host.setLand", teams: view.land.teams, minutes: Number(e.currentTarget.value) })}>
                  {LAND_MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </label>
              <span class="opt mode-hint">Every 3 questions, correct answers become tiles. Surround land to capture it, and another team's starting point to knock them out.</span>
            </>
          ) : view.mode === "robot" ? (
            <span class="opt mode-hint">Answer questions to earn moves, then dodge the robot's lasers. Last one standing wins.</span>
          ) : view.mode === "submarine" ? (
            <span class="opt mode-hint">Everyone works together to outrun the anglerfish. The game ends when it catches you.</span>
          ) : (
            <>
              <label class="opt">
                Pacing
                <select value={view.pacing} onChange={(e) => send({ type: "host.setPacing", pacing: e.currentTarget.value as Pacing })}>
                  <option value="manual">Manual: I click Next</option>
                  <option value="auto">Auto-advance</option>
                </select>
              </label>
              <label class="opt check">
                <input
                  type="checkbox"
                  checked={view.shuffle.questions}
                  onChange={(e) => send({ type: "host.setShuffle", questions: e.currentTarget.checked, answers: view.shuffle.answers })}
                />
                Shuffle question order
              </label>
            </>
          )}
          <label class="opt check">
            <input
              type="checkbox"
              checked={view.shuffle.answers}
              onChange={(e) => send({ type: "host.setShuffle", questions: view.shuffle.questions, answers: e.currentTarget.checked })}
            />
            Shuffle answer positions
          </label>
        </div>
        {connected === 0 ? (
          <div class="waiting">Waiting for players…</div>
        ) : view.teams ? (
          <div class={`team-preview n${view.teams.length}`}>
            {view.teams.map((t) => (
              <section key={t.index} class="team-box" style={{ "--team": t.color }}>
                <h3>
                  Team {t.name} <span>{t.members.length}</span>
                </h3>
                <ul class="player-chips">
                  {t.members.map((p) => (
                    <li key={p.id}>
                      <PlayerChip p={p} send={send} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul class="player-chips">
            {view.players.map((p) => (
              <li key={p.id}>
                <PlayerChip p={p} send={send} />
              </li>
            ))}
          </ul>
        )}
        <p class="hint">
          {view.quiz.questionCount} questions · {view.teams ? "teams are filled in join order · " : ""}click a name to remove a player · Space to start
        </p>
      </section>
    </main>
  );
}

function Intro({ view, send }: { view: GameView; send: Send }) {
  const q = view.question!;
  return (
    <main class="intro" onClick={() => send({ type: "host.skip" })}>
      <div class="intro-num">Question {q.index + 1}</div>
      <h1 class="intro-text">{q.text}</h1>
      <div class="intro-bar">
        <div class="intro-fill" style={{ animationDuration: `${q.remainingMs}ms` }} key={q.index} />
      </div>
    </main>
  );
}

function QuestionScreen({ view, send }: { view: GameView; send: Send }) {
  const q = view.question!;
  const open = view.phase === "open";
  const secs = useCountdown(q.remainingMs, `${view.phase}:${q.index}`);
  const lastTick = useRef(-1);
  useEffect(() => {
    if (!open || secs === lastTick.current) return;
    lastTick.current = secs;
    if (secs > 0 && secs <= 5) play(secs <= 3 ? "tickHigh" : "tick");
  }, [secs, open]);

  const correct = new Set(view.correct ?? []);
  const counts = view.answerCounts ?? [];
  const maxCount = Math.max(1, ...counts);

  return (
    <main class={`question ${open ? "is-open" : "is-reveal"}`}>
      <h1 class="q-title">{q.text}</h1>
      <div class="q-middle">
        <div class="side">
          {open ? (
            <div class={`countdown ${secs <= 5 ? "urgent" : ""}`} style={{ "--p": String(secs / q.timeLimitSec) }}>
              <span>{secs}</span>
            </div>
          ) : (
            <div class="side-label">{view.answeredCount >= view.players.filter((p) => p.connected).length ? "Everyone answered!" : "Time's up"}</div>
          )}
        </div>
        <div class="center-media">
          {!open ? (
            <div class="bars" role="img" aria-label="Answer distribution">
              {q.options.map((_, i) => {
                const c = optionColor(q.type, i);
                return (
                  <div class="bar-col" key={i}>
                    <PickerAvatars avatars={view.answerAvatars?.[i] ?? []} dim={!correct.has(i)} />
                    <div class="bar-count">
                      {correct.has(i) && "✓ "}
                      {counts[i] ?? 0}
                    </div>
                    <div class={`bar opt-${c} ${correct.has(i) ? "" : "dim"}`} style={{ height: `${6 + ((counts[i] ?? 0) / maxCount) * 50}%` }} />
                    <div class={`bar-base opt-${c}`}>
                      <Shape index={c} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : q.image ? (
            <img class="q-image" src={`/${q.image}`} alt="" />
          ) : (
            <div class="no-image" />
          )}
        </div>
        <div class="side">
          <div class="answered">
            <div class="answered-n">{view.answeredCount}</div>
            <div class="answered-l">answer{view.answeredCount === 1 ? "" : "s"}</div>
          </div>
        </div>
      </div>
      <div class={`tiles n${q.options.length}`}>
        {q.options.map((text, i) => {
          const c = optionColor(q.type, i);
          const state = open ? "" : correct.has(i) ? "right" : "wrong";
          return (
            <div key={i} class={`tile opt-${c} ${state}`}>
              <Shape index={c} />
              <span class="tile-text">{text}</span>
              {state === "right" && <span class="tick">✓</span>}
            </div>
          );
        })}
      </div>
      <footer class="controls">
        {open ? (
          <button class="btn ghost" onClick={() => send({ type: "host.skip" })}>
            Skip (S)
          </button>
        ) : (
          <NextButton view={view} send={send} label={q.index + 1 >= q.total ? "Final results" : "Leaderboard"} />
        )}
      </footer>
    </main>
  );
}

function NextButton({ view, send, label }: { view: GameView; send: Send; label: string }) {
  return (
    <button class="btn primary next" onClick={() => send({ type: "host.next" })}>
      {label} {view.pacing === "auto" ? <span class="auto-note">(auto)</span> : "→"}
    </button>
  );
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
        <NextButton view={view} send={send} label="Next question" />
      </footer>
    </main>
  );
}

/** Avatars shown above each answer's bar (no names), in answer order; shrink as they crowd, overflow as "+N". */
const MAX_PICKER_AVATARS = 24;

function PickerAvatars({ avatars, dim }: { avatars: AvatarChoice[]; dim: boolean }) {
  if (avatars.length === 0) return <div class="pickers" />;
  const shown = avatars.slice(0, MAX_PICKER_AVATARS);
  const extra = avatars.length - shown.length;
  const size = avatars.length <= 4 ? "lg" : avatars.length <= 10 ? "md" : "sm";
  return (
    <div class={`pickers ${size} ${dim ? "dim" : ""}`}>
      {shown.map((a, k) => (
        <Avatar key={k} choice={a} class="picker" />
      ))}
      {extra > 0 && <span class="picker-more">+{extra}</span>}
    </div>
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

render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
  document.getElementById("app")!,
);
