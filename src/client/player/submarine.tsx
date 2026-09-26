import { useEffect, useRef, useState } from "preact/hooks";
import { CORRECT_PER_BOOST, type ClientMsg, type PlayerSubView } from "../../shared/protocol.ts";
import { GlyphSymbol, oceanGradient } from "../shared/sea-art.tsx";
import { play, startRev, type Rev } from "../shared/sounds.ts";
import { useCountdown } from "../shared/ui.tsx";
import { Feedback, StreamQuestion } from "./tower.tsx";

type Send = (m: ClientMsg) => void;

/** Holding fills the charge in this long; letting go drains at half speed. */
const CHARGE_MS = 2000;
const DRAIN_MS = 4000;

/** After a boost fires, keep the boost screen up this long so lifting the finger can't tap the next answer. */
const AFTER_BOOST_MS = 1200;

/** Phone screen for Submarine Squad. */
export function SubPlayer({ view, send }: { view: PlayerSubView; send: Send }) {
  const secs = useCountdown(view.phaseRemainingMs, `${view.phase}:${view.level}`);
  const [afterBoost, setAfterBoost] = useState(false);
  const afterTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(afterTimer.current), []);
  const onBoost = () => {
    send({ type: "sub.boost" });
    setAfterBoost(true);
    clearTimeout(afterTimer.current);
    afterTimer.current = setTimeout(() => setAfterBoost(false), AFTER_BOOST_MS);
  };
  let body;
  if (view.phase === "countdown") {
    body = (
      <main class="center">
        <div class="sub-emoji">🐟💨🟡</div>
        <h1>Get ready!</h1>
        <p class="muted">Answer questions to earn boosts. Every {CORRECT_PER_BOOST} correct answers, hold the boost button to push the submarine away from the anglerfish!</p>
        <div class="tower-count">{Math.max(1, secs)}</div>
      </main>
    );
  } else if (view.phase === "escaped") {
    body = (
      <main class="center">
        <div class="sub-emoji">🎉</div>
        <h1>Level {view.level} cleared!</h1>
        <p class="muted">Get ready to dive. Listen for the instructors!</p>
      </main>
    );
  } else if (view.phase === "caught") {
    body = (
      <main class="center">
        <div class="sub-emoji">😱</div>
        <h1>CHOMP!</h1>
        <p class="muted">The anglerfish caught the submarine at {view.depth} m.</p>
      </main>
    );
  } else if (view.phase === "podium") {
    body = <SubResult view={view} />;
  } else if (view.phase === "dive") {
    body = <DiveScreen view={view} send={send} />;
  } else if (view.state === "boost" || afterBoost) {
    body = <BoostButton onBoost={onBoost} />;
  } else if (view.question) {
    body = <StreamQuestion question={view.question} onAnswer={(seq, option) => send({ type: "sub.answer", seq, option })} />;
  } else {
    body = (
      <main class="center">
        <div class="spinner" />
      </main>
    );
  }

  return (
    <div class="game sub-game" style={{ background: oceanGradient(view.depth) }}>
      <header class="bar sub-bar">
        <span class="name">{view.me.nickname}</span>
        {view.phase === "chase" && (
          <span class="blocks-meter boost-meter" aria-label={`${view.towardBoost} of ${CORRECT_PER_BOOST} toward a boost`}>
            {Array.from({ length: CORRECT_PER_BOOST }, (_, i) => (
              <i key={i} class={i < view.towardBoost || view.state === "boost" ? "full" : ""} />
            ))}
          </span>
        )}
        <span class="score">{view.depth} m</span>
      </header>
      {body}
      <Feedback feedback={view.feedback} rightText={view.state === "boost" ? "⚡ Boost ready!" : "Correct!"} />
    </div>
  );
}

/** Hold to charge (with a revving engine), release to let it drain; a full charge fires the boost. */
function BoostButton({ onBoost }: { onBoost: () => void }) {
  const [charge, setCharge] = useState(0);
  const [fired, setFired] = useState(false);
  const holding = useRef(false);
  const level = useRef(0);
  const rev = useRef<Rev | null>(null);
  const lastBuzz = useRef(0);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = t - last;
      last = t;
      if (!fired) {
        const next = holding.current ? level.current + dt / CHARGE_MS : level.current - dt / DRAIN_MS;
        level.current = Math.max(0, Math.min(1, next));
        rev.current?.set(level.current);
        if (holding.current && t - lastBuzz.current > 220) {
          lastBuzz.current = t;
          navigator.vibrate?.(12);
        }
        if (level.current >= 1) {
          setFired(true);
          holding.current = false;
          rev.current?.stop();
          rev.current = null;
          play("whoosh");
          navigator.vibrate?.([60, 30, 120]);
          onBoost();
        } else if (level.current === 0 && !holding.current && rev.current) {
          rev.current.stop();
          rev.current = null;
        }
        setCharge(level.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      rev.current?.stop();
    };
  }, [fired]);

  // If the server didn't take the boost (too early), let the player try again.
  useEffect(() => {
    if (!fired) return;
    const t = setTimeout(() => {
      level.current = 0;
      setFired(false);
    }, 1500);
    return () => clearTimeout(t);
  }, [fired]);

  const press = (e: PointerEvent) => {
    e.preventDefault();
    if (fired) return;
    holding.current = true;
    rev.current ??= startRev();
  };
  const release = () => {
    holding.current = false;
  };
  const r = 44;
  const circ = 2 * Math.PI * r;
  return (
    <main class="boost-screen">
      <h1>{fired ? "⚡ BOOST!" : "Boost ready!"}</h1>
      <p class="muted">{fired ? "The submarine surges ahead!" : "Hold the button until it's fully charged"}</p>
      <button
        class={`boost-button ${charge > 0 ? "charging" : ""} ${fired ? "fired" : ""}`}
        onPointerDown={press}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        onContextMenu={(e) => e.preventDefault()}
        style={{ "--charge": String(charge) }}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={r} class="ring-bg" />
          <circle cx="50" cy="50" r={r} class="ring" style={{ strokeDasharray: `${circ}`, strokeDashoffset: `${circ * (1 - charge)}` }} />
        </svg>
        <span class="boost-text">{fired ? "⚡" : charge > 0 ? `${Math.round(charge * 100)}%` : "HOLD"}</span>
      </button>
    </main>
  );
}

function DiveScreen({ view, send }: { view: PlayerSubView; send: Send }) {
  const dive = view.dive;
  const [, rerender] = useState(0);
  const lockedUntil = useRef(0);
  if (dive?.role === "diver" && dive.lockedMs > 0) lockedUntil.current = performance.now() + dive.lockedMs;
  const locked = performance.now() < lockedUntil.current;
  useEffect(() => {
    if (!locked) return;
    const t = setTimeout(() => rerender((n) => n + 1), lockedUntil.current - performance.now() + 20);
    return () => clearTimeout(t);
  });

  if (!dive || dive.role === "waiting") {
    return (
      <main class="center">
        <div class="sub-emoji">🤿</div>
        <h1>The squad is diving</h1>
        <p class="muted">You'll join in at the next level.</p>
      </main>
    );
  }
  if (dive.role === "instructor") {
    return (
      <main class="center instructor">
        <div class="role-tag">📣 You're an INSTRUCTOR</div>
        <p class="muted">Describe this symbol out loud so your divers can find it!</p>
        <div class="big-symbol" key={dive.symbol}>
          <GlyphSymbol id={dive.symbol} />
        </div>
        <p class="dive-progress">
          Symbol {Math.min(dive.index + 1, dive.total)} of {dive.total} · {dive.found} of {dive.groupSize} found
        </p>
      </main>
    );
  }
  return (
    <main class="dive-diver">
      <div class="dive-head">
        <b>🤿 Listen to the instructors!</b>
        <span>Tap the symbol being described · {Math.min(dive.index + 1, dive.total)} / {dive.total}</span>
      </div>
      {dive.done ? (
        <div class="center">
          <div class="big-check">✓</div>
          <h1>Found it!</h1>
          <p class="muted">Wait for the next symbol…</p>
        </div>
      ) : (
        <div class={`symbol-grid ${locked ? "locked" : ""}`}>
          {dive.grid.map((id) => (
            <button key={id} class={`symbol-btn ${dive.hint === id ? "hint" : ""}`} disabled={locked} onClick={() => send({ type: "sub.tap", symbol: id })}>
              <GlyphSymbol id={id} />
            </button>
          ))}
        </div>
      )}
      {locked && <div class="locked-note">✗ Not that one. Listen again!</div>}
    </main>
  );
}

function SubResult({ view }: { view: PlayerSubView }) {
  const r = view.result;
  if (!r) return null;
  return (
    <main class="center">
      <div class="sub-emoji">🐟</div>
      <p class="muted">The squad was caught at</p>
      <div class="final-rank top">
        {r.depth} <span class="unit">m</span>
      </div>
      <p class="big-score">Level {r.level}</p>
      <p class="muted">
        You: {view.me.correct} correct · {view.me.boosts} boost{view.me.boosts === 1 ? "" : "s"} · {view.me.diveHits} symbols found
      </p>
      {r.awards.map((a) => (
        <div key={a} class="award-chip">
          🏆 {a}
        </div>
      ))}
    </main>
  );
}
