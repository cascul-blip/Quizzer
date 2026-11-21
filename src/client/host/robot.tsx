import { useEffect, useRef, useState } from "preact/hooks";
import { ROBOT_LIVES, ROBOT_SHRINK_EVERY } from "../../shared/modes/robot.ts";
import type { HostView } from "../../shared/protocol.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import type { MusicCue } from "../shared/music/index.ts";
import { RobotArena } from "../shared/robot-art.tsx";
import { ROBOT_SKIN, SKIN_TEXT } from "../shared/robot-skin.ts";
import { attackerVoiceLines, attackVoiceLine, warningVoiceLine } from "../shared/robot-voice.ts";
import { SnowmanArena } from "../shared/snowman-art.tsx";
import { play } from "../shared/sounds.ts";
import { ordinal, useCountdown } from "../shared/ui.tsx";
import { preloadVoice, say } from "../shared/voice.ts";
import type { Send } from "./common.tsx";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen } from "./common.tsx";
import { useDelayedCues } from "./delayed-cues.ts";
import type { LobbyModeEntry } from "./lobby-modes.tsx";
import { Award } from "./tower.tsx";

type RobotView = Extract<HostView, { kind: "robot" }>;

/** The seasonal skin picks the arena; the game is the same. */
const Arena = ROBOT_SKIN === "snowman" ? SnowmanArena : RobotArena;

/** Projector screen for Robot Attack: countdown → (quiz → move → attack)… → podium. */
export function RobotStage({ view, send }: { view: RobotView; send: Send }) {
  const secs = useCountdown(view.phaseRemainingMs, `${view.phase}-${view.round}`);
  const prev = useRef<RobotView | null>(null);
  useEffect(() => preloadVoice(attackerVoiceLines(ROBOT_SKIN)), []);
  const later = useDelayedCues(view.phase);

  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!p) return;
    if (view.phase !== p.phase) {
      if (view.phase === "quiz" && view.round === 1) play("start");
      if (view.phase === "move") play("tickHigh");
      if (view.phase === "attack") {
        if (ROBOT_SKIN === "snowman")
          later(() => play("whoosh"), 800); // as the claws hit the board
        else play("laser");
        // One verdict per attack, once it has hit: someone out, then anyone hit, else everyone dodged.
        const line = attackVoiceLine(view.lastAttack, ROBOT_SKIN);
        if (line) later(() => void say(line), 1000);
      }
      if (view.phase === "podium") play("fanfare");
    }
    if (view.marked.length > 0 && p.marked.length === 0 && view.phase === "quiz") {
      play("alarm");
      // The attacker speaks once the alarm has sounded.
      later(() => void say(warningVoiceLine(ROBOT_SKIN)), 650);
    }
  }, [view]);

  // The last seconds of movement tick down.
  useEffect(() => {
    if (view.phase === "move" && secs > 0 && secs <= 3) play("tick");
  }, [secs, view.phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const alive = view.players.filter((p) => !p.out);
  const attack = view.phase === "attack" && view.lastAttack ? view.lastAttack : null;

  return (
    <div class="stage robot-stage">
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        <div class="pill">{SKIN_TEXT.emoji} Robot Attack</div>
        {view.round > 0 && <div class="pill">Round {view.round}</div>}
        <div class="spacer" />
        <div class="pill">
          ❤️ {alive.length} / {view.playerCount}
        </div>
        <ScreenControls voice join={view.join} />
        {view.phase !== "podium" && (
          <button
            class="btn ghost small"
            onClick={() => confirm("End the game now? Players still standing are ranked by lives left.") && send({ type: "host.end" })}
          >
            End game
          </button>
        )}
      </header>
      {view.phase === "podium" ? (
        <RobotPodium view={view} send={send} />
      ) : (
        <>
          <PhaseBar view={view} secs={secs} />
          <main class={`robot-wrap ${attack ? "shake" : ""}`}>
            <Arena players={alive} marked={view.marked} inset={view.inset} collapsing={view.collapsing} attack={attack} />
            <PlayerList view={view} />
            {attack && (
              <AttackBanner
                key={attack.seq}
                hit={attack.hit.length}
                out={attack.eliminated.length}
                names={view.players.filter((p) => attack.eliminated.includes(p.id)).map((p) => p.nickname)}
              />
            )}
            {view.phase === "countdown" && (
              <div class="countdown-overlay">
                <div class="countdown-label">
                  Answer questions on your phone to earn moves.
                  <br />
                  When the targets appear, get ready to run!
                  <br />
                  Every {ROBOT_SHRINK_EVERY} rounds, the outer ring of the board is destroyed.
                </div>
                <div class="countdown-num" key={secs}>
                  {Math.max(1, secs)}
                </div>
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}

/** The red bar across the top drains over each phase, with what to do right now. */
function PhaseBar({ view, secs }: { view: RobotView; secs: number }) {
  // Catch up once, when the phase starts. Updating the delay on every snapshot would
  // count the time already animated twice and empty the bar early.
  const key = `${view.phase}-${view.round}`;
  const start = useRef<{ key: string; elapsed: number } | null>(null);
  if (!start.current || start.current.key !== key) start.current = { key, elapsed: Math.max(0, view.phaseDurationMs - view.phaseRemainingMs) };
  const elapsed = start.current.elapsed;
  const label =
    view.phase === "countdown"
      ? "Get ready…"
      : view.phase === "quiz"
        ? view.marked.length > 0
          ? view.collapsing.length > 0
            ? `⚠ Targets locked, and the outer ring is collapsing! · ${secs}s`
            : `⚠ Targets locked! Plan your escape · ${secs}s`
          : `Answer questions to earn moves · ${secs}s`
        : view.phase === "move"
          ? `🏃 MOVE! · ${secs}s`
          : SKIN_TEXT.banner;
  return (
    <div class={`robot-bar ${view.phase} ${view.marked.length > 0 && view.phase === "quiz" ? "warn" : ""}`}>
      {/* The key restarts the drain animation each phase; a negative delay catches up with time already passed. */}
      <div key={key} class="robot-bar-fill" style={{ animationDuration: `${view.phaseDurationMs}ms`, animationDelay: `-${elapsed}ms` }} />
      <div class="robot-bar-label">{label}</div>
    </div>
  );
}

function Hearts({ lives }: { lives: number }) {
  return (
    <span class="hearts" aria-label={`${lives} lives`}>
      {Array.from({ length: ROBOT_LIVES }, (_, i) => (
        <i key={i} class={i < lives ? "full" : ""}>
          ♥
        </i>
      ))}
    </span>
  );
}

function PlayerList({ view }: { view: RobotView }) {
  const players = [...view.players].sort((a, b) => Number(a.out) - Number(b.out) || b.lives - a.lives || a.nickname.localeCompare(b.nickname));
  const zapped = new Set(view.phase === "attack" ? (view.lastAttack?.hit ?? []) : []);
  return (
    <section class="robot-players">
      <ul>
        {players.map((p) => (
          <li key={p.id} class={`${p.out ? "out" : ""} ${p.connected ? "" : "offline"} ${zapped.has(p.id) ? "zapped" : ""}`}>
            <Avatar choice={p.avatar} />
            <span class="n">{p.nickname}</span>
            {p.out ? <span class="ko">💀</span> : <Hearts lives={p.lives} />}
            {!p.out && (view.phase === "quiz" || view.phase === "move") && <span class="pts">⚡{p.points}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AttackBanner({ hit, out, names }: { hit: number; out: number; names: string[] }) {
  return (
    <div class="robot-banner" role="status">
      {hit === 0 ? "😅 Everyone dodged!" : `💥 ${hit} player${hit === 1 ? "" : "s"} hit`}
      {out > 0 && <div class="robot-banner-out">💀 Out: {names.join(", ")}</div>}
    </div>
  );
}

function RobotPodium({ view, send }: { view: RobotView; send: Send }) {
  const [showErrors, setShowErrors] = useState(false);
  const standings = view.standings ?? [];
  const winners = standings.filter((s) => s.rank === 1);
  const a = view.awards;
  const title =
    winners.length === 0 ? "Game over" : winners.length === 1 ? `🏆 ${winners[0]!.nickname} wins!` : `🏆 ${winners.map((w) => w.nickname).join(" & ")} win!`;
  return (
    <main class="podium tower-podium robot-podium">
      <div class="podium-bg" aria-hidden="true">
        <Arena players={[]} marked={[]} />
      </div>
      <h1>{title}</h1>
      {showErrors ? (
        <ErrorsTable errors={view.errors ?? []} />
      ) : (
        <>
          <ol class="robot-standings">
            {standings.slice(0, Math.max(5, winners.length)).map((s, i) => (
              <li key={s.id} class={s.rank === 1 ? "won" : ""} style={{ animationDelay: `${i * 80}ms` }}>
                <span class="lb-rank">{ordinal(s.rank)}</span>
                <Avatar choice={s.avatar} />
                <span class="lb-name">{s.nickname}</span>
                <span class="robot-status">{s.outRound === null ? <Hearts lives={s.lives} /> : `Out in round ${s.outRound}`}</span>
              </li>
            ))}
          </ol>
          <div class="awards">
            <Award icon="✅" title="Most correct answers" award={a?.mostCorrect ?? null} unit="correct" />
            <Award icon="👟" title="Fancy footwork" award={a?.mostMoves ?? null} unit="moves" />
          </div>
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

// ---------- lobby ----------

/** Robot Attack has no mode settings; the lobby shows how it plays. */
function RobotSettings() {
  return <span class="opt mode-hint">Answer questions to earn moves, then dodge the robot's lasers. Last one standing wins.</span>;
}

/** The projector's music for Robot Attack. */
export function robotCue(view: RobotView): MusicCue {
  if (view.phase === "podium") return { track: "robot-results" };
  if (view.phase === "move" || view.phase === "attack") return { track: "robot-move" };
  if (view.phase === "quiz") {
    // The less time left to answer, the more intense.
    const start = Math.max(0, Math.min(1, 1 - view.phaseRemainingMs / Math.max(1, view.phaseDurationMs)));
    return { track: "robot-quiz", intensity: 0.2 + start * 0.8, rampTo: 1, rampMs: view.phaseRemainingMs, key: `robot-q${view.round}` };
  }
  return { track: "robot-quiz", intensity: 0, key: "robot-countdown" };
}

export const robotLobby: LobbyModeEntry<"robot"> = {
  label: () => "🤖 Robot Attack",
  Settings: RobotSettings,
  lobbyTrack: () => "robot-lobby",
};
