import type { Ref } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ClientMsg, PlayerSleighView } from "../../shared/protocol.ts";
import { SLEIGH_MS_PER_POINT, SLEIGH_TICK_MS, METRES_PER_UNIT, WHEEL_MAX_DEG } from "../../shared/sleigh-rules.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import { ordinal, useCountdown } from "../shared/ui.tsx";
import { Feedback, StreamQuestion } from "./tower.tsx";

type Send = (m: ClientMsg) => void;

/** How long the wheel takes to spring back to centre after it is let go. */
const SPRING_MS = 220;
/** How long the wheel takes to swing to full lock from the arrow keys. */
const KEY_SWING_MS = 120;
/** Seconds of flying each correct answer buys. */
const SECS_PER_POINT = SLEIGH_MS_PER_POINT / 1000;

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** Phone screen for Santa's Sleigh Run: questions during the quiz, a sleigh wheel during the flight. */
export function SleighPlayer({ view, send }: { view: PlayerSleighView; send: Send }) {
  const secs = useCountdown(view.phaseRemainingMs, `${view.phase}-${view.round}`);
  const fit = view.phase === "intro" || view.phase === "flight";

  let body;
  if (view.phase === "countdown") {
    body = (
      <main class="center sleigh-countdown">
        <CandyCanes />
        <h1>Santa's Sleigh Run</h1>
        <p class="muted">
          Answer questions to power your reindeer — every correct answer is {SECS_PER_POINT} seconds of flying. Then steer your sleigh over the city and fly over
          houses to deliver presents!
        </p>
        <div class="tower-count">{Math.max(1, secs)}</div>
      </main>
    );
  } else if (view.phase === "quiz") {
    body = view.question ? (
      <StreamQuestion question={view.question} onAnswer={(seq, option, text) => send({ type: "sleigh.answer", seq, option, text })} />
    ) : (
      <main class="center">
        <div class="spinner" />
      </main>
    );
  } else if (view.phase === "intro") {
    body = <IntroScreen view={view} secs={secs} />;
  } else if (view.phase === "flight") {
    body = <FlightScreen key={view.round} view={view} send={send} />;
  } else {
    body = <SleighResult view={view} />;
  }

  return (
    <div class={`game sleigh-game ${fit ? "fit-screen" : ""}`}>
      <header class="bar">
        <span class="name">{view.me.nickname}</span>
        <span class="sleigh-stats">
          <span class="sleigh-swatch" style={{ background: view.me.color }} aria-label="Your sleigh's colour" />
          {view.phase !== "podium" && (
            <span class="sleigh-chip reindeer" aria-label={`${view.me.points} seconds of flying this round`}>
              🦌 {view.me.points * SECS_PER_POINT}s
            </span>
          )}
          <span class="sleigh-chip presents" aria-label={`${view.me.presents} ${plural(view.me.presents, "present")} delivered`}>
            🎁 {view.me.presents}
          </span>
        </span>
      </header>
      {body}
      <Feedback feedback={view.feedback} rightText={`+${SECS_PER_POINT} s 🦌`} />
    </div>
  );
}

/** Two candy canes crossed at their stems, tied with a holly sprig. */
function CandyCanes({ big }: { big?: boolean }) {
  // The cane: a stem with a hook curling outward at the top.
  const cane = "M0 0 L0 -96 A26 26 0 0 1 52 -96 L52 -84";
  return (
    <svg class={`sleigh-canes ${big ? "big" : ""}`} viewBox="-10 -6 220 156" aria-hidden="true">
      <defs>
        <pattern id="sleigh-cane-stripe" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
          <rect width="18" height="18" fill="#fffaf2" />
          <rect width="7" height="18" fill="#d6203a" />
          <rect x="10" width="2.5" height="18" fill="#2f9e55" />
        </pattern>
      </defs>
      {[-1, 1].map((side) => (
        <g key={side} transform={`translate(${100 + side * 30} 142) rotate(${-side * 28}) scale(${-side} 1)`}>
          <path d={cane} fill="none" stroke="#7a1020" stroke-width="20" stroke-linecap="round" />
          <path d={cane} fill="none" stroke="url(#sleigh-cane-stripe)" stroke-width="16" stroke-linecap="round" />
          <path d="M-4 -6 L-4 -96 A22 22 0 0 1 30 -112" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="3" stroke-linecap="round" />
        </g>
      ))}
      {/* holly where the canes cross */}
      <g transform="translate(100 104)">
        <path d="M0 0 C -10 -14, -30 -14, -40 -4 C -32 -2, -30 6, -24 8 C -18 2, -10 6, 0 0 Z" fill="#1f7a3e" stroke="#0e4a24" stroke-width="2" />
        <path d="M0 0 C 10 -14, 30 -14, 40 -4 C 32 -2, 30 6, 24 8 C 18 2, 10 6, 0 0 Z" fill="#1f7a3e" stroke="#0e4a24" stroke-width="2" />
        <circle cx="-6" cy="2" r="7" fill="#e3263f" stroke="#7a1020" stroke-width="1.5" />
        <circle cx="6" cy="2" r="7" fill="#e3263f" stroke="#7a1020" stroke-width="1.5" />
        <circle cx="0" cy="-7" r="7" fill="#e3263f" stroke="#7a1020" stroke-width="1.5" />
        <circle cx="-2" cy="-9" r="2" fill="rgba(255,255,255,0.7)" />
      </g>
    </svg>
  );
}

function IntroScreen({ view, secs }: { view: PlayerSleighView; secs: number }) {
  const flying = view.me.points * SECS_PER_POINT;
  return (
    <main class="sleigh-intro">
      <CandyCanes big />
      <p class="sleigh-intro-lead">Get ready to fly in</p>
      <div key={secs} class="sleigh-intro-count">
        {Math.max(1, secs)}
      </div>
      <div class="sleigh-you">
        <Avatar choice={view.me.avatar} class="sleigh-you-avatar" />
        <span>
          You're the <span class="sleigh-swatch big" style={{ background: view.me.color }} /> sleigh
        </span>
      </div>
      <p class={`sleigh-intro-fuel ${flying === 0 ? "empty" : ""}`}>
        🦌 {flying === 0 ? "No flying this round — your reindeer are resting" : `${flying} ${plural(flying, "second")} of flying`}
      </p>
    </main>
  );
}

// ---------- flight ----------

/** Signed difference a − b in degrees, unwrapped to −180…180. */
function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

const clampDeg = (d: number) => Math.max(-WHEEL_MAX_DEG, Math.min(WHEEL_MAX_DEG, d));
/** Overshoots a touch past the end, like a wheel's self-centring spring. */
const easeOutBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function FlightScreen({ view, send }: { view: PlayerSleighView; send: Send }) {
  const noFuel = view.fuelStartMs <= 0;
  const [out, setOut] = useState(noFuel || view.fuelMs <= 0);

  // ----- fuel gauge, counted down locally between snapshots -----
  const fuelAt = useRef({ fuelMs: view.fuelMs, at: performance.now() });
  if (fuelAt.current.fuelMs !== view.fuelMs) fuelAt.current = { fuelMs: view.fuelMs, at: performance.now() };
  const barRef = useRef<HTMLDivElement>(null);
  const secsRef = useRef<HTMLSpanElement>(null);
  const startMs = view.fuelStartMs;
  useEffect(() => {
    if (noFuel) return;
    let raf = 0;
    let wasOut = false;
    const tick = () => {
      const left = Math.max(0, fuelAt.current.fuelMs - (performance.now() - fuelAt.current.at));
      if (barRef.current) barRef.current.style.transform = `scaleX(${startMs > 0 ? left / startMs : 0})`;
      if (secsRef.current) secsRef.current.textContent = (left / 1000).toFixed(1);
      if (left <= 0 && !wasOut) {
        wasOut = true;
        setOut(true);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [startMs, noFuel]);
  const buzzed = useRef(false);
  useEffect(() => {
    if (out && !noFuel && !buzzed.current) {
      buzzed.current = true;
      navigator.vibrate?.([80, 60, 80]);
    }
  }, [out]);

  // ----- steering wheel -----
  const padRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<SVGGElement>(null);
  const sendRef = useRef(send);
  sendRef.current = send;
  const st = useRef({
    deg: 0, // shown rotation
    pointer: null as number | null,
    lastAngle: 0,
    anim: 0,
    keys: { left: false, right: false },
    // throttled sending
    value: 0, // value to report
    sent: 0, // last value sent
    sentAt: -Infinity,
    trailing: undefined as ReturnType<typeof setTimeout> | undefined,
  });

  useEffect(() => {
    const s = st.current;
    const draw = () => {
      if (wheelRef.current) wheelRef.current.style.transform = `rotate(${s.deg}deg)`;
    };
    const flush = () => {
      s.trailing = undefined;
      if (s.value === s.sent) return;
      s.sent = s.value;
      s.sentAt = performance.now();
      sendRef.current({ type: "sleigh.steer", wheel: s.value });
    };
    const report = (value: number) => {
      s.value = Math.round(value * 1000) / 1000;
      if (s.value === s.sent || s.trailing !== undefined) return;
      const wait = s.sentAt + SLEIGH_TICK_MS - performance.now();
      if (wait <= 0) flush();
      else s.trailing = setTimeout(flush, wait + 2);
    };
    const stopAnim = () => {
      cancelAnimationFrame(s.anim);
      s.anim = 0;
    };
    /** Animate the shown rotation to `target` (the reported value jumps there straight away). */
    const animateTo = (target: number, ms: number, ease: (t: number) => number) => {
      stopAnim();
      report(target / WHEEL_MAX_DEG);
      const from = s.deg;
      const t0 = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - t0) / ms);
        s.deg = from + (target - from) * ease(t);
        draw();
        s.anim = t < 1 ? requestAnimationFrame(step) : 0;
      };
      s.anim = requestAnimationFrame(step);
    };
    const angleOf = (e: PointerEvent) => {
      const r = padRef.current!.getBoundingClientRect();
      return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
    };

    const pad = padRef.current!;
    const onDown = (e: PointerEvent) => {
      if (s.pointer !== null) return;
      e.preventDefault();
      stopAnim();
      s.pointer = e.pointerId;
      s.lastAngle = angleOf(e);
      try {
        pad.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events can't be captured */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== s.pointer) return;
      e.preventDefault();
      const a = angleOf(e);
      s.deg = clampDeg(s.deg + angleDelta(a, s.lastAngle));
      s.lastAngle = a;
      draw();
      report(s.deg / WHEEL_MAX_DEG);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== s.pointer) return;
      s.pointer = null;
      animateTo(0, SPRING_MS, easeOutBack);
    };

    const keyDir = () => (s.keys.right ? 1 : 0) - (s.keys.left ? 1 : 0);
    const onKey = (e: KeyboardEvent) => {
      const k = e.key === "ArrowLeft" ? "left" : e.key === "ArrowRight" ? "right" : null;
      if (!k) return;
      e.preventDefault();
      const down = e.type === "keydown";
      if (s.keys[k] === down) return; // key repeat
      s.keys[k] = down;
      if (s.pointer !== null) return;
      const dir = keyDir();
      if (dir === 0) animateTo(0, SPRING_MS, easeOutBack);
      else animateTo(dir * WHEEL_MAX_DEG, KEY_SWING_MS, easeOut);
    };
    const onBlur = () => {
      s.keys.left = s.keys.right = false;
      if (s.pointer === null && s.deg !== 0) animateTo(0, SPRING_MS, easeOutBack);
    };

    pad.addEventListener("pointerdown", onDown);
    pad.addEventListener("pointermove", onMove);
    pad.addEventListener("pointerup", onUp);
    pad.addEventListener("pointercancel", onUp);
    pad.addEventListener("lostpointercapture", onUp);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      pad.removeEventListener("pointerdown", onDown);
      pad.removeEventListener("pointermove", onMove);
      pad.removeEventListener("pointerup", onUp);
      pad.removeEventListener("pointercancel", onUp);
      pad.removeEventListener("lostpointercapture", onUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
      stopAnim();
      clearTimeout(s.trailing);
    };
  }, []);

  // ----- a present delivered: buzz and pop -----
  const seenDelivery = useRef(view.lastDelivery);
  const [pop, setPop] = useState<number | null>(null);
  useEffect(() => {
    const seq = view.lastDelivery;
    if (seq === null || seq === seenDelivery.current) return;
    seenDelivery.current = seq;
    navigator.vibrate?.([60, 40, 60]);
    setPop(seq);
    const t = setTimeout(() => setPop((p) => (p === seq ? null : p)), 1400);
    return () => clearTimeout(t);
  }, [view.lastDelivery]);

  let msg: string | null = null;
  if (view.finished) msg = "🎄 Every present delivered!";
  else if (noFuel) msg = "Your reindeer are resting this round — answer more questions next time!";
  else if (out) msg = "Your reindeer need a rest — waiting for the others";

  return (
    <main class={`sleigh-flight ${out || view.finished ? "out" : ""}`}>
      <div ref={padRef} class="sleigh-wheel-pad" role="slider" aria-label="Sleigh wheel" aria-valuemin={-1} aria-valuemax={1} aria-valuenow={0}>
        <SleighWheel color={view.me.color} gRef={wheelRef} />
        {pop !== null && (
          <div key={pop} class="sleigh-pop" role="status">
            +1 🎁 Delivered!
          </div>
        )}
      </div>
      <div class="sleigh-side">
        {!noFuel && (
          <div class="sleigh-fuel">
            <div class="sleigh-fuel-head">
              <span>🦌 Reindeer energy</span>
              <span class="sleigh-fuel-secs">
                <span ref={secsRef}>{(view.fuelMs / 1000).toFixed(1)}</span> s
              </span>
            </div>
            <div class="sleigh-fuel-track">
              <div ref={barRef} class="sleigh-fuel-bar" style={{ transform: `scaleX(${startMs > 0 ? view.fuelMs / startMs : 0})` }} />
            </div>
          </div>
        )}
        {msg && <p class={`sleigh-fuel-msg ${view.finished ? "done" : ""}`}>{msg}</p>}
        <p class="sleigh-tally">
          <span>
            🎁 You've delivered <b>{view.me.presents}</b>
          </span>
          <span class="sleigh-tally-all">
            {view.delivered} / {view.total} delivered
          </span>
        </p>
      </div>
    </main>
  );
}

/**
 * A wooden sleigh wheel, drawn around (0, 0): a red-lacquered rim with gold trim, six
 * candy-cane spokes and handles, and a gold hub. `gRef` is the group that rotates.
 */
function SleighWheel({ color, gRef }: { color: string; gRef: Ref<SVGGElement> }) {
  const spokes = [0, 60, 120, 180, 240, 300];
  // Brass studs around the rim, skipping the coloured marker at the top.
  const studs: number[] = [];
  for (let a = 0; a < 360; a += 20) if (Math.abs(a - 270) > 15) studs.push(a);
  return (
    <svg class="sleigh-wheel" viewBox="-124 -124 248 248" aria-hidden="true">
      <defs>
        <pattern id="sleigh-spoke-stripe" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="14" height="14" fill="#fff7ea" />
          <rect width="6" height="14" fill="#d6203a" />
        </pattern>
        <radialGradient id="sleigh-rim-wood" cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse">
          <stop offset="0.74" stop-color="#6e0f1c" />
          <stop offset="0.8" stop-color="#c2263a" />
          <stop offset="0.86" stop-color="#9c1a2c" />
          <stop offset="0.95" stop-color="#5a0b16" />
        </radialGradient>
        <radialGradient id="sleigh-gold" cx="-0.3" cy="-0.35" r="1.2">
          <stop offset="0" stop-color="#fff2b0" />
          <stop offset="0.45" stop-color="#f2c14e" />
          <stop offset="1" stop-color="#9a6a12" />
        </radialGradient>
        <radialGradient id="sleigh-glow">
          <stop offset="0.55" stop-color="#ffd877" stop-opacity="0.22" />
          <stop offset="1" stop-color="#ffd877" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="sleigh-handle" x1="-1" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#5a3311" />
          <stop offset="0.45" stop-color="#b8763a" />
          <stop offset="1" stop-color="#5a3311" />
        </linearGradient>
      </defs>
      {/* drop shadow and a soft glow, which do not rotate */}
      <circle r="122" fill="url(#sleigh-glow)" />
      <circle cx="0" cy="6" r="90" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="22" />
      <g ref={gRef} class="sleigh-wheel-turn">
        {/* handles poking out past the rim */}
        {spokes.map((a) => (
          <g key={`h${a}`} transform={`rotate(${a})`}>
            <rect x="92" y="-7" width="26" height="14" rx="7" fill="url(#sleigh-handle)" stroke="#3a1f08" stroke-width="1.5" />
            <circle cx="117" cy="0" r="6" fill="url(#sleigh-gold)" stroke="#7a5200" stroke-width="1.2" />
          </g>
        ))}
        {/* candy-cane spokes */}
        {spokes.map((a) => (
          <g key={`s${a}`} transform={`rotate(${a})`}>
            <rect x="20" y="-7" width="64" height="14" rx="7" fill="#7a1020" />
            <rect x="21" y="-5.5" width="62" height="11" rx="5.5" fill="url(#sleigh-spoke-stripe)" />
            <rect x="24" y="-4" width="56" height="2.5" rx="1.2" fill="rgba(255,255,255,0.55)" />
          </g>
        ))}
        {/* rim: lacquered wood between two gold bands */}
        <circle r="88" fill="none" stroke="url(#sleigh-rim-wood)" stroke-width="20" />
        <circle r="98" fill="none" stroke="#f2c14e" stroke-width="3.5" />
        <circle r="78" fill="none" stroke="#f2c14e" stroke-width="3.5" />
        <circle r="99.8" fill="none" stroke="#5a3a00" stroke-width="1" opacity="0.7" />
        <circle r="76.2" fill="none" stroke="#5a3a00" stroke-width="1" opacity="0.7" />
        <path d={arc(88, 200, 250)} fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="6" stroke-linecap="round" />
        {studs.map((a) => (
          <circle key={a} cx={88 * Math.cos((a * Math.PI) / 180)} cy={88 * Math.sin((a * Math.PI) / 180)} r="2.6" fill="url(#sleigh-gold)" />
        ))}
        {/* top-centre marker in the sleigh's colour, with a little gold star */}
        <path d={arc(88, -101, -79)} fill="none" stroke={color} stroke-width="22" />
        <path d={star(0, -88, 7, 3)} fill="#fff6c8" stroke="#7a5200" stroke-width="1" />
        {/* hub */}
        <circle r="30" fill="url(#sleigh-gold)" stroke="#6b4700" stroke-width="2" />
        <circle r="23" fill="none" stroke="rgba(90,58,0,0.5)" stroke-width="1.5" stroke-dasharray="3 3" />
        <circle r="15" fill={color} stroke="#5a3a00" stroke-width="2" />
        {/* holly on the hub */}
        <path d="M0 -2 C -6 -10, -16 -10, -20 -4 C -15 -3, -14 1, -11 3 C -8 -1, -4 1, 0 -2 Z" fill="#1f7a3e" stroke="#0e4a24" stroke-width="1.2" />
        <path d="M0 -2 C 6 -10, 16 -10, 20 -4 C 15 -3, 14 1, 11 3 C 8 -1, 4 1, 0 -2 Z" fill="#1f7a3e" stroke="#0e4a24" stroke-width="1.2" />
        <circle cx="-3.5" cy="1" r="4" fill="#e3263f" stroke="#7a1020" stroke-width="1" />
        <circle cx="3.5" cy="1" r="4" fill="#e3263f" stroke="#7a1020" stroke-width="1" />
        <circle cx="0" cy="-4" r="4" fill="#e3263f" stroke="#7a1020" stroke-width="1" />
      </g>
    </svg>
  );
}

/** SVG arc path along a circle of radius r from angle a to b (degrees, 0 = 3 o'clock, clockwise). */
function arc(r: number, a: number, b: number): string {
  const p = (d: number) => `${(r * Math.cos((d * Math.PI) / 180)).toFixed(2)} ${(r * Math.sin((d * Math.PI) / 180)).toFixed(2)}`;
  return `M${p(a)} A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${p(b)}`;
}

/** A five-pointed star path centred on (cx, cy). */
function star(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(" L")} Z`;
}

// ---------- podium ----------

function SleighResult({ view }: { view: PlayerSleighView }) {
  const r = view.result;
  if (!r) return null;
  const won = r.rank === 1;
  const metres = Math.max(0, Math.round(r.distance * METRES_PER_UNIT));
  return (
    <main class="center sleigh-result">
      <div class="sleigh-emoji">{won ? "🏆" : "🎄"}</div>
      <div class={`final-rank ${won ? "top" : ""}`}>{won ? "You win!" : `${ordinal(r.rank)} of ${r.playerCount}`}</div>
      <div class="sleigh-result-stats">
        <div>
          <b>🎁 {r.presents}</b>
          <span>{plural(r.presents, "present")}</span>
        </div>
        <div>
          <b>{metres.toLocaleString()}</b>
          <span>metres flown</span>
        </div>
      </div>
      <p class="big-score">{view.me.correct} correct</p>
      {r.awards.map((a) => (
        <div key={a} class="award-chip">
          🏆 {a}
        </div>
      ))}
    </main>
  );
}
