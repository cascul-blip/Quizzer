import { useEffect, useRef, useState } from "preact/hooks";
import type { ClientMsg, PlayerRacerView, RacerConfidence, RacerTurn } from "../../shared/protocol.ts";
import { RACER_CONFIDENCE, RACER_CONFIDENCE_LEVELS } from "../../shared/racer-rules.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import { RacerScene } from "../shared/racer-art.tsx";
import { play } from "../shared/sounds.ts";
import { PinDragger } from "../shared/pin.tsx";
import { LockedChoice, Shape, TextAnswer, optionColor, useCountdown } from "../shared/ui.tsx";

type Send = (m: ClientMsg) => void;

/** Holding the Go button fills its ring in this long; letting go early drains it at the same pace. */
const GO_HOLD_MS = 1000;
/** If the server has not opened the question this long after Go, the driver may try again. */
const GO_RETRY_MS = 1500;
/** The driver's answer tiles ignore taps this long after they appear, so the finger lifting off Go or the lever can't answer. */
const AFTER_GO_MS = 600;
/** A lever move shows at once; if the server has not confirmed it by then, the lever goes back to what the server says. */
const LEVER_ECHO_MS = 800;
/** Questions longer than this are set in smaller type so every screen fits without scrolling. */
const LONG_QUESTION = 140;

/** Where a stop sits on the track, as a fraction of its height from the top (the three label rows are equal). */
const TOP_STOP = 1 / 6;
const BOTTOM_STOP = 5 / 6;

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const qClass = (text: string) => (text.length > LONG_QUESTION ? "long" : "");

/** Phone screen for Racer: the driver's lever, then the question for everyone, then what it did to the car. */
export function RacerPlayer({ view, send }: { view: PlayerRacerView; send: Send }) {
  const q = view.question;

  let body;
  if (view.phase === "podium") {
    body = <RacerPodium view={view} />;
  } else if (!q) {
    body = (
      <main class="center">
        <div class="spinner" />
      </main>
    );
  } else if (view.phase === "intro") {
    body = (
      <main class="center racer-watch">
        <p class={`q-text racer-q ${qClass(q.text)}`}>{q.text}</p>
        <p class="racer-ask">The car has crashed. Get at least half right to repair it.</p>
      </main>
    );
  } else if (view.phase === "confidence") {
    body = view.isDriver ? <DriverScreen key={q.index} view={view} send={send} /> : <WatchScreen view={view} />;
  } else if (view.phase === "open") {
    body = <RacerAnswering key={q.index} view={view} send={send} />;
  } else {
    body = <RacerReveal view={view} />;
  }

  return (
    <div class="game racer-game fit-screen">
      <header class="bar">
        <span class="name">{view.me.nickname}</span>
        {q && (
          <span class="qnum">
            Question {q.index + 1} / {q.total}
          </span>
        )}
        <span class="score racer-num">{view.car.crashed ? "Crashed" : `${Math.round(view.car.speed)} mph`}</span>
      </header>
      {body}
    </div>
  );
}

/** The driver's turn: set the lever, then hold Go to lock it in. */
function DriverScreen({ view, send }: { view: PlayerRacerView; send: Send }) {
  const q = view.question!;
  const secs = useCountdown(view.phaseRemainingMs, `confidence:${q.index}`);
  // A move shows straight away; the server's snapshot confirms it, or wins if it says otherwise.
  const [mine, setMine] = useState<RacerConfidence | null>(null);
  const level = mine ?? view.lever ?? "low";
  const current = useRef(level);
  current.current = level;
  useEffect(() => {
    if (mine && mine === view.lever) setMine(null);
  }, [mine, view.lever]);
  useEffect(() => {
    if (!mine) return;
    const t = setTimeout(() => setMine(null), LEVER_ECHO_MS);
    return () => clearTimeout(t);
  }, [mine]);

  const change = (next: RacerConfidence) => {
    if (next === current.current) return;
    current.current = next;
    setMine(next);
    send({ type: "racer.lever", level: next });
    navigator.vibrate?.(10);
    play("leverClick");
  };
  // Arrow keys work too (handy when playing from a laptop).
  const changeRef = useRef(change);
  changeRef.current = change;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = RACER_CONFIDENCE_LEVELS[RACER_CONFIDENCE_LEVELS.indexOf(current.current) + step];
      if (next) changeRef.current(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main class="racer-drive">
      <div class="racer-info">
        <div class="racer-head">
          <div class={`timer racer-num ${secs <= 5 ? "urgent" : ""}`}>{secs}</div>
          <h1>You're the driver</h1>
        </div>
        <p class={`q-text racer-q ${qClass(q.text)}`}>{q.text}</p>
        {q.image && <img class="q-img racer-q-img" src={`/${q.image}`} alt="" />}
        <p class="racer-ask">How confident are you in the class?</p>
      </div>
      <div class="racer-controls">
        <Lever level={level} onChange={change} />
        <GoButton onGo={() => send({ type: "racer.go" })} />
      </div>
    </main>
  );
}

/** Everyone else during the driver's turn: who drives, and their lever moving live. */
function WatchScreen({ view }: { view: PlayerRacerView }) {
  const q = view.question!;
  return (
    <main class="center racer-watch">
      <p class={`q-text racer-q ${qClass(q.text)}`}>{q.text}</p>
      {view.driver && (
        <div class="racer-driver">
          <div class="racer-avatar">
            <Avatar choice={view.driver.avatar} />
          </div>
          <h1>{view.driver.nickname} is driving</h1>
        </div>
      )}
      <div class="racer-driver">
        <p class="racer-ask">How confident are they in you?</p>
        <Lever level={view.lever ?? "low"} />
      </div>
    </main>
  );
}

/**
 * The confidence lever: a vertical track with three stops, the surest at the top.
 * With `onChange` the handle can be dragged (it follows the finger and snaps to the nearest stop
 * when released) and the labels can be tapped; without it the lever is a small read-only copy.
 */
function Lever({ level, onChange }: { level: RacerConfidence; onChange?: (level: RacerConfidence) => void }) {
  const last = RACER_CONFIDENCE_LEVELS.length - 1;
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  /** While dragging: where the handle is, from 0 (bottom stop) to 1 (top stop). */
  const [dragPos, setDragPos] = useState<number | null>(null);

  const follow = (e: PointerEvent) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return;
    const y = (e.clientY - rect.top) / rect.height;
    const pos = Math.max(0, Math.min(1, (BOTTOM_STOP - y) / (BOTTOM_STOP - TOP_STOP)));
    setDragPos(pos);
    // Crossing into another stop's half of the track already counts as a change.
    onChange?.(RACER_CONFIDENCE_LEVELS[Math.round(pos * last)]!);
  };
  const onDown = (e: PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    follow(e);
  };
  const onMove = (e: PointerEvent) => {
    if (dragging.current) follow(e);
  };
  const onEnd = () => {
    dragging.current = false;
    setDragPos(null);
  };

  const pos = dragPos ?? RACER_CONFIDENCE_LEVELS.indexOf(level) / last;
  const top = (BOTTOM_STOP - pos * (BOTTOM_STOP - TOP_STOP)) * 100;
  const handlers = onChange ? { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onEnd, onPointerCancel: onEnd, onLostPointerCapture: onEnd } : {};
  const topDown = [...RACER_CONFIDENCE_LEVELS].reverse();
  return (
    <div class={`racer-lever ${onChange ? "" : "small"} ${dragPos !== null ? "dragging" : ""}`}>
      <div class="racer-track" ref={track} role="slider" aria-label="Confidence" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={last} aria-valuenow={RACER_CONFIDENCE_LEVELS.indexOf(level)} aria-valuetext={RACER_CONFIDENCE[level].label} aria-readonly={!onChange} {...handlers}>
        <div class="racer-slot" />
        {topDown.map((lv, i) => (
          <i key={lv} class="racer-notch" style={{ top: `${((2 * i + 1) / (2 * topDown.length)) * 100}%` }} />
        ))}
        <div class="racer-handle" style={{ top: `${top}%` }} />
      </div>
      <div class="racer-stops">
        {topDown.map((lv) => {
          const c = RACER_CONFIDENCE[lv];
          const cls = `racer-stop ${lv === level ? "on" : ""}`;
          return onChange ? (
            <button key={lv} type="button" class={cls} onClick={() => onChange(lv)}>
              <b>{c.label}</b>
              <small>{c.needs}</small>
            </button>
          ) : (
            <div key={lv} class={cls}>
              <b>{c.label}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Hold to fill the ring (it drains when released early); a full ring locks the lever in. */
function GoButton({ onGo }: { onGo: () => void }) {
  const [charge, setCharge] = useState(0);
  const [fired, setFired] = useState(false);
  const holding = useRef(false);
  const level = useRef(0);
  const lastBuzz = useRef(0);
  const go = useRef(onGo);
  go.current = onGo;

  useEffect(() => {
    if (fired) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = t - last;
      last = t;
      const step = dt / GO_HOLD_MS;
      level.current = Math.max(0, Math.min(1, level.current + (holding.current ? step : -step)));
      if (holding.current && t - lastBuzz.current > 220) {
        lastBuzz.current = t;
        navigator.vibrate?.(12);
      }
      setCharge(level.current);
      if (level.current >= 1) {
        holding.current = false;
        setFired(true);
        navigator.vibrate?.([60, 30, 120]);
        go.current();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fired]);

  // If the server didn't take it, let the driver try again.
  useEffect(() => {
    if (!fired) return;
    const t = setTimeout(() => {
      level.current = 0;
      setCharge(0);
      setFired(false);
    }, GO_RETRY_MS);
    return () => clearTimeout(t);
  }, [fired]);

  const press = (e: PointerEvent) => {
    e.preventDefault();
    if (!fired) holding.current = true;
  };
  const release = () => {
    holding.current = false;
  };
  const r = 44;
  const circ = 2 * Math.PI * r;
  return (
    <div class="racer-go-wrap">
      <button
        type="button"
        class={`racer-go ${charge > 0 ? "charging" : ""} ${fired ? "fired" : ""}`}
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
        <span class="racer-go-text">Go!</span>
      </button>
      <span class="racer-go-label">Hold to lock in</span>
    </div>
  );
}

/** The question for everyone, as in Classic, under a line that says what is at stake. */
function RacerAnswering({ view, send }: { view: PlayerRacerView; send: Send }) {
  const q = view.question!;
  const [pending, setPending] = useState<number | null>(null);
  const secs = useCountdown(q.remainingMs, `open:${q.index}`);
  // The driver's finger was just on Go or the lever: don't let it land on an answer.
  const [armed, setArmed] = useState(!view.isDriver);
  useEffect(() => {
    if (armed) return;
    const t = setTimeout(() => setArmed(true), AFTER_GO_MS);
    return () => clearTimeout(t);
  }, []);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const chosen = view.myChoice ?? pending;
  const typed = view.myText ?? pendingText;

  if (chosen !== null || typed !== null) {
    return (
      <main class="center">
        {typed !== null ? (
          <div class="locked-text">{typed}</div>
        ) : (
          <LockedChoice type={q.type} index={chosen!} label={q.options[chosen!] ?? ""} />
        )}
        <h1>Answer locked in</h1>
        <p class="muted">Waiting for the others…</p>
      </main>
    );
  }

  const locked = view.confidence ?? view.lever;
  const choose = (i: number) => {
    if (!armed) return;
    if (navigator.vibrate) navigator.vibrate(30);
    setPending(i);
    send({ type: "racer.answer", index: q.index, option: i });
  };
  const pin = q.type === "pin" && q.image && q.spots ? { image: q.image, spots: q.spots } : null;
  return (
    <main class="answering">
      <div class="q-head">
        <div class={`timer ${secs <= 5 ? "urgent" : ""}`}>{secs}</div>
        <h2 class={`q-text ${qClass(q.text)}`}>{q.text}</h2>
      </div>
      {q.image && !pin && <img class="q-img" src={`/${q.image}`} alt="" />}
      <div class="racer-chip">
        {view.driver && locked ? (
          <>
            <b>
              {view.driver.nickname}: {RACER_CONFIDENCE[locked].label}
            </b>{" "}
            <span>{RACER_CONFIDENCE[locked].needs}</span>
          </>
        ) : (
          <b>Repair the car: at least half must be right</b>
        )}
      </div>
      {pin ? (
        <PinDragger key={q.index} image={pin.image} spots={pin.spots} labels={q.options} disabled={!armed} onSubmit={choose} />
      ) : q.type === "text" ? (
        <TextAnswer
          disabled={!armed}
          onSubmit={(text) => {
            setPendingText(text);
            send({ type: "racer.answer", index: q.index, option: 0, text });
          }}
        />
      ) : (
        <div class={`answers n${q.options.length} ${armed ? "" : "racer-unarmed"}`}>
          {q.options.map((text, i) => {
            const c = optionColor(q.type, i);
            return (
              <button key={i} class={`answer opt-${c}`} onClick={() => choose(i)}>
                <Shape index={c} />
                <span>{text}</span>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}

/** The big line of the turn card: the one thing this turn did to the car. */
function turnHeadline(t: RacerTurn, carCrashed: boolean): string {
  if (t.gain > 0) return `+${t.gain} mph`;
  if (t.crashed) return "Crashed!";
  if (t.fails > 0) return plural(t.fails, "fail point");
  if (t.repaired) return "Repaired!";
  if (carCrashed) return "Still broken down";
  return "Speed held";
}

function RacerReveal({ view }: { view: PlayerRacerView }) {
  const q = view.question!;
  const r = view.reveal;
  const t = view.lastTurn;
  const good = !!r?.wasCorrect;
  const heading = !r || (r.choice === null && view.myText === null) ? "No answer" : good ? "Correct!" : "Wrong";
  const tone = t ? (t.gain > 0 || t.repaired ? "up" : t.crashed || t.fails > 0 ? "down" : "") : "";
  return (
    <main class={`result racer-reveal ${good ? "good" : "bad"}`}>
      <div class="racer-reveal-body">
        <div class="racer-reveal-mine">
          <div class="verdict">
            <div class="verdict-icon">{good ? "✓" : "✗"}</div>
            <h1>{heading}</h1>
          </div>
          <ul class="reveal-list">
            {(r?.correct ?? []).map((i) => {
              const c = optionColor(q.type, i);
              return (
                <li key={i} class={`reveal-item opt-${c} is-correct`}>
                  <Shape index={c} />
                  <span class="t">{q.options[i]}</span>
                  <span class="tag">✓ {r!.correct.length > 1 ? "Correct" : "Answer"}</span>
                </li>
              );
            })}
          </ul>
        </div>
        {t && (
          <div class="racer-card">
            <div>
              {t.correct} of {t.total} correct ({t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0}%)
            </div>
            {t.driver && t.confidence && (
              <div>
                {t.driver.nickname} said: {RACER_CONFIDENCE[t.confidence].label}
              </div>
            )}
            <div class={`racer-card-big racer-num ${tone}`}>{turnHeadline(t, view.car.crashed)}</div>
            <div class="racer-num">
              {Math.round(t.speedBefore)} → {Math.round(t.speedAfter)} mph
            </div>
          </div>
        )}
      </div>
      <div class="racer-strip">
        <RacerScene speed={view.car.speed} crashed={view.car.crashed} ejected={!good && t ? { key: t.index, avatars: [view.me.avatar] } : undefined} />
      </div>
    </main>
  );
}

function RacerPodium({ view }: { view: PlayerRacerView }) {
  const r = view.result;
  if (!r) return null;
  return (
    <main class="center racer-podium">
      <p class="muted">Final result</p>
      <div class="final-rank top racer-num">
        {r.distance.toFixed(1)} <span class="unit">miles</span>
      </div>
      <p class="big-score">
        Top speed {Math.round(r.topSpeed)} mph · {plural(r.crashes, "crash", "crashes")}
      </p>
      <div class="racer-card racer-mine">
        <div>{plural(view.me.correct, "correct answer")}</div>
        <div>{plural(view.me.turnsDriven, "turn")} driven</div>
        <div class="racer-num">+{Math.round(view.me.mphGained)} mph as driver</div>
      </div>
      {r.awards.map((a) => (
        <div key={a} class="award-chip">
          🏆 {a}
        </div>
      ))}
    </main>
  );
}
