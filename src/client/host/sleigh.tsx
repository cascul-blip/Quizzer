import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { FIELD_H, FIELD_W, METRES_PER_UNIT, SLEIGH_MS_PER_POINT, SLEIGH_TICK_MS } from "../../shared/sleigh-rules.ts";
import type { HostSleighPlayer, HostView, SleighHouse } from "../../shared/protocol.ts";
import { ACCESSORY_ART, AVATAR_ART, Avatar } from "../shared/avatar-art.tsx";
import { CELEBRATION_IMG, CandyCanes, CityGround, Gift, House, HouseDefs, SNOW_PUFF_IMG, SPARKLE_IMG, SleighTeam, SleighTeamDefs, Snowfall, TAKEOFF_IMG } from "../shared/sleigh-art.tsx";
import { play, startJingle } from "../shared/sounds.ts";
import { ordinal, useCountdown } from "../shared/ui.tsx";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen, type Send } from "./common.tsx";
import { Award } from "./tower.tsx";

type SleighView = Extract<HostView, { kind: "sleigh" }>;
type Jingle = NonNullable<ReturnType<typeof startJingle>>;

/** A jump farther than this between two snapshots is a reset (back on the launch pad), not a move. */
const SNAP_DIST = 160;
/** How long a snow puff after a wall bump lasts (keep in step with host.css). */
const PUFF_MS = 700;
/** How long a delivery's drop, burst and "+1" pop last (keep in step with host.css). */
const DROP_MS = 1700;
/** At most one bump sound this often, however many sleighs hit the wall. */
const BUMP_GAP_MS = 220;

const metres = (d: number) => `${Math.max(0, Math.round(d * METRES_PER_UNIT)).toLocaleString("en-US")} m`;
const SECS_PER_POINT = SLEIGH_MS_PER_POINT / 1000;

/** Projector screen for Santa's Sleigh Run: countdown → (quiz → intro → flight)… → finale → podium. */
export function SleighStage({ view, send }: { view: SleighView; send: Send }) {
  const secs = useCountdown(view.phaseRemainingMs, `${view.phase}-${view.round}`);
  const prev = useRef<SleighView | null>(null);
  const jingle = useRef<Jingle | null>(null);

  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!p) return;
    if (view.finished && !p.finished) play("jingle");
    if (view.phase === p.phase) return;
    if (view.phase === "quiz" && view.round === 1) play("start");
    if (view.phase === "flight") play("jingle");
    if (view.phase === "podium") play("fanfare");
  }, [view]);

  // 3, 2, 1 before every flight.
  useEffect(() => {
    if ((view.phase === "intro" || view.phase === "countdown") && secs > 0 && secs <= 3) play("tick");
  }, [secs, view.phase]);

  // Sleigh bells ring while the sleighs fly, louder the more of them are in the air.
  const flying = view.phase === "flight" && !view.finished;
  useEffect(() => {
    if (!flying) return;
    jingle.current = startJingle(0.5);
    return () => {
      jingle.current?.stop();
      jingle.current = null;
    };
  }, [flying]);
  useEffect(() => {
    if (!jingle.current || view.sleighs.length === 0) return;
    const avg = view.sleighs.reduce((sum, s) => sum + (s.moving ? s.speed : 0), 0) / view.sleighs.length;
    jingle.current.set(avg);
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
    <div class="stage sleigh-stage">
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        <div class="pill sleigh-pill">🎅 Santa's Sleigh Run</div>
        {view.round > 0 && <div class="pill">Round {view.round}</div>}
        <div class="pill sleigh-count-pill">
          🎁 {view.delivered} / {view.total}
        </div>
        <div class="spacer" />
        <div class="pill">👥 {view.playerCount}</div>
        <ScreenControls join={view.join} />
        {view.phase !== "podium" && (
          <button class="btn ghost small" onClick={() => confirm("End the game now? Sleighs are ranked by the presents delivered so far.") && send({ type: "host.end" })}>
            End game
          </button>
        )}
      </header>
      {view.phase === "podium" ? (
        <SleighPodium view={view} send={send} />
      ) : (
        <>
          <PhaseBar view={view} secs={secs} />
          <main class={`sleigh-wrap phase-${view.phase} ${view.finished ? "finished" : ""}`}>
            <div class="sleigh-field-box">
              <div class="sleigh-field">
                <CityGround />
                <Houses view={view} />
                <Sleighs view={view} />
                <Snowfall />
                {view.phase === "quiz" && (
                  <div class="sleigh-quiz-note">
                    <div class="sleigh-quiz-round">Round {view.round}</div>
                    <div>📱 Answer questions to power your reindeer</div>
                    <div class="sleigh-quiz-sub">
                      🎁 {view.delivered} of {view.total} delivered · every correct answer = {SECS_PER_POINT} s of flying
                    </div>
                  </div>
                )}
              </div>
            </div>
            <Standings view={view} />
            {view.phase === "countdown" && (
              <div class="countdown-overlay sleigh-overlay">
                <div class="sleigh-overlay-title">🎅 Santa needs your help! 🎄</div>
                <div class="countdown-label">
                  Answer questions on your phone: every correct answer gives your reindeer {SECS_PER_POINT} seconds of flying.
                  <br />
                  Then steer your sleigh with the joystick on your phone and fly over the houses to drop their presents down the chimney.
                  <br />
                  Deliver the most presents to win!
                </div>
                <div class="countdown-num" key={secs}>
                  {Math.max(1, secs)}
                </div>
              </div>
            )}
            {view.phase === "intro" && (
              <div class="countdown-overlay sleigh-overlay sleigh-intro" style={{ "--scene": `url(${TAKEOFF_IMG})` }}>
                <CandyCanes />
                <div class="countdown-label">Get ready to fly in…</div>
                <div class="countdown-num" key={secs}>
                  {Math.max(1, secs)}
                </div>
              </div>
            )}
            {view.finished && view.phase === "flight" && <Finale total={view.total} />}
          </main>
        </>
      )}
    </div>
  );
}

/** The bar across the top drains over each phase, with what to do right now. */
function PhaseBar({ view, secs }: { view: SleighView; secs: number }) {
  // Catch up once, when the phase starts (see robot.tsx).
  const key = `${view.phase}-${view.round}-${view.finished}`;
  const start = useRef<{ key: string; elapsed: number } | null>(null);
  if (!start.current || start.current.key !== key) start.current = { key, elapsed: Math.max(0, view.phaseDurationMs - view.phaseRemainingMs) };
  const elapsed = start.current.elapsed;
  const moving = view.sleighs.filter((s) => s.moving).length;
  const left = view.total - view.delivered;
  const label =
    view.phase === "quiz"
      ? `🦌 Answer questions to power your reindeer · ${secs}s`
      : view.phase === "flight"
        ? view.finished
          ? "🎄 Every present delivered!"
          : moving > 0
            ? `🛷 Steer with your phone! · ${moving} sleigh${moving === 1 ? "" : "s"} flying · ${left} present${left === 1 ? "" : "s"} to go · ${secs}s`
            : "🦌 The reindeer need a rest"
        : "Get ready…";
  return (
    <div class={`robot-bar sleigh-bar sleigh-bar-${view.phase}`}>
      <div key={key} class="robot-bar-fill" style={{ animationDuration: `${view.phaseDurationMs}ms`, animationDelay: `-${elapsed}ms` }} />
      <div class="robot-bar-label">{label}</div>
    </div>
  );
}

/** Each player's colour by id, for the houses they delivered to. */
function colorsOf(sleighs: { id: string; color: string }[]): Map<string, string> {
  return new Map(sleighs.map((s) => [s.id, s.color]));
}

/** The houses, re-drawn only when a present is delivered (or a deliverer's colour changes). */
function Houses({ view }: { view: SleighView }) {
  const colors = colorsOf(view.sleighs);
  const key = view.houses.map((h) => `${h.id}:${h.deliveredBy ? colors.get(h.deliveredBy) ?? "?" : ""}`).join("|");
  return useMemo(
    () => (
      <svg class="sleigh-houses" viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <HouseDefs />
        {view.houses.map((h) => (
          <House key={h.id} house={h} color={h.deliveredBy ? colors.get(h.deliveredBy) ?? "#ffd23f" : null} />
        ))}
      </svg>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
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

interface Puff {
  key: number;
  x: number;
  y: number;
}

interface Drop {
  key: number;
  /** Where the present starts (the sleigh) and lands (the chimney). */
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  color: string;
  name: string;
}

const chimneyOf = (h: SleighHouse) => ({ x: h.x + h.chimney.x, y: h.y + h.chimney.y });

/**
 * The sleighs, on an svg laid over the town. Each snapshot sets a new target pose; a rAF loop
 * glides every sleigh there over the time between ticks, writing transforms straight to the DOM.
 * New deliveries drop a present down the chimney; wall bumps throw up a puff of snow.
 */
function Sleighs({ view }: { view: SleighView }) {
  const motions = useRef(new Map<string, Motion>());
  const els = useRef(new Map<string, { pos: SVGGElement | null; rot: SVGGElement | null }>());
  const bumps = useRef(new Map<string, number>());
  const delivered = useRef<Map<number, string | null> | null>(null);
  const lastBump = useRef(0);
  const seq = useRef(0);
  const [puffs, setPuffs] = useState<Puff[]>([]);
  const [drops, setDrops] = useState<Drop[]>([]);

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
    const freshPuffs: Puff[] = [];
    for (const s of view.sleighs) {
      seen.add(s.id);
      const to = { x: s.x, y: s.y, h: s.heading };
      const m = motions.current.get(s.id);
      if (!m) motions.current.set(s.id, { from: to, to, at: now, dur: SLEIGH_TICK_MS, tick: view.tick });
      else if (m.tick !== view.tick) {
        const cur = sample(m, now);
        const jump = Math.hypot(to.x - cur.x, to.y - cur.y) > SNAP_DIST;
        m.from = jump ? to : cur;
        m.to = to;
        m.at = now;
        m.dur = Math.max(16, Math.min(250, view.tick - m.tick || SLEIGH_TICK_MS));
        m.tick = view.tick;
      }
      const before = bumps.current.get(s.id);
      if (before !== undefined && s.bumps > before && view.phase === "flight") freshPuffs.push({ key: ++seq.current, x: s.x, y: s.y });
      bumps.current.set(s.id, s.bumps);
    }
    for (const id of motions.current.keys()) if (!seen.has(id)) motions.current.delete(id);
    for (const id of bumps.current.keys()) if (!seen.has(id)) bumps.current.delete(id);

    // Every house that has just been delivered to (more than one can land in a tick).
    const freshDrops: Drop[] = [];
    const was = delivered.current;
    if (was) {
      for (const h of view.houses) {
        if (!h.deliveredBy || was.get(h.id)) continue;
        const who = view.sleighs.find((s) => s.id === h.deliveredBy);
        const m = motions.current.get(h.deliveredBy);
        const from = m ? sample(m, now) : who ? { x: who.x, y: who.y } : chimneyOf(h);
        const to = chimneyOf(h);
        freshDrops.push({ key: ++seq.current, sx: from.x, sy: from.y, tx: to.x, ty: to.y, color: who?.color ?? "#ffd23f", name: who?.nickname ?? "" });
      }
    }
    delivered.current = new Map(view.houses.map((h) => [h.id, h.deliveredBy]));

    apply(now);
    if (freshPuffs.length > 0) {
      if (now - lastBump.current > BUMP_GAP_MS) {
        lastBump.current = now;
        play("thud");
      }
      setPuffs((p) => [...p, ...freshPuffs]);
      const keys = new Set(freshPuffs.map((f) => f.key));
      setTimeout(() => setPuffs((p) => p.filter((x) => !keys.has(x.key))), PUFF_MS);
    }
    if (freshDrops.length > 0) {
      play("deliver");
      setDrops((d) => [...d, ...freshDrops]);
      const keys = new Set(freshDrops.map((f) => f.key));
      setTimeout(() => setDrops((d) => d.filter((x) => !keys.has(x.key))), DROP_MS);
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

  const flight = view.phase === "flight";
  const crowded = view.sleighs.length > 14;
  return (
    <svg class={`sleigh-sleighs ${crowded ? "crowded" : ""}`} viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {puffs.map((p) => (
        <g key={p.key} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
          <image class="sleigh-puff" href={SNOW_PUFF_IMG} x="-24" y="-24" width="48" height="48" />
        </g>
      ))}
      <SleighTeamDefs />
      {view.sleighs.map((s) => (
        <g
          key={s.id}
          class={`sleigh-pos ${s.connected ? "" : "offline"} ${s.rank === 1 && s.presents > 0 ? "leader" : ""} ${flight && !s.moving ? "parked" : ""}`}
          ref={(el) => {
            const e = els.current.get(s.id) ?? { pos: null, rot: null };
            e.pos = el;
            els.current.set(s.id, e);
          }}
        >
          <g
            ref={(el) => {
              const e = els.current.get(s.id) ?? { pos: null, rot: null };
              e.rot = el;
              els.current.set(s.id, e);
            }}
          >
            <SleighTeam color={s.color} turn={s.turn} gallop={flight && s.moving && s.speed > 0} flying={flight && s.moving && s.speed > 0.2} />
          </g>
          <NameTag sleigh={s} flight={flight} />
        </g>
      ))}
      {drops.map((d) => (
        <g key={d.key} transform={`translate(${d.tx.toFixed(1)} ${d.ty.toFixed(1)})`}>
          <image class="sleigh-burst" href={SPARKLE_IMG} x="-45" y="-45" width="90" height="90" />
          <g class="sleigh-drop" style={{ "--dx": `${(d.sx - d.tx).toFixed(1)}px`, "--dy": `${(d.sy - d.ty).toFixed(1)}px` }}>
            <Gift s={20} color={d.color} />
          </g>
          <text class="sleigh-pop" y="-62" text-anchor="middle">
            +1 🎁 {d.name.length > 12 ? `${d.name.slice(0, 11)}…` : d.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Avatar and name above a sleigh (unrotated), with an energy bar while it flies. */
function NameTag({ sleigh: s, flight }: { sleigh: HostSleighPlayer; flight: boolean }) {
  const art = AVATAR_ART[s.avatar.avatar] ?? AVATAR_ART.cat;
  const extra = ACCESSORY_ART[s.avatar.accessory] ?? ACCESSORY_ART.none;
  const energy = s.fuelStartMs > 0 ? Math.max(0, Math.min(1, s.fuelMs / s.fuelStartMs)) : 0;
  const size = 22;
  const name = s.nickname.length > 12 ? `${s.nickname.slice(0, 11)}…` : s.nickname;
  return (
    <g class="sleigh-tag" transform="translate(0 -44)">
      <circle r={size / 2 + 2.5} fill={s.color} stroke="#fff" stroke-width="1.5" />
      <g transform={`translate(${-size / 2} ${-size / 2}) scale(${size / 100})`}>
        {art()}
        {extra()}
      </g>
      <text class="sleigh-tag-name" x={size / 2 + 5} y="4.5">
        {name}
        {s.presents > 0 && <tspan class="sleigh-tag-count"> 🎁{s.presents}</tspan>}
      </text>
      {flight && s.fuelStartMs > 0 && (
        <g transform={`translate(${-size / 2} ${size / 2 + 3.5})`}>
          <rect width={size} height="4" rx="2" fill="rgba(0,0,0,0.6)" />
          <rect width={(size * energy).toFixed(1)} height="4" rx="2" fill={energy > 0.3 ? "#ffd23f" : "#ff6b4a"} />
        </g>
      )}
    </g>
  );
}

/** Side panel: presents per player, with this round's points (quiz) or flying time left (flight). */
function Standings({ view }: { view: SleighView }) {
  const flight = view.phase === "flight";
  const sleighs = [...view.sleighs].sort((a, b) => a.rank - b.rank || a.nickname.localeCompare(b.nickname));
  const crowded = sleighs.length > 16;
  return (
    <section class={`sleigh-standings ${crowded ? "crowded" : ""}`}>
      <h2>🎁 Presents delivered</h2>
      <div class="sleigh-standings-head">
        <span>#</span>
        <span />
        <span>Sleigh</span>
        <span>{flight ? "Flying" : "Points"}</span>
        <span>🎁</span>
      </div>
      <ul>
        {sleighs.map((s) => (
          <li key={s.id} class={`${s.connected ? "" : "offline"} ${flight && !s.moving ? "parked" : ""}`} style={{ "--car": s.color }}>
            <span class="sleigh-pos-n">{s.rank}</span>
            <Avatar choice={s.avatar} />
            <span class="n">{s.nickname}</span>
            <span class="sleigh-energy">{flight ? (s.fuelMs > 0 ? `🦌 ${(s.fuelMs / 1000).toFixed(1)}s` : s.moving ? "…" : "💤") : `⭐ ${s.points}`}</span>
            <span class="sleigh-presents">{s.presents}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Every present delivered!", with a burst of confetti and snow. */
function Finale({ total }: { total: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        x: (i * 37) % 100,
        d: ((i * 13) % 20) / 10,
        s: 2.2 + ((i * 7) % 10) / 6,
        c: ["#e63946", "#ffd23f", "#2a9d3f", "#ffffff", "#4db8ff", "#ff7ad9"][i % 6]!,
        r: (i * 47) % 360,
        snow: i % 3 === 0,
      })),
    [],
  );
  return (
    <div class="sleigh-finale">
      <div class="sleigh-confetti" aria-hidden="true">
        {bits.map((b, i) => (
          <i key={i} class={b.snow ? "snow" : ""} style={{ left: `${b.x}%`, animationDelay: `${b.d * 0.5}s`, animationDuration: `${b.s}s`, background: b.snow ? undefined : b.c, rotate: `${b.r}deg` }} />
        ))}
      </div>
      <div class="sleigh-finale-card">
        <div class="sleigh-finale-title">🎄 Every present delivered! 🎄</div>
        <div class="sleigh-finale-sub">All {total} houses have their presents. Merry Christmas!</div>
      </div>
    </div>
  );
}

function SleighPodium({ view, send }: { view: SleighView; send: Send }) {
  const [showErrors, setShowErrors] = useState(false);
  const standings = view.standings ?? [];
  const winners = standings.filter((s) => s.rank === 1);
  const a = view.awards;
  const title = winners.length === 0 ? "Sleigh run over" : winners.length === 1 ? `🏆 ${winners[0]!.nickname} wins!` : `🏆 ${winners.map((w) => w.nickname).join(" & ")} win!`;
  return (
    <main class="podium tower-podium sleigh-podium">
      <div class="podium-bg" aria-hidden="true">
        <img class="sleigh-podium-scene" src={CELEBRATION_IMG} alt="" />
      </div>
      <Snowfall />
      <h1>{title}</h1>
      {showErrors ? (
        <ErrorsTable errors={view.errors ?? []} />
      ) : (
        <>
          <ol class="sleigh-final">
            {standings.slice(0, Math.max(5, winners.length)).map((s, i) => (
              <li key={s.id} class={s.rank === 1 ? "won" : ""} style={{ animationDelay: `${i * 80}ms`, "--car": s.color }}>
                <span class="lb-rank">{ordinal(s.rank)}</span>
                <Avatar choice={s.avatar} />
                <span class="lb-name">{s.nickname}</span>
                <span class="sleigh-final-dist">
                  <b>
                    🎁 {s.presents} present{s.presents === 1 ? "" : "s"}
                  </b>{" "}
                  · {metres(s.distance)}
                </span>
              </li>
            ))}
          </ol>
          <div class="awards">
            <Award icon="✅" title="Most correct answers" award={a?.mostCorrect ?? null} unit="correct" />
            <Award icon="🛷" title="Smoothest flyer" award={a?.smoothest ?? null} unit="bumps" valueText={(v) => (v === 0 ? "No bumps" : `${v} bump${v === 1 ? "" : "s"}`)} />
            <Award icon="🦌" title="Furthest flown" award={a?.furthest ?? null} unit="m" valueText={metres} />
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
