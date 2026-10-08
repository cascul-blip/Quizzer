import { useEffect, useRef } from "preact/hooks";
import { ROBOT_BOARD, ROBOT_LIVES, robotInBounds, type ClientMsg, type PlayerRobotView, type RobotDir } from "../../shared/protocol.ts";
import { MiniBoard } from "../shared/robot-art.tsx";
import { ordinal, useCountdown } from "../shared/ui.tsx";
import { Feedback, StreamQuestion } from "./tower.tsx";

type Send = (m: ClientMsg) => void;

const ARROW_KEYS: Record<string, RobotDir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
const STEP: Record<RobotDir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** Phone screen for Robot Attack: questions during the quiz phase, arrows during movement. */
export function RobotPlayer({ view, send }: { view: PlayerRobotView; send: Send }) {
  const secs = useCountdown(view.phaseRemainingMs, `${view.phase}-${view.round}`);

  let body;
  if (view.phase === "countdown") {
    body = (
      <main class="center">
        <div class="robot-emoji">🤖</div>
        <p class="muted">Answer questions to earn moves. When it's time to move, get off the red Xs before the robot fires!</p>
        <div class="tower-count">{Math.max(1, secs)}</div>
      </main>
    );
  } else if (view.phase === "podium") {
    body = <RobotResult view={view} />;
  } else if (view.phase === "quiz") {
    body = view.question ? (
      <StreamQuestion question={view.question} onAnswer={(seq, option) => send({ type: "robot.answer", seq, option })} />
    ) : (
      <main class="center">
        <div class="spinner" />
      </main>
    );
  } else if (view.phase === "move") {
    body = <MoveScreen view={view} secs={secs} send={send} />;
  } else {
    body = <AttackScreen view={view} />;
  }

  return (
    <div class={`game robot-game ${view.phase === "move" || view.phase === "attack" ? "fit-screen" : ""}`}>
      <header class="bar">
        <span class="name">{view.me.nickname}</span>
        {view.me.out ? (
          <span class="robot-out-tag">💀 Out</span>
        ) : (
          <span class="robot-stats">
            <Hearts lives={view.me.lives} />
            <span class="robot-points" aria-label={`${view.me.points} moves`}>
              ⚡{view.me.points}
            </span>
          </span>
        )}
      </header>
      {body}
      <Feedback feedback={view.feedback} rightText={view.me.out ? "Correct!" : "+1 move ⚡"} />
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

function MoveScreen({ view, secs, send }: { view: PlayerRobotView; secs: number; send: Send }) {
  const board = view.board;
  const tile = view.me.y * ROBOT_BOARD + view.me.x;
  const onTarget = !!board && board.marked.includes(tile);
  const onCollapse = !!board && board.collapsing.includes(tile);
  const canMove = !view.me.out && view.me.points > 0;
  // Another player or the edge of the board is in the way (the server has the final say).
  const blocked = (dir: RobotDir) => {
    const x = view.me.x + STEP[dir][0];
    const y = view.me.y + STEP[dir][1];
    return !robotInBounds(x, y, board?.inset ?? 0) || !!board?.others.some((o) => o.x === x && o.y === y);
  };
  const move = (dir: RobotDir) => {
    if (!canMove || blocked(dir)) return;
    navigator.vibrate?.(15);
    send({ type: "robot.move", dir });
  };
  // Arrow keys work too (handy when playing from a laptop).
  const moveRef = useRef(move);
  moveRef.current = move;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = ARROW_KEYS[e.key];
      if (!dir) return;
      e.preventDefault();
      moveRef.current(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const status = view.me.out
    ? "💀 You're out. Watch the robot!"
    : onCollapse
      ? view.me.points > 0
        ? "⚠ This tile is about to collapse. Move!"
        : "⚠ This tile is about to collapse, and no moves left!"
      : onTarget
        ? view.me.points > 0
          ? "⚠ You're on a red X. Move!"
          : "⚠ On a red X, and no moves left!"
        : "✓ Safe here";
  return (
    <main class="robot-move">
      <div class="robot-move-head">
        <b class={onTarget && !view.me.out ? "danger" : ""}>{status}</b>
        <span class={`robot-clock ${secs <= 3 ? "urgent" : ""}`}>{secs}</span>
      </div>
      {board && <MiniBoard me={view.me} others={board.others} marked={board.marked} inset={board.inset} collapsing={board.collapsing} avatar={view.me.avatar} />}
      {!view.me.out && (
        <>
          <div class="robot-moves-left">
            {view.me.points > 0 ? (
              <>
                <b>{view.me.points}</b> move{view.me.points === 1 ? "" : "s"} left
              </>
            ) : (
              "No moves left"
            )}
          </div>
          <div class="dpad">
            <button class="btn dpad-btn up" disabled={!canMove || blocked("up")} onClick={() => move("up")} aria-label="Up">
              ▲
            </button>
            <button class="btn dpad-btn left" disabled={!canMove || blocked("left")} onClick={() => move("left")} aria-label="Left">
              ◀
            </button>
            <button class="btn dpad-btn right" disabled={!canMove || blocked("right")} onClick={() => move("right")} aria-label="Right">
              ▶
            </button>
            <button class="btn dpad-btn down" disabled={!canMove || blocked("down")} onClick={() => move("down")} aria-label="Down">
              ▼
            </button>
          </div>
        </>
      )}
    </main>
  );
}

function AttackScreen({ view }: { view: PlayerRobotView }) {
  const a = view.lastAttack;
  const seen = useRef(-1);
  useEffect(() => {
    if (!a || a.seq === seen.current) return;
    seen.current = a.seq;
    if (a.hit) navigator.vibrate?.(a.eliminated ? [300, 100, 300] : [200, 80, 120]);
  }, [a?.seq]);
  const [icon, text] = !a || (view.me.out && !a.eliminated) ? ["🔥", "The robot fires!"] : a.eliminated ? ["💀", "Zapped! You're out of lives"] : a.hit ? ["💥", "Hit! −1 ♥"] : ["😅", "Safe!"];
  return (
    <main class={`robot-attack ${a?.hit ? "hit" : "safe"}`}>
      <div class="robot-attack-icon">{icon}</div>
      <h1>{text}</h1>
      {a?.eliminated && <p class="muted">You can keep answering questions for fun.</p>}
      {view.board && <MiniBoard me={view.me} others={view.board.others} marked={view.board.marked} inset={view.board.inset} collapsing={view.board.collapsing} avatar={view.me.avatar} zapped={a?.hit} />}
    </main>
  );
}

function RobotResult({ view }: { view: PlayerRobotView }) {
  const r = view.result;
  if (!r) return null;
  return (
    <main class="center">
      <div class="robot-emoji">{r.won ? "🏆" : "🤖"}</div>
      <div class={`final-rank ${r.won ? "top" : ""}`}>{r.won ? "You win!" : `${ordinal(r.rank)} of ${r.playerCount}`}</div>
      <p class="muted">{r.outRound === null ? (r.won ? "You outlasted the robot!" : "You survived to the end.") : `Knocked out in round ${r.outRound}.`}</p>
      <p class="big-score">{view.me.correct} correct</p>
      {r.awards.map((a) => (
        <div key={a} class="award-chip">
          🏆 {a}
        </div>
      ))}
    </main>
  );
}
