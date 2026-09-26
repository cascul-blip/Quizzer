import { useEffect, useRef, useState } from "preact/hooks";
import { CATAPULT_X, LAUNCH_Y, MAX_PULL, launchVector, shotPos, simulate } from "../../shared/fight-physics.ts";
import { CORRECT_PER_DECISION, REPAIR_MS, TOWER_MAX_DAMAGE, type ClientMsg, type FightShot, type PlayerFightView } from "../../shared/protocol.ts";
import { AvatarSprite, Battlefield, HealthBar, ShotLayer, sy } from "../shared/fight-art.tsx";
import { useCountdown } from "../shared/ui.tsx";
import { Feedback, StreamQuestion } from "./tower.tsx";

type Send = (m: ClientMsg) => void;

/** Seconds of the arc shown while aiming: enough to read the angle, not enough to see where it lands. */
const PREVIEW_S = 0.45;
/** How far the loaded avatar is drawn back at full power, in field units. */
const PULL_DRAW = 55;
/** Rows of the repair wall, and whole bricks per row (odd rows are offset by half a brick). */
const WALL_ROWS = 12;
const WALL_COLS = 5;
/** After a repair finishes, the full wall stays this long while its bricks tumble away. */
const WALL_CLEAR_MS = 700;
const WALL_WASTED_MS = 1600;

/** Avatars are drawn bigger on the phone's small battlefield. */
const PHONE_SPRITE_R = 32;

/** Phone screen for Tower Fight: own questions at own pace; every 4 correct answers, attack or rebuild. */
export function FightPlayer({ view, send }: { view: PlayerFightView; send: Send }) {
  const secs = useCountdown(view.phaseRemainingMs, view.phase);
  const colors = view.teams.map((t) => t.color);

  // When a repair finishes, keep the full wall on screen briefly while it clears away.
  const [cleared, setCleared] = useState<{ seq: number; repaired: boolean } | null>(null);
  const prevState = useRef(view.state);
  useEffect(() => {
    const was = prevState.current;
    prevState.current = view.state;
    const done = view.lastRepair;
    if (was !== "repair" || view.state === "repair" || !done) return;
    setCleared(done);
    navigator.vibrate?.(done.repaired ? [60, 40, 120] : [40, 40, 40]);
    const t = setTimeout(() => setCleared(null), done.repaired ? WALL_CLEAR_MS : WALL_WASTED_MS);
    return () => clearTimeout(t);
  }, [view.state]);

  let body;
  if (view.phase === "countdown") {
    body = (
      <main class="center">
        <div class="team-badge big" style={{ background: view.team.color }}>
          Team {view.team.name}
        </div>
        <p class="muted">
          Answer questions to earn moves. Every {CORRECT_PER_DECISION} correct answers, attack the other tower or repair yours!
        </p>
        <div class="tower-count">{Math.max(1, secs)}</div>
      </main>
    );
  } else if (view.phase === "collapse") {
    const fallen = view.damage.findIndex((d) => d >= TOWER_MAX_DAMAGE);
    body = (
      <main class="fight-screen">
        <Battlefield spriteR={PHONE_SPRITE_R} terrain={view.terrain} damage={view.damage} colors={colors} collapsing={fallen} />
        <h1 class="fight-msg">{fallen === view.team.index ? "😱 Your tower is falling!" : `🎉 Team ${view.teams[fallen]?.name}'s tower is falling!`}</h1>
      </main>
    );
  } else if (view.phase === "podium") {
    body = <FightResult view={view} />;
  } else if (view.state === "repair") {
    body = <RepairWall color={view.team.color} repairMs={view.repairMs} />;
  } else if (cleared) {
    body = <RepairWall color={view.team.color} repairMs={0} done={cleared} />;
  } else if (view.state === "decide") {
    body = <DecideScreen view={view} send={send} />;
  } else if (view.state === "aim") {
    body = <AimScreen view={view} send={send} />;
  } else if (view.state === "watch" && view.shot) {
    body = <WatchScreen view={view} shot={view.shot} />;
  } else if (view.question) {
    body = <StreamQuestion question={view.question} onAnswer={(seq, option) => send({ type: "fight.answer", seq, option })} />;
  } else {
    body = (
      <main class="center">
        <div class="spinner" />
      </main>
    );
  }

  const [me, them] = [view.team.index, 1 - view.team.index];
  return (
    <div class="game fight-game" style={{ "--team": view.team.color }}>
      <header class="bar team-bar">
        <span class="name">{view.me.nickname}</span>
        {view.phase === "playing" && (
          <span class="blocks-meter" aria-label={`${view.towardDecision} of ${CORRECT_PER_DECISION} toward your next move`}>
            {Array.from({ length: CORRECT_PER_DECISION }, (_, i) => (
              <i key={i} class={i < view.towardDecision ? "full" : ""} />
            ))}
          </span>
        )}
        <span class="score">Team {view.team.name}</span>
      </header>
      {view.phase === "playing" && (
        <div class="fight-strip">
          <span>
            You <HealthBar damage={view.damage[me]!} color={view.teams[me]!.color} label="Your tower" />
          </span>
          <span>
            <HealthBar damage={view.damage[them]!} color={view.teams[them]!.color} label={`Team ${view.teams[them]!.name}'s tower`} /> {view.teams[them]!.name}
          </span>
        </div>
      )}
      {body}
      <Feedback feedback={view.feedback} rightText={view.state === "decide" || view.state === "aim" ? "⚔️ Your move!" : "Correct!"} />
    </div>
  );
}

function DecisionClock({ view }: { view: PlayerFightView }) {
  // The correct count doesn't change while choosing, so it keys this decision's countdown.
  const secs = useCountdown(view.decisionMs, `decision-${view.me.correct}`);
  return <div class={`fight-clock ${secs <= 3 ? "urgent" : ""}`}>{secs}</div>;
}

function DecideScreen({ view, send }: { view: PlayerFightView; send: Send }) {
  const [sent, setSent] = useState(false);
  // A teammate may repair the tower first; the server then refuses the rebuild and the tower view changes.
  const ownDamage = view.damage[view.team.index]!;
  useEffect(() => setSent(false), [ownDamage]);
  const choose = (action: "attack" | "rebuild") => {
    if (sent) return;
    setSent(true);
    navigator.vibrate?.(30);
    send({ type: "fight.choose", action });
  };
  return (
    <main class="fight-screen">
      <Battlefield spriteR={PHONE_SPRITE_R} terrain={view.terrain} damage={view.damage} colors={view.teams.map((t) => t.color)} />
      <div class="fight-head">
        <b>Your move!</b>
        <DecisionClock view={view} />
      </div>
      <div class="fight-choices">
        <button class="btn fight-choice attack" disabled={sent} onClick={() => choose("attack")}>
          <span class="big-icon">💥</span>Attack
          <small>Launch yourself at Team {view.teams[1 - view.team.index]!.name}'s tower</small>
        </button>
        {ownDamage > 0 && (
          <button class="btn fight-choice rebuild" disabled={sent} onClick={() => choose("rebuild")}>
            <span class="big-icon">🧱</span>Rebuild
            <small>Repair 1 damage on your tower</small>
          </button>
        )}
      </div>
    </main>
  );
}

/** Slingshot: press anywhere, pull back away from where you want to fly, let go to launch. */
function AimScreen({ view, send }: { view: PlayerFightView; send: Send }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [pull, setPull] = useState<{ dx: number; dy: number } | null>(null);
  const [fired, setFired] = useState(false);
  const team = view.team.index;

  /** Screen drag → field pull: full power at ~40% of the screen width. */
  const toPull = (e: PointerEvent) => {
    const s = start.current!;
    const fullPx = Math.max(90, (areaRef.current?.clientWidth ?? 360) * 0.4);
    const k = MAX_PULL / fullPx;
    return { dx: (e.clientX - s.x) * k, dy: -(e.clientY - s.y) * k };
  };

  const onDown = (e: PointerEvent) => {
    if (fired) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
    setPull({ dx: 0, dy: 0 });
  };
  const onMove = (e: PointerEvent) => {
    if (start.current && !fired) setPull(toPull(e));
  };
  const onUp = (e: PointerEvent) => {
    if (!start.current || fired) return;
    const p = toPull(e);
    start.current = null;
    if (launchVector(p.dx, p.dy)) {
      setFired(true);
      navigator.vibrate?.([20, 30, 60]);
      send({ type: "fight.fire", dx: p.dx, dy: p.dy });
    } else {
      setPull(null);
    }
  };

  const v = pull ? launchVector(pull.dx, pull.dy) : null;
  const len = pull ? Math.hypot(pull.dx, pull.dy) : 0;
  const power = Math.round((Math.min(len, MAX_PULL) / MAX_PULL) * 100);
  const cx = CATAPULT_X[team]!;
  const back = pull && len > 0 ? { x: cx + (pull.dx / len) * (Math.min(len, MAX_PULL) / MAX_PULL) * PULL_DRAW, y: LAUNCH_Y + (pull.dy / len) * (Math.min(len, MAX_PULL) / MAX_PULL) * PULL_DRAW } : null;
  const dots = [];
  if (v) {
    const flightMs = simulate(view.terrain, team, v.vx, v.vy).durationMs;
    for (let t = 0.05; t <= PREVIEW_S && t * 1000 < flightMs; t += 0.05) {
      const q = shotPos(team, v.vx, v.vy, t);
      dots.push(<circle key={t} cx={q.x} cy={sy(q.y)} r={7} fill="#fff" stroke="#1f1633" stroke-width="2" opacity={1 - t / (PREVIEW_S * 1.3)} />);
    }
  }

  return (
    <main class="fight-screen aim" ref={areaRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => ((start.current = null), setPull(null))}>
      <Battlefield spriteR={PHONE_SPRITE_R} terrain={view.terrain} damage={view.damage} colors={view.teams.map((t) => t.color)} loaded={team === 0 ? [back ? null : view.me.avatar, null] : [null, back ? null : view.me.avatar]}>
        {back && (
          <>
            <line x1={cx - 12} y1={sy(LAUNCH_Y) - 4} x2={back.x} y2={sy(back.y)} stroke="#3b2412" stroke-width="4" />
            <line x1={cx + 12} y1={sy(LAUNCH_Y) - 4} x2={back.x} y2={sy(back.y)} stroke="#3b2412" stroke-width="4" />
            <AvatarSprite choice={view.me.avatar} x={back.x} y={back.y} r={PHONE_SPRITE_R} />
          </>
        )}
        {dots}
      </Battlefield>
      <div class="fight-head">
        <b>{fired ? "Launching…" : pull ? (v ? `Power ${power}%` : "Pull further back…") : "Drag back to aim, let go to fire!"}</b>
      </div>
      <p class="muted small fight-tip">Pull away from the target, like a slingshot. A longer pull throws harder.</p>
    </main>
  );
}

/**
 * Rebuilding: bricks stack up row by row until the wall fills the screen,
 * a progress bar for the repair. When done, the bricks tumble away.
 */
function RepairWall({ color, repairMs, done }: { color: string; repairMs: number; done?: { repaired: boolean } }) {
  // The end time is set when the wall appears, relative to this phone's clock.
  const endAt = useRef(performance.now() + repairMs);
  const [progress, setProgress] = useState(done ? 1 : 1 - repairMs / REPAIR_MS);
  const rowsBuzzed = useRef(0);
  useEffect(() => {
    if (done) return;
    let raf = 0;
    const loop = (t: number) => {
      const p = Math.min(1, Math.max(0, 1 - (endAt.current - t) / REPAIR_MS));
      setProgress(p);
      const rows = Math.floor(p * WALL_ROWS);
      if (rows > rowsBuzzed.current) {
        rowsBuzzed.current = rows;
        navigator.vibrate?.(15);
      }
      if (p < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [!!done]);

  // Offset rows start and end with half bricks, like a real wall: one more piece per row.
  const piecesIn = (r: number) => WALL_COLS + (r % 2);
  const total = Array.from({ length: WALL_ROWS }, (_, r) => piecesIn(r)).reduce((a, b) => a + b, 0);
  const shown = done ? total : Math.min(total, Math.floor(progress * total + 1e-6));
  const rows = [];
  let i = 0;
  for (let r = 0; r < WALL_ROWS; r++) {
    const bricks = [];
    const n = piecesIn(r);
    for (let c = 0; c < n; c++, i++) {
      if (i >= shown) break;
      const half = r % 2 === 1 && (c === 0 || c === n - 1);
      bricks.push(<i key={c} class={`brick ${half ? "half" : ""}`} style={done ? { animationDelay: `${(i % 7) * 25}ms` } : undefined} />);
    }
    rows.push(
      <div key={r} class={`wall-row ${r % 2 ? "offset" : ""}`}>
        {bricks}
      </div>,
    );
  }
  const label = !done ? `🧱 Repairing your tower… ${Math.round(progress * 100)}%` : done.repaired ? "✓ Tower repaired!" : "Already repaired by a teammate";
  return (
    <main class={`repair-wall ${done ? "clearing" : ""}`} style={{ "--team": color }}>
      <div class="wall" aria-hidden="true">
        {rows}
      </div>
      <div class="wall-label" role="status">
        {label}
      </div>
    </main>
  );
}

function WatchScreen({ view, shot }: { view: PlayerFightView; shot: FightShot }) {
  const [landed, setLanded] = useState<number | null>(null);
  const i = shot.impact;
  const msg =
    i.kind === "tower"
      ? i.team === view.team.index
        ? "😬 Oops! You hit your own tower"
        : `💥 Direct hit on Team ${view.teams[i.team]!.name}'s tower!`
      : i.kind === "ground"
        ? "💨 Missed! You left a crater in the hill"
        : "🌪 Whoosh… right off the map";
  return (
    <main class="fight-screen">
      <Battlefield spriteR={PHONE_SPRITE_R} terrain={view.terrain} damage={view.damage} colors={view.teams.map((t) => t.color)}>
        <ShotLayer
          shots={[shot]}
          spriteR={PHONE_SPRITE_R}
          onLand={(s) => {
            setLanded(s.id);
            navigator.vibrate?.(i.kind === "tower" ? [80, 40, 160] : 40);
          }}
        />
      </Battlefield>
      <h1 class={`fight-msg ${landed === shot.id ? "shown" : ""}`}>{landed === shot.id ? msg : "Wheee!"}</h1>
    </main>
  );
}

function FightResult({ view }: { view: PlayerFightView }) {
  const r = view.result;
  if (!r) return null;
  const { winner, reason } = r.outcome;
  const won = winner === view.team.index;
  const title = winner === null ? "🤝 It's a draw!" : won ? "🏆 Victory!" : "Defeat";
  const why =
    reason === "destroyed"
      ? won
        ? `Your team knocked down Team ${view.teams[1 - view.team.index]!.name}'s tower!`
        : "Your tower was knocked down."
      : reason === "damage"
        ? won
          ? "Your tower took the least damage."
          : "Your tower took more damage."
        : reason === "correct"
          ? won
            ? "Equal damage, but your team answered more correctly."
            : "Equal damage, but the other team answered more correctly."
          : "Equal damage and equal correct answers.";
  return (
    <main class="center">
      <div class="team-badge big" style={{ background: view.team.color }}>
        Team {view.team.name}
      </div>
      <div class={`final-rank ${won ? "top" : ""}`}>{title}</div>
      <p class="muted">{why}</p>
      <p class="big-score">
        You: {view.me.correct} correct · {view.me.hits} hit{view.me.hits === 1 ? "" : "s"} · {view.me.rebuilds} rebuild{view.me.rebuilds === 1 ? "" : "s"}
      </p>
      {r.awards.map((a) => (
        <div key={a} class="award-chip">
          🏆 {a}
        </div>
      ))}
    </main>
  );
}
