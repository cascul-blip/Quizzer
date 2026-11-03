import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { FIELD_H, FIELD_W, KART_MS_PER_POINT, KART_TICK_MS } from "../../shared/kart-rules.ts";
import type { HostKartCar, HostView } from "../../shared/protocol.ts";
import { ACCESSORY_ART, AVATAR_ART, Avatar } from "../shared/avatar-art.tsx";
import { CheckeredFlags, KartCar, KartTrack } from "../shared/kart-art.tsx";
import { play, startRev, type Rev } from "../shared/sounds.ts";
import { ordinal, useCountdown } from "../shared/ui.tsx";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen, type Send } from "./common.tsx";
import { Award } from "./tower.tsx";

type KartView = Extract<HostView, { kind: "kart" }>;

/** A jump farther than this between two snapshots is a reset (back on the grid), not a move. */
const SNAP_DIST = 160;
/** How long the spark burst of a wall hit lasts (keep in step with host.css). */
const SPARK_MS = 600;
/** At most one skid sound this often, however many cars hit the wall. */
const SKID_GAP_MS = 220;

/** Distance in field units → metres as shown (a car, 50 units long, is about 5 m). */
const metres = (d: number) => `${Math.max(0, Math.round(d / 10)).toLocaleString("en-US")} m`;
const lapText = (n: number) => `${n} lap${n === 1 ? "" : "s"}`;

/** Projector screen for Kart Rally: countdown → (quiz → intro → drive)… → podium. */
export function KartStage({ view, send }: { view: KartView; send: Send }) {
  const secs = useCountdown(view.phaseRemainingMs, `${view.phase}-${view.round}`);
  const prev = useRef<KartView | null>(null);
  const rev = useRef<Rev | null>(null);

  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!p || view.phase === p.phase) return;
    if (view.phase === "quiz" && view.round === 1) play("start");
    if (view.phase === "drive") play("tickHigh");
    if (view.phase === "podium") play("fanfare");
  }, [view]);

  // 3, 2, 1 before every drive.
  useEffect(() => {
    if ((view.phase === "intro" || view.phase === "countdown") && secs > 0 && secs <= 3) play("tick");
  }, [secs, view.phase]);

  // The engines run while the cars do, louder and higher the faster the field is going.
  const driving = view.phase === "drive";
  useEffect(() => {
    if (!driving) return;
    rev.current = startRev(0.55);
    return () => {
      rev.current?.stop();
      rev.current = null;
    };
  }, [driving]);
  useEffect(() => {
    if (!rev.current || view.cars.length === 0) return;
    const avg = view.cars.reduce((sum, c) => sum + (c.moving ? c.speed : 0), 0) / view.cars.length;
    rev.current.set(avg);
  }, [view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, select, textarea")) return;
      if (e.key === "f" || e.key === "F") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div class="stage kart-stage">
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        <div class="pill kart-pill">🏎️ Kart Rally</div>
        {view.round > 0 && (
          <div class="pill">
            Round {view.round} / {view.rounds}
          </div>
        )}
        <div class="spacer" />
        <div class="pill">👥 {view.playerCount}</div>
        <ScreenControls join={view.join} />
        {view.phase !== "podium" && (
          <button class="btn ghost small" onClick={() => confirm("End the game now? Cars are ranked by the distance driven so far.") && send({ type: "host.end" })}>
            End game
          </button>
        )}
      </header>
      {view.phase === "podium" ? (
        <KartPodium view={view} send={send} />
      ) : (
        <>
          <PhaseBar view={view} secs={secs} />
          <main class={`kart-wrap phase-${view.phase}`}>
            <div class="kart-field-box">
              <div class="kart-field">
                <KartTrack />
                <Cars view={view} />
                {view.phase === "quiz" && (
                  <div class="kart-quiz-note">
                    <div class="kart-quiz-round">
                      Round {view.round} of {view.rounds}
                    </div>
                    <div>📱 Answer questions on your phone</div>
                    <div class="kart-quiz-sub">Every correct answer = {KART_MS_PER_POINT / 1000} second of driving</div>
                  </div>
                )}
              </div>
            </div>
            <Standings view={view} />
            {view.phase === "countdown" && (
              <div class="countdown-overlay kart-overlay">
                <div class="countdown-label">
                  Answer questions on your phone to earn fuel: every correct answer is 1 second of driving.
                  <br />
                  Then steer your car with the wheel on your phone. The gas is always on!
                  <br />
                  Most distance after {view.rounds} rounds wins.
                </div>
                <div class="countdown-num" key={secs}>
                  {Math.max(1, secs)}
                </div>
              </div>
            )}
            {view.phase === "intro" && (
              <div class="countdown-overlay kart-overlay kart-intro">
                <CheckeredFlags />
                <div class="countdown-label">Get ready to drive in…</div>
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

/** The bar across the top drains over each phase, with what to do right now. */
function PhaseBar({ view, secs }: { view: KartView; secs: number }) {
  // Catch up once, when the phase starts (see robot.tsx).
  const key = `${view.phase}-${view.round}`;
  const start = useRef<{ key: string; elapsed: number } | null>(null);
  if (!start.current || start.current.key !== key) start.current = { key, elapsed: Math.max(0, view.phaseDurationMs - view.phaseRemainingMs) };
  const elapsed = start.current.elapsed;
  const moving = view.cars.filter((c) => c.moving).length;
  const label =
    view.phase === "quiz"
      ? `⛽ Answer questions to earn fuel · ${secs}s`
      : view.phase === "drive"
        ? moving > 0
          ? `🏁 Steer with your phone! · ${moving} car${moving === 1 ? "" : "s"} on track · ${secs}s`
          : "🏁 Everyone's out of fuel"
        : "Get ready…";
  return (
    <div class={`robot-bar kart-bar kart-bar-${view.phase}`}>
      <div key={key} class="robot-bar-fill" style={{ animationDuration: `${view.phaseDurationMs}ms`, animationDelay: `-${elapsed}ms` }} />
      <div class="robot-bar-label">{label}</div>
    </div>
  );
}

interface Pose {
  x: number;
  y: number;
  h: number;
}

interface Motion {
  from: Pose;
  to: Pose;
  /** When `to` arrived (performance.now()) and how long to take getting there. */
  at: number;
  dur: number;
  tick: number;
}

/** Shortest turn from a to b, in radians. */
function angleDiff(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function sample(m: Motion, now: number): Pose {
  const k = Math.max(0, Math.min(1, (now - m.at) / m.dur));
  return { x: m.from.x + (m.to.x - m.from.x) * k, y: m.from.y + (m.to.y - m.from.y) * k, h: m.from.h + angleDiff(m.from.h, m.to.h) * k };
}

interface Spark {
  key: number;
  x: number;
  y: number;
}

/**
 * The cars, on an svg laid over the track. Each snapshot sets a new target pose; a rAF loop
 * glides every car there over the time between ticks, writing transforms straight to the DOM.
 */
function Cars({ view }: { view: KartView }) {
  const motions = useRef(new Map<string, Motion>());
  const els = useRef(new Map<string, { pos: SVGGElement | null; rot: SVGGElement | null }>());
  const hits = useRef(new Map<string, number>());
  const lastSkid = useRef(0);
  const sparkSeq = useRef(0);
  const [sparks, setSparks] = useState<Spark[]>([]);

  const apply = (now: number) => {
    for (const [id, m] of motions.current) {
      const el = els.current.get(id);
      if (!el?.pos || !el.rot) continue;
      const p = sample(m, now);
      el.pos.setAttribute("transform", `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
      el.rot.setAttribute("transform", `rotate(${((p.h * 180) / Math.PI).toFixed(2)})`);
    }
  };

  useLayoutEffect(() => {
    const now = performance.now();
    const seen = new Set<string>();
    const fresh: Spark[] = [];
    for (const c of view.cars) {
      seen.add(c.id);
      const to = { x: c.x, y: c.y, h: c.heading };
      const m = motions.current.get(c.id);
      if (!m) motions.current.set(c.id, { from: to, to, at: now, dur: KART_TICK_MS, tick: view.tick });
      else if (m.tick !== view.tick) {
        const cur = sample(m, now);
        const jump = Math.hypot(to.x - cur.x, to.y - cur.y) > SNAP_DIST;
        m.from = jump ? to : cur;
        m.to = to;
        m.at = now;
        m.dur = Math.max(16, Math.min(250, view.tick - m.tick || KART_TICK_MS));
        m.tick = view.tick;
      }
      const before = hits.current.get(c.id);
      if (before !== undefined && c.hits > before && view.phase === "drive") fresh.push({ key: ++sparkSeq.current, x: c.x, y: c.y });
      hits.current.set(c.id, c.hits);
    }
    for (const id of motions.current.keys()) if (!seen.has(id)) motions.current.delete(id);
    for (const id of hits.current.keys()) if (!seen.has(id)) hits.current.delete(id);
    apply(now);
    if (fresh.length > 0) {
      if (now - lastSkid.current > SKID_GAP_MS) {
        lastSkid.current = now;
        play("skid");
      }
      setSparks((s) => [...s, ...fresh]);
      const keys = new Set(fresh.map((f) => f.key));
      setTimeout(() => setSparks((s) => s.filter((x) => !keys.has(x.key))), SPARK_MS);
    }
  }, [view]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      apply(performance.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const drive = view.phase === "drive";
  const crowded = view.cars.length > 14;
  return (
    <svg class={`kart-cars ${crowded ? "crowded" : ""}`} viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {view.cars.map((c) => (
        <g
          key={c.id}
          class={`kart-car-pos ${c.connected ? "" : "offline"} ${c.rank === 1 && view.round > 1 ? "leader" : ""}`}
          ref={(el) => {
            const e = els.current.get(c.id) ?? { pos: null, rot: null };
            e.pos = el;
            els.current.set(c.id, e);
          }}
        >
          <g
            ref={(el) => {
              const e = els.current.get(c.id) ?? { pos: null, rot: null };
              e.rot = el;
              els.current.set(c.id, e);
            }}
          >
            <KartCar color={c.color} wheel={drive ? c.wheel : 0} />
          </g>
          <NameTag car={c} drive={drive} />
        </g>
      ))}
      {sparks.map((s) => (
        <g key={s.key} transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})`}>
          <g class="kart-spark">
            <circle r="9" fill="#fff6c2" />
            {Array.from({ length: 10 }, (_, i) => {
              const a = (i / 10) * Math.PI * 2 + (s.key % 5) * 0.3;
              const r0 = 6;
              const r1 = 16 + ((i * 7 + s.key) % 3) * 6;
              return <line key={i} x1={(Math.cos(a) * r0).toFixed(1)} y1={(Math.sin(a) * r0).toFixed(1)} x2={(Math.cos(a) * r1).toFixed(1)} y2={(Math.sin(a) * r1).toFixed(1)} stroke={i % 2 ? "#ffd23f" : "#ff8a1f"} stroke-width="2.6" stroke-linecap="round" />;
            })}
          </g>
        </g>
      ))}
    </svg>
  );
}

/** Avatar and name above a car (unrotated), with a fuel gauge while it drives. */
function NameTag({ car, drive }: { car: HostKartCar; drive: boolean }) {
  const art = AVATAR_ART[car.avatar.avatar] ?? AVATAR_ART.cat;
  const extra = ACCESSORY_ART[car.avatar.accessory] ?? ACCESSORY_ART.none;
  const fuel = car.fuelStartMs > 0 ? Math.max(0, Math.min(1, car.fuelMs / car.fuelStartMs)) : 0;
  const size = 22;
  const name = car.nickname.length > 12 ? `${car.nickname.slice(0, 11)}…` : car.nickname;
  return (
    <g class="kart-tag" transform="translate(0 -34)">
      <circle r={size / 2 + 2} fill={car.color} stroke="#fff" stroke-width="1.5" />
      <g transform={`translate(${-size / 2} ${-size / 2}) scale(${size / 100})`}>
        {art()}
        {extra()}
      </g>
      <text class="kart-tag-name" x={size / 2 + 5} y="4.5">
        {name}
      </text>
      {drive && car.fuelStartMs > 0 && (
        <g transform={`translate(${-size / 2} ${size / 2 + 3})`}>
          <rect width={size} height="4" rx="2" fill="rgba(0,0,0,0.6)" />
          <rect width={(size * fuel).toFixed(1)} height="4" rx="2" fill={fuel > 0.3 ? "#3ddc6a" : "#ff8a1f"} />
        </g>
      )}
    </g>
  );
}

/** Side panel: this round's fuel during the quiz, the running order while driving. */
function Standings({ view }: { view: KartView }) {
  const drive = view.phase === "drive";
  const quiz = view.phase === "quiz" || view.phase === "intro" || view.phase === "countdown";
  const cars = [...view.cars].sort((a, b) => a.rank - b.rank || a.nickname.localeCompare(b.nickname));
  const crowded = cars.length > 16;
  return (
    <section class={`kart-standings ${crowded ? "crowded" : ""}`}>
      <h2>{drive ? "🏁 Race order" : view.round <= 1 && view.phase !== "intro" ? "⛽ Fuel this round" : "⛽ Fuel · race order"}</h2>
      <div class="kart-standings-head">
        <span>Pos</span>
        <span />
        <span>Driver</span>
        <span>Fuel</span>
        <span>Laps</span>
      </div>
      <ul>
        {cars.map((c) => (
          <li key={c.id} class={`${c.connected ? "" : "offline"} ${drive && !c.moving ? "parked" : ""}`} style={{ "--car": c.color }}>
            <span class="kart-pos">{c.rank}</span>
            <Avatar choice={c.avatar} />
            <span class="n">{c.nickname}</span>
            <span class="kart-fuel">{drive ? (c.fuelMs > 0 ? `${(c.fuelMs / 1000).toFixed(1)}s` : c.moving ? "…" : "🏁") : quiz ? `⛽ ${c.points}` : ""}</span>
            <span class="kart-laps">{c.laps}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function KartPodium({ view, send }: { view: KartView; send: Send }) {
  const [showErrors, setShowErrors] = useState(false);
  const standings = view.standings ?? [];
  const winners = standings.filter((s) => s.rank === 1);
  const a = view.awards;
  const title = winners.length === 0 ? "Race over" : winners.length === 1 ? `🏆 ${winners[0]!.nickname} wins!` : `🏆 ${winners.map((w) => w.nickname).join(" & ")} win!`;
  return (
    <main class="podium tower-podium kart-podium">
      <div class="podium-bg" aria-hidden="true">
        <KartTrack />
      </div>
      <h1>{title}</h1>
      {showErrors ? (
        <ErrorsTable errors={view.errors ?? []} />
      ) : (
        <>
          <ol class="kart-final">
            {standings.slice(0, Math.max(5, winners.length)).map((s, i) => (
              <li key={s.id} class={s.rank === 1 ? "won" : ""} style={{ animationDelay: `${i * 80}ms`, "--car": s.color }}>
                <span class="lb-rank">{ordinal(s.rank)}</span>
                <Avatar choice={s.avatar} />
                <span class="lb-name">{s.nickname}</span>
                <span class="kart-final-dist">
                  <b>{lapText(s.laps)}</b> · {metres(s.distance)}
                </span>
              </li>
            ))}
          </ol>
          <div class="awards">
            <Award icon="✅" title="Most correct answers" award={a?.mostCorrect ?? null} unit="correct" />
            <Award icon="🧈" title="Smoothest driver" award={a?.smoothest ?? null} unit="wall hits" valueText={(v) => (v === 0 ? "No wall hits" : `${v} wall hit${v === 1 ? "" : "s"}`)} />
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
