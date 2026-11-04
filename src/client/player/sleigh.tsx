import type { Ref } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ClientMsg, PlayerSleighView } from "../../shared/protocol.ts";
import { SLEIGH_MS_PER_POINT, SLEIGH_TICK_MS, METRES_PER_UNIT, STICK_DEAD_ZONE } from "../../shared/sleigh-rules.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import backdropImg from "../shared/sleigh/phone/backdrop.webp";
import candyCanesImg from "../shared/sleigh/phone/candy-canes.webp";
import wheelImg from "../shared/sleigh/phone/wheel.webp";
import wheelPaintImg from "../shared/sleigh/phone/wheel-paint.webp";
import { useTinted } from "../shared/tint.ts";
import { ordinal, useCountdown } from "../shared/ui.tsx";
import { Feedback, StreamQuestion } from "./tower.tsx";

type Send = (m: ClientMsg) => void;

/** How long the stick takes to spring back to centre after it is let go. */
const SPRING_MS = 220;
/** How far the knob travels from the centre at a full push, in the wheel's viewBox units (the rim's inside). */
const REACH = 82;
/** Seconds of flying each correct answer buys. */
const SECS_PER_POINT = SLEIGH_MS_PER_POINT / 1000;

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** Phone screen for Santa's Sleigh Run: questions during the quiz, a joystick during the flight. */
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
    <div class={`game sleigh-game ${fit ? "fit-screen" : ""}`} style={{ "--scene": `url(${backdropImg})` }}>
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

/** Two candy canes crossed and tied with a bow and holly. */
function CandyCanes({ big }: { big?: boolean }) {
  return <img class={`sleigh-canes ${big ? "big" : ""}`} src={candyCanesImg} alt="" />;
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

/** Overshoots a touch past the centre, like a stick's spring. */
const easeOutBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

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

  // ----- joystick: the sleigh turns toward where it is pushed, as fast as it is pushed -----
  const padRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<SVGGElement>(null);
  const wheelRef = useRef<SVGGElement>(null);
  const sendRef = useRef(send);
  sendRef.current = send;
  const st = useRef({
    x: 0, // shown knob position, −1…1 of REACH
    y: 0,
    deg: 0, // shown wheel rotation: its marker points the way the stick was last pushed
    pointer: null as number | null,
    anim: 0,
    keys: { left: false, right: false, up: false, down: false },
    // throttled sending
    value: { x: 0, y: 0 }, // value to report
    sent: { x: 0, y: 0 }, // last value sent
    sentAt: -Infinity,
    trailing: undefined as ReturnType<typeof setTimeout> | undefined,
  });

  useEffect(() => {
    const s = st.current;
    const draw = () => {
      if (knobRef.current) knobRef.current.style.transform = `translate(${s.x * REACH}px, ${s.y * REACH}px)`;
      if (wheelRef.current) wheelRef.current.style.transform = `rotate(${s.deg}deg)`;
    };
    const same = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x === b.x && a.y === b.y;
    const flush = () => {
      s.trailing = undefined;
      if (same(s.value, s.sent)) return;
      s.sent = s.value;
      s.sentAt = performance.now();
      sendRef.current({ type: "sleigh.steer", x: s.value.x, y: s.value.y });
    };
    const report = (x: number, y: number) => {
      s.value = { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
      if (same(s.value, s.sent) || s.trailing !== undefined) return;
      const wait = s.sentAt + SLEIGH_TICK_MS - performance.now();
      if (wait <= 0) flush();
      else s.trailing = setTimeout(flush, wait + 2);
    };
    const stopAnim = () => {
      cancelAnimationFrame(s.anim);
      s.anim = 0;
    };
    /** Put the stick at (x, y), clamped to its rim, and turn the wheel to point that way. */
    const moveTo = (x: number, y: number) => {
      stopAnim();
      const m = Math.hypot(x, y);
      if (m > 1) {
        x /= m;
        y /= m;
      }
      s.x = x;
      s.y = y;
      if (m > STICK_DEAD_ZONE) {
        const deg = (Math.atan2(y, x) * 180) / Math.PI + 90;
        // The shortest way round from the current rotation, so the wheel never spins the long way.
        s.deg += ((((deg - s.deg) % 360) + 540) % 360) - 180;
      }
      draw();
      report(x, y);
    };
    /** Let go: the stick reports centre straight away and the knob springs back. */
    const release = () => {
      stopAnim();
      report(0, 0);
      const fx = s.x;
      const fy = s.y;
      const t0 = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - t0) / SPRING_MS);
        const k = 1 - easeOutBack(t);
        s.x = fx * k;
        s.y = fy * k;
        draw();
        s.anim = t < 1 ? requestAnimationFrame(step) : 0;
      };
      s.anim = requestAnimationFrame(step);
    };
    /** The pointer's offset from the pad's centre, as a fraction of the knob's reach on screen. */
    const stickOf = (e: PointerEvent) => {
      const r = padRef.current!.getBoundingClientRect();
      const reachPx = (REACH * Math.min(r.width, r.height)) / 248;
      return { x: (e.clientX - (r.left + r.width / 2)) / reachPx, y: (e.clientY - (r.top + r.height / 2)) / reachPx };
    };

    const pad = padRef.current!;
    const onDown = (e: PointerEvent) => {
      if (s.pointer !== null) return;
      e.preventDefault();
      s.pointer = e.pointerId;
      const p = stickOf(e);
      moveTo(p.x, p.y);
      try {
        pad.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events can't be captured */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== s.pointer) return;
      e.preventDefault();
      const p = stickOf(e);
      moveTo(p.x, p.y);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== s.pointer) return;
      s.pointer = null;
      release();
    };

    const KEYS: Record<string, keyof typeof s.keys> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    const onKey = (e: KeyboardEvent) => {
      const k = KEYS[e.key];
      if (!k) return;
      e.preventDefault();
      const down = e.type === "keydown";
      if (s.keys[k] === down) return; // key repeat
      s.keys[k] = down;
      if (s.pointer !== null) return;
      const x = (s.keys.right ? 1 : 0) - (s.keys.left ? 1 : 0);
      const y = (s.keys.down ? 1 : 0) - (s.keys.up ? 1 : 0);
      if (x === 0 && y === 0) release();
      else moveTo(x, y);
    };
    const onBlur = () => {
      s.keys.left = s.keys.right = s.keys.up = s.keys.down = false;
      if (s.pointer === null && (s.x !== 0 || s.y !== 0)) release();
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
    <main class={`sleigh-flight ${out && !view.finished ? "out" : ""}`}>
      <div ref={padRef} class="sleigh-wheel-pad" role="application" aria-label="Sleigh joystick: hold it the way to fly, the arrow keys work too">
        <SleighStick color={view.me.color} wheelRef={wheelRef} knobRef={knobRef} />
        {pop !== null && (
          <div key={pop} class="sleigh-pop" role="status">
            +1 🎁 Delivered!
          </div>
        )}
      </div>
      <div class="sleigh-side">
        {!noFuel && !view.finished && (
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
 * The joystick: the magical sleigh wheel (a painted picture: red-lacquered rim, candy-cane spokes,
 * gold hub, its marker in the sleigh's colour) as the base, turned by `wheelRef` so the marker
 * points the way the sleigh is steered, and a knob in the sleigh's colour moved by `knobRef`.
 */
function SleighStick({ color, wheelRef, knobRef }: { color: string; wheelRef: Ref<SVGGElement>; knobRef: Ref<SVGGElement> }) {
  const href = useTinted(wheelImg, wheelPaintImg, color);
  return (
    <svg class="sleigh-wheel" viewBox="-124 -124 248 248" aria-hidden="true">
      <defs>
        <radialGradient id="sleigh-glow">
          <stop offset="0.7" stop-color="#ffd877" stop-opacity="0" />
          <stop offset="0.8" stop-color="#ffd877" stop-opacity="0.2" />
          <stop offset="1" stop-color="#ffd877" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="sleigh-knob-gloss" cx="0.38" cy="0.32" r="0.7">
          <stop offset="0" stop-color="#fff" stop-opacity="0.75" />
          <stop offset="0.45" stop-color="#fff" stop-opacity="0.1" />
          <stop offset="1" stop-color="#000" stop-opacity="0.35" />
        </radialGradient>
      </defs>
      {/* drop shadow and a soft glow, which do not turn */}
      <circle r="122" fill="url(#sleigh-glow)" />
      <circle cx="0" cy="6" r="90" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="22" />
      <g ref={wheelRef} class="sleigh-wheel-turn">
        <image href={href} x="-124" y="-124" width="248" height="248" />
      </g>
      <g ref={knobRef} class="sleigh-knob">
        <circle cy="5" r="31" fill="rgba(0,0,0,0.35)" />
        <circle r="30" fill={color} stroke="#fff" stroke-width="4" />
        <circle r="30" fill="url(#sleigh-knob-gloss)" />
        <circle r="17" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="2" />
      </g>
    </svg>
  );
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
