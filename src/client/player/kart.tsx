import type { Ref } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ClientMsg, PlayerKartView } from "../../shared/protocol.ts";
import { KART_MS_PER_POINT, KART_TICK_MS, METRES_PER_UNIT, WHEEL_MAX_DEG } from "../../shared/kart-rules.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import { ordinal, useCountdown } from "../shared/ui.tsx";
import { Feedback, StreamQuestion } from "./tower.tsx";

type Send = (m: ClientMsg) => void;

/** How long the wheel takes to spring back to centre after it is let go. */
const SPRING_MS = 220;
/** How long the wheel takes to swing to full lock from the arrow keys. */
const KEY_SWING_MS = 120;

/** Phone screen for Kart Rally: questions during the quiz, a steering wheel during the drive. */
export function KartPlayer({ view, send }: { view: PlayerKartView; send: Send }) {
  const secs = useCountdown(view.phaseRemainingMs, `${view.phase}-${view.round}`);
  const fit = view.phase === "intro" || view.phase === "drive";

  let body;
  if (view.phase === "countdown") {
    body = (
      <main class="center">
        <CheckeredFlags />
        <p class="muted">Answer questions to earn fuel — each correct answer is {KART_MS_PER_POINT / 1000} seconds of driving. Then steer your car from your phone!</p>
        <div class="tower-count">{Math.max(1, secs)}</div>
      </main>
    );
  } else if (view.phase === "quiz") {
    body = view.question ? (
      <StreamQuestion question={view.question} onAnswer={(seq, option, text) => send({ type: "kart.answer", seq, option, text })} />
    ) : (
      <main class="center">
        <div class="spinner" />
      </main>
    );
  } else if (view.phase === "intro") {
    body = <IntroScreen view={view} secs={secs} />;
  } else if (view.phase === "drive") {
    body = <DriveScreen key={view.round} view={view} send={send} />;
  } else {
    body = <KartResult view={view} />;
  }

  return (
    <div class={`game kart-game ${fit ? "fit-screen" : ""}`}>
      <header class="bar">
        <span class="name">{view.me.nickname}</span>
        <span class="kart-stats">
          <span class="kart-swatch" style={{ background: view.me.color }} aria-label="Your car's colour" />
          {view.phase !== "podium" && (
            <span class="kart-points" aria-label={`${view.me.points} seconds of fuel this round`}>
              ⛽{view.me.points}
            </span>
          )}
        </span>
      </header>
      {body}
      <Feedback feedback={view.feedback} rightText={`+${KART_MS_PER_POINT / 1000} s fuel ⛽`} />
    </div>
  );
}

/** Two checkered flags crossed at their poles. */
function CheckeredFlags({ big }: { big?: boolean }) {
  return (
    <svg class={`kart-flags ${big ? "big" : ""}`} viewBox="-20 -2 240 142" aria-hidden="true">
      <defs>
        <pattern id="kart-checker" width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="16" height="16" fill="#fff" />
          <rect width="8" height="8" fill="#111" />
          <rect x="8" y="8" width="8" height="8" fill="#111" />
        </pattern>
      </defs>
      {[-1, 1].map((side) => (
        <g key={side} transform={`translate(${100 - side * 34} 136) rotate(${side * 36}) scale(${side} 1)`}>
          {/* pole */}
          <rect x="-3" y="-128" width="6" height="128" rx="3" fill="#d9d9d9" stroke="#555" stroke-width="1.2" />
          <circle cx="0" cy="-130" r="5" fill="#ffd23f" stroke="#7a5b00" stroke-width="1.2" />
          {/* waving cloth */}
          <path d="M3 -124 C 25 -136, 45 -112, 72 -122 L 72 -76 C 45 -66, 25 -90, 3 -78 Z" fill="url(#kart-checker)" stroke="#111" stroke-width="2" stroke-linejoin="round" />
          <path d="M3 -124 C 25 -136, 45 -112, 72 -122 L 72 -76 C 45 -66, 25 -90, 3 -78 Z" fill="url(#kart-shade)" opacity="0.25" />
        </g>
      ))}
      <defs>
        <linearGradient id="kart-shade" x1="0" x2="1">
          <stop offset="0" stop-color="#000" stop-opacity="0" />
          <stop offset="0.45" stop-color="#000" stop-opacity="0.6" />
          <stop offset="0.7" stop-color="#000" stop-opacity="0" />
          <stop offset="1" stop-color="#000" stop-opacity="0.5" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function IntroScreen({ view, secs }: { view: PlayerKartView; secs: number }) {
  const fuel = view.me.points;
  return (
    <main class="kart-intro">
      <CheckeredFlags big />
      <p class="kart-intro-lead">Get ready to drive in</p>
      <div key={secs} class="kart-intro-count">
        {Math.max(1, secs)}
      </div>
      <div class="kart-you">
        <Avatar choice={view.me.avatar} class="kart-you-avatar" />
        <span>
          You're the <span class="kart-swatch big" style={{ background: view.me.color }} /> car
        </span>
      </div>
      <p class={`kart-intro-fuel ${fuel === 0 ? "empty" : ""}`}>
        ⛽ {fuel === 0 ? "No fuel this round" : `${fuel} second${fuel === 1 ? "" : "s"} of fuel`}
      </p>
    </main>
  );
}

// ---------- drive ----------

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

function DriveScreen({ view, send }: { view: PlayerKartView; send: Send }) {
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
      sendRef.current({ type: "kart.steer", wheel: s.value });
    };
    const report = (value: number) => {
      s.value = Math.round(value * 1000) / 1000;
      if (s.value === s.sent || s.trailing !== undefined) return;
      const wait = s.sentAt + KART_TICK_MS - performance.now();
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

  return (
    <main class={`kart-drive ${out ? "out" : ""}`}>
      <div ref={padRef} class="kart-wheel-pad" role="slider" aria-label="Steering wheel" aria-valuemin={-1} aria-valuemax={1} aria-valuenow={0}>
        <SteeringWheel color={view.me.color} gRef={wheelRef} />
      </div>
      {noFuel ? (
        <p class="kart-fuel-msg">No fuel this round — answer more questions next time!</p>
      ) : (
        <div class="kart-fuel">
          <div class="kart-fuel-head">
            <span>⛽ Fuel</span>
            <span class="kart-fuel-secs">
              <span ref={secsRef}>{(view.fuelMs / 1000).toFixed(1)}</span> s
            </span>
          </div>
          <div class="kart-fuel-track">
            <div ref={barRef} class="kart-fuel-bar" style={{ transform: `scaleX(${startMs > 0 ? view.fuelMs / startMs : 0})` }} />
          </div>
          {out && <p class="kart-fuel-msg">Out of fuel — waiting for the others</p>}
        </div>
      )}
    </main>
  );
}

/** A sporty three-spoke wheel, drawn around (0, 0). `gRef` is the group that rotates. */
function SteeringWheel({ color, gRef }: { color: string; gRef: Ref<SVGGElement> }) {
  // Grip ridges on the rim's sides (where hands go: 9 and 3 o'clock, ± 40°).
  const ridges: number[] = [];
  for (const centre of [180, 0]) for (let a = -40; a <= 40; a += 6) ridges.push(centre + a);
  return (
    <svg class="kart-wheel" viewBox="-116 -116 232 232" aria-hidden="true">
      <defs>
        <radialGradient id="kart-rim" cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse">
          <stop offset="0.74" stop-color="#1a1a1d" />
          <stop offset="0.8" stop-color="#4a4a52" />
          <stop offset="0.86" stop-color="#2a2a2f" />
          <stop offset="0.95" stop-color="#0d0d10" />
        </radialGradient>
        <linearGradient id="kart-spoke" x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0" stop-color="#9aa0aa" />
          <stop offset="0.5" stop-color="#5c616b" />
          <stop offset="1" stop-color="#3a3e46" />
        </linearGradient>
        <radialGradient id="kart-hub" cx="-0.25" cy="-0.3" r="1.1">
          <stop offset="0" stop-color="#55555e" />
          <stop offset="1" stop-color="#141417" />
        </radialGradient>
      </defs>
      {/* drop shadow, does not rotate */}
      <circle cx="0" cy="5" r="94" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="24" />
      <g ref={gRef} class="kart-wheel-turn">
        {/* spokes: left, right, bottom */}
        <path d="M-82 -6 L-26 -14 L-26 14 L-82 12 Z" fill="url(#kart-spoke)" stroke="#222" stroke-width="1.5" />
        <path d="M82 -6 L26 -14 L26 14 L82 12 Z" fill="url(#kart-spoke)" stroke="#222" stroke-width="1.5" />
        <path d="M-14 24 L14 24 L11 84 L-11 84 Z" fill="url(#kart-spoke)" stroke="#222" stroke-width="1.5" />
        {/* rim */}
        <circle r="88" fill="none" stroke="url(#kart-rim)" stroke-width="20" />
        <circle r="98" fill="none" stroke="#000" stroke-width="1.5" opacity="0.6" />
        <circle r="78" fill="none" stroke="#000" stroke-width="1.5" opacity="0.6" />
        {/* leather grips */}
        {ridges.map((a) => (
          <line key={a} x1="80" y1="0" x2="96" y2="0" transform={`rotate(${a})`} stroke="#000" stroke-width="2" opacity="0.55" stroke-linecap="round" />
        ))}
        {[180, 0].map((c) => (
          <path
            key={c}
            d={arc(88, c - 44, c + 44)}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            stroke-width="18"
          />
        ))}
        {/* top-centre marker in the car's colour */}
        <path d={arc(88, -99, -81)} fill="none" stroke={color} stroke-width="20" />
        <line x1="0" y1="-78" x2="0" y2="-98" stroke="rgba(0,0,0,0.25)" stroke-width="1" />
        {/* hub */}
        <circle r="30" fill="url(#kart-hub)" stroke="#000" stroke-width="2" />
        <circle r="22" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2" />
        <circle r="12" fill={color} stroke="#000" stroke-width="1.5" />
        <circle cx="-3" cy="-4" r="4" fill="rgba(255,255,255,0.35)" />
      </g>
    </svg>
  );
}

/** SVG arc path along a circle of radius r from angle a to b (degrees, 0 = 3 o'clock, clockwise). */
function arc(r: number, a: number, b: number): string {
  const p = (d: number) => `${(r * Math.cos((d * Math.PI) / 180)).toFixed(2)} ${(r * Math.sin((d * Math.PI) / 180)).toFixed(2)}`;
  return `M${p(a)} A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${p(b)}`;
}

// ---------- podium ----------

function KartResult({ view }: { view: PlayerKartView }) {
  const r = view.result;
  if (!r) return null;
  const won = r.rank === 1;
  const metres = Math.max(0, Math.round(r.distance * METRES_PER_UNIT));
  return (
    <main class="center">
      <div class="kart-emoji">{won ? "🏆" : "🏁"}</div>
      <div class={`final-rank ${won ? "top" : ""}`}>{won ? "You win!" : `${ordinal(r.rank)} of ${r.playerCount}`}</div>
      <div class="kart-result-stats">
        <div>
          <b>{r.laps}</b>
          <span>lap{r.laps === 1 ? "" : "s"}</span>
        </div>
        <div>
          <b>{metres.toLocaleString()}</b>
          <span>metres</span>
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
