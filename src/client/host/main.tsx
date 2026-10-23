import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { BOMB_MAX_SQUADS, BOMB_MINUTES, BOMB_MODULES, BOMB_PENALTIES, BOMB_WIRES, CUP_MAX_CUPS, CUP_MIN_CUPS, DRAGON_BATTLE_MINUTES, DRAGON_FIRE_SECONDS, DRAGON_MIN_TEAMS, DRAGON_SCRAMBLE_MINUTES, DRAGON_TOUGHNESS, HILL_SETTINGS, type BombSettings, type BombStyle, type DragonSettings, type DragonToughness, LAND_MINUTES, LAND_MIN_TEAMS, MAX_TEAMS, TOWER_MINUTES, type GameMode, type HillSetting, type HostPlayer, type HostView, type Pacing, type ServerMsg } from "../../shared/protocol.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { SIEGE_WAVE_CHOICES } from "../../shared/siege-rules.ts";
import type { QuizSummary } from "../../shared/quiz-schema.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import { Dragon } from "../shared/dragon-art.tsx";
import { play, unlockAudio } from "../shared/sounds.ts";
import { connect, type ConnStatus } from "../shared/ws.ts";
import { ConnBanner, ErrorBoundary, Shape, StreakBadge, Toast, optionColor, ordinal, teamVars, useCountdown } from "../shared/ui.tsx";
import { loadCustomMusic, useMusic } from "../shared/music/index.ts";
import { PinBoard, PinNote } from "../shared/pin.tsx";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen, type Send } from "./common.tsx";
import { musicFor } from "./music-cues.ts";
import { FightStage } from "./fight.tsx";
import { LandStage } from "./land.tsx";
import { RacerStage } from "./racer.tsx";
import { CupStage } from "./cup.tsx";
import { DragonStage } from "./dragon.tsx";
import { BombLobbyPreview, BombStage } from "./bomb.tsx";
import { SiegeLobbyPreview, SiegeStage } from "./siege.tsx";
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
  } else if (view.kind === "racer") {
    body = <RacerStage view={view} send={send} />;
  } else if (view.kind === "cup") {
    body = <CupStage view={view} send={send} />;
  } else if (view.kind === "dragon") {
    body = <DragonStage view={view} send={send} />;
  } else if (view.kind === "bomb") {
    body = <BombStage view={view} send={send} />;
  } else if (view.kind === "siege") {
    body = <SiegeStage view={view} send={send} />;
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
          const raceWait = view.mode === "bomb" && view.bomb.game === "race" && view.players.length < 2;
          if (view.players.length > 0 && !raceWait) send({ type: "host.start", pacing: view.pacing });
        } else if (view.phase !== "podium") send({ type: "host.next" });
      } else if (e.key === "s" || e.key === "S") {
        if (view.phase === "open" || view.phase === "intro") send({ type: "host.skip" });
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view.phase, view.players.length, view.pacing, view.mode, view.bomb.game, view.bomb.squads]);

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
        <ScreenControls join={view.phase === "lobby" ? undefined : view.join} />
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

function PlayerChip({ p, send, draggable }: { p: HostPlayer; send: Send; draggable?: boolean }) {
  return (
    <button
      class={`chip ${p.connected ? "" : "offline"}`}
      title={draggable ? "Drag to another team · click to remove" : "Click to remove"}
      draggable={draggable}
      onDragStart={(e) => {
        if (!e.dataTransfer) return;
        e.dataTransfer.setData("text/plain", p.id);
        e.dataTransfer.effectAllowed = "move";
        e.currentTarget.classList.add("dragging");
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove("dragging")}
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
  const [dragOver, setDragOver] = useState<number | null>(null);
  const canDrag = (view.teams?.length ?? 0) > 1;
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
          <button
            class="btn primary start"
            disabled={connected === 0 || (view.mode === "bomb" && view.bomb.game === "race" && connected < 2)}
            title={view.mode === "bomb" && view.bomb.game === "race" && connected < 2 ? "Race needs at least 2 players" : undefined}
            onClick={() => send({ type: "host.start", pacing: view.pacing })}
          >
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
              <option value="racer">🏎 Racer</option>
              <option value="cup">☠️ Cup of Death</option>
              <option value="dragon">🐉 Dragon's Hoard</option>
              <option value="bomb">💣 Bomb Squad</option>
              <option value="siege">🛡️ Kingdom Siege</option>
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
              <label class="opt check" title={view.tower.teams < 2 ? "The monster needs 2 or more teams" : "Monster eggs appear 4 times per game"}>
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
          ) : view.mode === "cup" ? (
            <>
              <label class="opt">
                Cups
                <select value={view.cup.cups} onChange={(e) => send({ type: "host.setCup", cups: Number(e.currentTarget.value) })}>
                  {Array.from({ length: CUP_MAX_CUPS - CUP_MIN_CUPS + 1 }, (_, i) => (
                    <option key={i} value={i + CUP_MIN_CUPS}>
                      {i + CUP_MIN_CUPS}
                    </option>
                  ))}
                </select>
              </label>
              <span class="opt mode-hint">Roll the die, then answer that many questions before time runs out, or drink from a cup. One is poisoned. Last one standing wins.</span>
            </>
          ) : view.mode === "dragon" ? (
            <DragonOptions view={view} send={send} />
          ) : view.mode === "bomb" ? (
            <BombOptions view={view} send={send} />
          ) : view.mode === "siege" ? (
            <>
              <label class="opt">
                Waves
                <select value={String(view.siege.waves)} onChange={(e) => send({ type: "host.setSiege", waves: e.currentTarget.value === "endless" ? "endless" : (Number(e.currentTarget.value) as 5 | 10) })}>
                  {SIEGE_WAVE_CHOICES.map((w) => (
                    <option key={w} value={String(w)}>
                      {w === "endless" ? "♾ Endless" : `${w} waves`}
                    </option>
                  ))}
                </select>
              </label>
              <span class="opt mode-hint">The whole class defends one castle. Every right answer earns you gold to spend on archers, knights and stone walls before the monsters reach the wall.</span>
            </>
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
              {view.mode === "racer" && <span class="opt mode-hint">One car for the whole class. Each turn a driver bets on how well everyone will answer.</span>}
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
          {(view.mode === "tower" || view.mode === "submarine" || view.mode === "fight" || view.mode === "robot" || view.mode === "cup" || view.mode === "dragon" || view.mode === "siege") && (
            <label class="opt check" title="Wrong answers in a row make a player wait longer before the next question">
              <input type="checkbox" checked={view.protect} onChange={(e) => send({ type: "host.setProtect", on: e.currentTarget.checked })} />
              Protect from abuse
            </label>
          )}
        </div>
        {view.mode === "dragon" && (
          <div class="dragon-lobby-lair" aria-hidden="true">
            <Dragon stage={0} asleep class="asleep" />
          </div>
        )}
        {view.mode === "bomb" && <BombLobbyPreview settings={view.bomb} />}
        {view.mode === "siege" && <SiegeLobbyPreview />}
        {connected === 0 ? (
          <div class="waiting">Waiting for players…</div>
        ) : view.teams ? (
          <div class={`team-preview n${view.teams.length}`}>
            {view.teams.map((t) => (
              <section
                key={t.index}
                class={`team-box ${dragOver === t.index ? "drop-target" : ""}`}
                style={teamVars(t.color)}
                {...(canDrag && {
                  onDragOver: (e: DragEvent) => {
                    e.preventDefault();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                    setDragOver(t.index);
                  },
                  onDragLeave: (e: DragEvent) => {
                    if (!(e.currentTarget as Element).contains(e.relatedTarget as Node | null)) setDragOver(null);
                  },
                  onDrop: (e: DragEvent) => {
                    e.preventDefault();
                    const playerId = e.dataTransfer?.getData("text/plain");
                    setDragOver(null);
                    if (playerId && !t.members.some((p) => p.id === playerId)) send({ type: "host.setTeam", playerId, team: t.index });
                  },
                })}
              >
                <h3>
                  Team {t.name} <span>{t.members.length}</span>
                </h3>
                <ul class="player-chips">
                  {t.members.map((p) => (
                    <li key={p.id}>
                      <PlayerChip p={p} send={send} draggable={canDrag} />
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
          {view.quiz.questionCount} questions · {canDrag ? "drag a name to move it to another team · " : ""}click a name to remove a player · Space to start
        </p>
      </section>
    </main>
  );
}

const TOUGHNESS_LABELS: Record<DragonToughness, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

function DragonOptions({ view, send }: { view: GameView; send: Send }) {
  const d = view.dragon;
  const set = (change: Partial<DragonSettings>) => send({ type: "host.setDragon", ...d, ...change });
  return (
    <>
      <label class="opt" title="Never more teams than players">
        Teams
        <select value={d.teams} onChange={(e) => set({ teams: Number(e.currentTarget.value) })}>
          {Array.from({ length: MAX_TEAMS - DRAGON_MIN_TEAMS + 1 }, (_, i) => (
            <option key={i} value={i + DRAGON_MIN_TEAMS}>
              {i + DRAGON_MIN_TEAMS}
            </option>
          ))}
        </select>
      </label>
      <label class="opt">
        Dragon toughness
        <select value={d.toughness} onChange={(e) => set({ toughness: e.currentTarget.value as DragonToughness })}>
          {DRAGON_TOUGHNESS.map((t) => (
            <option key={t} value={t}>
              {TOUGHNESS_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <label class="opt">
        Battle time
        <select value={d.battleMinutes} onChange={(e) => set({ battleMinutes: Number(e.currentTarget.value) })}>
          {DRAGON_BATTLE_MINUTES.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </label>
      <label class="opt">
        Fire breath
        <select value={d.fireSec} onChange={(e) => set({ fireSec: Number(e.currentTarget.value) })}>
          {DRAGON_FIRE_SECONDS.map((s) => (
            <option key={s} value={s}>
              every {s} s
            </option>
          ))}
        </select>
      </label>
      <label class="opt">
        Scramble time
        <select value={d.scrambleMinutes} onChange={(e) => set({ scrambleMinutes: Number(e.currentTarget.value) })}>
          {DRAGON_SCRAMBLE_MINUTES.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </label>
      <span class="opt mode-hint">The whole class fights the dragon together, then the teams race to grab its hoard. Teams only matter after the dragon falls.</span>
    </>
  );
}

function BombOptions({ view, send }: { view: GameView; send: Send }) {
  const b = view.bomb;
  const set = (change: Partial<BombSettings>) => send({ type: "host.setBomb", ...b, ...change });
  const race = b.game === "race";
  const squadMin = race ? 2 : 1;
  return (
    <>
      <label class="opt">
        Game
        <select
          value={b.game}
          // The server raises Race to 2 squads itself, without counting it as a hand-picked number.
          onChange={(e) => set({ game: e.currentTarget.value as BombStyle })}
        >
          <option value="together">Together</option>
          <option value="race">Race</option>
        </select>
      </label>
      <label class="opt" title="The fewest squads that keep everyone at 6 or under, until you pick a number">
        Squads
        <select value={b.squads} onChange={(e) => set({ squads: Number(e.currentTarget.value) })}>
          {Array.from({ length: BOMB_MAX_SQUADS - squadMin + 1 }, (_, i) => (
            <option key={i} value={i + squadMin}>
              {i + squadMin}
            </option>
          ))}
        </select>
      </label>
      <label class="opt">
        Modules
        <select value={b.modules} onChange={(e) => set({ modules: Number(e.currentTarget.value) })}>
          {BOMB_MODULES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label class="opt">
        Wires
        <select value={b.wires} onChange={(e) => set({ wires: Number(e.currentTarget.value) })}>
          {BOMB_WIRES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label class="opt">
        Timer
        <select value={b.minutes} onChange={(e) => set({ minutes: Number(e.currentTarget.value) })}>
          {BOMB_MINUTES.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </label>
      <label class="opt">
        Wrong cut
        <select value={b.penaltySec} onChange={(e) => set({ penaltySec: Number(e.currentTarget.value) })}>
          {BOMB_PENALTIES.map((s) => (
            <option key={s} value={s}>
              −{s} s
            </option>
          ))}
        </select>
      </label>
      <span class="opt mode-hint">
        {race
          ? "Each squad has its own bomb and timer. First to clear their modules wins. Race needs at least 2 players."
          : "The class shares one bomb and one timer. Each squad clears its own modules."}{" "}
        Answers are split across the phones. Drag a name to move someone to another squad.
      </span>
    </>
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
  const pin = q.type === "pin" && q.image && q.spots ? { image: q.image, spots: q.spots } : null;

  return (
    <main class={`question ${open ? "is-open" : "is-reveal"} ${pin ? "is-pin" : ""}`}>
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
          {pin ? (
            <PinBoard image={pin.image} spots={pin.spots} labels={q.options} correct={open ? undefined : [...correct]} counts={open ? undefined : counts} />
          ) : !open && q.type !== "text" ? (
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
      {q.type === "text" && open && <p class="typing-note">Type your answer on your phone</p>}
      {pin ? (
        <PinNote open={open} labels={[...correct].map((i) => q.options[i]!)} />
      ) : (
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
      )}
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
