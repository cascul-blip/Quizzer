import { useEffect, useRef, useState } from "preact/hooks";
import type { PlayerRacerView, RacerTurn } from "../../shared/modes/racer.ts";
import type { ClientMsg } from "../../shared/protocol.ts";
import type { RacerConfidence } from "../../shared/racer-rules.ts";
import { RACER_CONFIDENCE, RACER_CONFIDENCE_LEVELS } from "../../shared/racer-rules.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import { PinDragger } from "../shared/pin.tsx";
import { RacerScene } from "../shared/racer-art.tsx";
import { play } from "../shared/sounds.ts";
import { Tex, visibleLength } from "../shared/tex.tsx";
import { LockedChoice, optionColor, Shape, TextAnswer, useCountdown } from "../shared/ui.tsx";

type Send = (m: ClientMsg) => void;

const GO_HOLD_MS = 1000;
/** why: if the server has not opened the question by then, the driver may try again. */
const GO_RETRY_MS = 1500;
/** why: so the finger lifting off Go or the lever can't answer. */
const ANSWER_TAP_GUARD_MS = 600;
const LEVER_CONFIRM_TIMEOUT_MS = 800;
/** why: longer questions are set in smaller type so every screen fits without scrolling. */
const LONG_QUESTION_CHARS = 140;

const TOP_STOP_TRACK_FRACTION = 1 / 6;
const BOTTOM_STOP_TRACK_FRACTION = 5 / 6;

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const qClass = (text: string) => (visibleLength(text) > LONG_QUESTION_CHARS ? "long" : "");

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
        <p class={`q-text racer-q ${qClass(q.text)}`}>
          <Tex text={q.text} />
        </p>
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
        <span class="score racer-num">{view.car.crashed ? "Crashed" : `${Math.round(view.car.speedMph)} mph`}</span>
      </header>
      {body}
    </div>
  );
}

function DriverScreen({ view, send }: { view: PlayerRacerView; send: Send }) {
  const q = view.question!;
  const secs = useCountdown(view.phaseRemainingMs, `confidence:${q.index}`);
  const [pendingLevel, setPendingLevel] = useState<RacerConfidence | null>(null);
  const level = pendingLevel ?? view.lever ?? "low";
  const current = useRef(level);
  current.current = level;
  useEffect(() => {
    if (pendingLevel && pendingLevel === view.lever) setPendingLevel(null);
  }, [pendingLevel, view.lever]);
  useEffect(() => {
    if (!pendingLevel) return;
    const t = setTimeout(() => setPendingLevel(null), LEVER_CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [pendingLevel]);

  const change = (next: RacerConfidence) => {
    if (next === current.current) return;
    current.current = next;
    setPendingLevel(next);
    send({ type: "racer.lever", level: next });
    navigator.vibrate?.(10);
    play("leverClick");
  };
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
        <p class={`q-text racer-q ${qClass(q.text)}`}>
          <Tex text={q.text} />
        </p>
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

function WatchScreen({ view }: { view: PlayerRacerView }) {
  const q = view.question!;
  return (
    <main class="center racer-watch">
      <p class={`q-text racer-q ${qClass(q.text)}`}>
        <Tex text={q.text} />
      </p>
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

type LeverPosition = { kind: "atStop" } | { kind: "dragging"; bottomToTopFraction: number };

const BOTTOM_STOP_FRACTION = 0;
const TOP_STOP_FRACTION = 1;

function Lever({ level, onChange }: { level: RacerConfidence; onChange?: (level: RacerConfidence) => void }) {
  const last = RACER_CONFIDENCE_LEVELS.length - 1;
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [position, setPosition] = useState<LeverPosition>({ kind: "atStop" });

  const follow = (e: PointerEvent) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return;
    const pointerTrackFraction = (e.clientY - rect.top) / rect.height;
    const bottomToTopFraction = Math.max(
      BOTTOM_STOP_FRACTION,
      Math.min(TOP_STOP_FRACTION, (BOTTOM_STOP_TRACK_FRACTION - pointerTrackFraction) / (BOTTOM_STOP_TRACK_FRACTION - TOP_STOP_TRACK_FRACTION)),
    );
    setPosition({ kind: "dragging", bottomToTopFraction });
    const nearestStop = RACER_CONFIDENCE_LEVELS[Math.round(bottomToTopFraction * last)]!;
    onChange?.(nearestStop);
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
    setPosition({ kind: "atStop" });
  };

  const bottomToTopFraction = position.kind === "dragging" ? position.bottomToTopFraction : RACER_CONFIDENCE_LEVELS.indexOf(level) / last;
  const handleTopPct = (BOTTOM_STOP_TRACK_FRACTION - bottomToTopFraction * (BOTTOM_STOP_TRACK_FRACTION - TOP_STOP_TRACK_FRACTION)) * 100;
  const handlers = onChange ? { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onEnd, onPointerCancel: onEnd, onLostPointerCapture: onEnd } : {};
  const topDown = [...RACER_CONFIDENCE_LEVELS].reverse();
  return (
    <div class={`racer-lever ${onChange ? "" : "small"} ${position.kind === "dragging" ? "dragging" : ""}`}>
      <div
        class="racer-track"
        ref={track}
        role="slider"
        aria-label="Confidence"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={RACER_CONFIDENCE_LEVELS.indexOf(level)}
        aria-valuetext={RACER_CONFIDENCE[level].label}
        aria-readonly={!onChange}
        {...handlers}
      >
        <div class="racer-slot" />
        {topDown.map((lv, i) => (
          <i key={lv} class="racer-notch" style={{ top: `${((2 * i + 1) / (2 * topDown.length)) * 100}%` }} />
        ))}
        <div class="racer-handle" style={{ top: `${handleTopPct}%` }} />
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

function RacerAnswering({ view, send }: { view: PlayerRacerView; send: Send }) {
  const q = view.question!;
  const [pending, setPending] = useState<number | null>(null);
  const secs = useCountdown(q.remainingMs, `open:${q.index}`);
  const [armed, setArmed] = useState(!view.isDriver);
  useEffect(() => {
    if (armed) return;
    const t = setTimeout(() => setArmed(true), ANSWER_TAP_GUARD_MS);
    return () => clearTimeout(t);
  }, []);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const chosen = view.myChoice ?? pending;
  const typed = view.myText ?? pendingText;

  if (chosen !== null || typed !== null) {
    return (
      <main class="center">
        {typed !== null ? <div class="locked-text">{typed}</div> : <LockedChoice type={q.type} index={chosen!} label={q.options[chosen!] ?? ""} />}
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
        <h2 class={`q-text ${qClass(q.text)}`}>
          <Tex text={q.text} />
        </h2>
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
          key={q.index}
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
                <span>
                  <Tex text={text} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}

function turnHeadline(t: RacerTurn, carCrashed: boolean): string {
  if (t.gainMph > 0) return `+${t.gainMph} mph`;
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
  const tone = t ? (t.gainMph > 0 || t.repaired ? "up" : t.crashed || t.fails > 0 ? "down" : "") : "";
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
                  <span class="t">
                    <Tex text={q.options[i]!} />
                  </span>
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
        <RacerScene
          theme={view.theme}
          speed={view.car.speedMph}
          crashed={view.car.crashed}
          ejected={!good && t ? { key: t.index, riders: [{ avatar: view.me.avatar, name: view.me.nickname }] } : undefined}
        />
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
        {r.distanceMiles.toFixed(1)} <span class="unit">miles</span>
      </div>
      <p class="big-score">
        Top speed {Math.round(r.topSpeedMph)} mph · {plural(r.crashes, "crash", "crashes")}
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
