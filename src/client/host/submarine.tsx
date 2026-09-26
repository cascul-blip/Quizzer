import { useEffect, useRef, useState } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import type { HostView, SubAward } from "../../shared/protocol.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import { Anglerfish, Submarine, oceanGradient, type PortholeFace } from "../shared/sea-art.tsx";
import { play } from "../shared/sounds.ts";
import { useEventFlash } from "../shared/tower-art.tsx";
import { useCountdown } from "../shared/ui.tsx";
import { ScreenControls, toggleFullscreen, type Send } from "./common.tsx";

type SubView = Extract<HostView, { kind: "sub" }>;

/** Distance to the fish, animated locally between server updates. */
function useLiveGap(view: SubView): number {
  const base = useRef({ gap: view.gap, at: performance.now() });
  const last = useRef(view);
  if (last.current !== view) {
    last.current = view;
    base.current = { gap: view.gap, at: performance.now() };
  }
  const [, tick] = useState(0);
  useEffect(() => {
    if (view.phase !== "chase") return;
    let raf = 0;
    const loop = () => {
      tick((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [view.phase]);
  if (view.phase !== "chase") return view.gap;
  return Math.max(0, base.current.gap - (view.speed * (performance.now() - base.current.at)) / 1000);
}

/**
 * Fish placement (left edge, % of the sea). At gap 0 the front of its open mouth
 * touches the sub's propeller; at the max gap it's mostly off-screen.
 */
const FISH_TOUCH_LEFT = 27;
const FISH_FAR_LEFT = -24;
/** On a catch: lunge this far with jaws wide (the propeller goes in), then snap shut. */
const LUNGE_LEFT = 8;
const LUNGE_MS = 450;
const SNAP_MS = 140;
const SWALLOW_AT_MS = LUNGE_MS + SNAP_MS + 60;

/** Milliseconds since the catch began, re-rendering every frame until the bite is over. */
function useCatchClock(caught: boolean): number {
  const start = useRef(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!caught) return;
    start.current = performance.now();
    let raf = 0;
    const loop = () => {
      tick((n) => n + 1);
      if (performance.now() - start.current < SWALLOW_AT_MS + 100) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [caught]);
  return caught && start.current ? performance.now() - start.current : 0;
}

const easeOut = (t: number) => 1 - (1 - Math.max(0, Math.min(1, t))) ** 3;

/** How long a boost notice stays next to the sub, and how many can stack. */
const POP_MS = 2600;
const MAX_POPS = 3;
/** Someone looks out of a porthole every PEEK_EVERY_MS..+PEEK_JITTER_MS, for PEEK_MS. */
const PEEK_MS = 3000;
const PEEK_EVERY_MS = 3000;
const PEEK_JITTER_MS = 3000;
const PORTHOLE_COUNT = 3;
const MIDDLE_PORTHOLE = 1;

/** Players' avatars occasionally look out of the portholes; the latest booster pops into the middle one. */
function usePortholeFaces(players: SubView["players"], boost: SubView["lastBoost"]): (PortholeFace | null)[] {
  const [faces, setFaces] = useState<(PortholeFace | null)[]>(() => Array(PORTHOLE_COUNT).fill(null));
  const facesRef = useRef(faces);
  facesRef.current = faces;
  const playersRef = useRef(players);
  playersRef.current = players;
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };
  const show = (slot: number, choice: AvatarChoice) => {
    const key = `${performance.now()}-${slot}`;
    setFaces((f) => f.map((x, i) => (i === slot ? { key, choice } : x)));
    later(() => setFaces((f) => f.map((x, i) => (i === slot && x?.key === key ? null : x))), PEEK_MS);
  };

  useEffect(() => {
    const tick = () => {
      // Prefer players who aren't already at a window.
      const showing = new Set(facesRef.current.map((f) => (f ? `${f.choice.avatar}/${f.choice.accessory}` : "")));
      const connected = playersRef.current.filter((p) => p.connected);
      const fresh = connected.filter((p) => !showing.has(`${p.avatar.avatar}/${p.avatar.accessory}`));
      const pool = fresh.length ? fresh : connected;
      const empty = facesRef.current.map((f, i) => (f ? -1 : i)).filter((i) => i >= 0);
      if (pool.length && empty.length) {
        const slot = empty[Math.floor(Math.random() * empty.length)]!;
        show(slot, pool[Math.floor(Math.random() * pool.length)]!.avatar);
      }
      later(tick, PEEK_EVERY_MS + Math.random() * PEEK_JITTER_MS);
    };
    later(tick, 1500);
    return () => {
      for (const t of timers.current) clearTimeout(t);
      timers.current.clear();
    };
  }, []);

  useEffect(() => {
    if (boost) show(MIDDLE_PORTHOLE, boost.avatar);
  }, [boost?.seq]);

  return faces;
}

export function SubStage({ view, send }: { view: SubView; send: Send }) {
  const gap = useLiveGap(view);
  const caught = view.phase === "caught";
  const closeness = caught ? 1 : Math.max(0, Math.min(1, 1 - gap / view.maxGap));
  // The catch: lunge with the mouth wide open around the propeller, then the jaw snaps shut.
  const biteMs = useCatchClock(caught);
  const fishLeft = caught
    ? FISH_TOUCH_LEFT + LUNGE_LEFT * easeOut(biteMs / LUNGE_MS)
    : FISH_TOUCH_LEFT - (gap / view.maxGap) * (FISH_TOUCH_LEFT - FISH_FAR_LEFT);
  const openness = caught ? 1 - easeOut((biteMs - LUNGE_MS) / SNAP_MS) : closeness ** 2.2;
  const swallowed = caught && biteMs >= SWALLOW_AT_MS;
  const secs = useCountdown(view.phaseRemainingMs, `${view.phase}:${view.level}`);

  // Boost notices next to the sub, each with the booster's avatar.
  const boost = useEventFlash(view.lastBoost, view.lastBoost?.seq, 700);
  const [pops, setPops] = useState<NonNullable<SubView["lastBoost"]>[]>([]);
  // Each pop's removal timer lives here, not in the effect cleanup, which also runs when the flash ends.
  const popTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => popTimers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (!boost) return;
    play("whoosh");
    setPops((p) => [boost, ...p].slice(0, MAX_POPS));
    const t = setTimeout(() => {
      popTimers.current.delete(t);
      setPops((p) => p.filter((x) => x.seq !== boost.seq));
    }, POP_MS);
    popTimers.current.add(t);
  }, [boost?.seq]);
  // A new level starts with a clean slate.
  useEffect(() => {
    if (view.phase !== "chase") setPops([]);
  }, [view.phase]);
  const faces = usePortholeFaces(view.players, boost);

  // Sound cues.
  const prevPhase = useRef(view.phase);
  useEffect(() => {
    const p = prevPhase.current;
    prevPhase.current = view.phase;
    if (p === view.phase) return;
    if (view.phase === "chase") play("start");
    if (view.phase === "escaped") play("fanfare");
    if (view.phase === "dive") play("reveal");
    if (view.phase === "caught") play("chomp");
  }, [view.phase]);
  const danger = view.phase === "chase" && closeness > 0.78;
  useEffect(() => {
    if (!danger) return;
    play("heartbeat");
    const id = setInterval(() => play("heartbeat"), 1100);
    return () => clearInterval(id);
  }, [danger]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div class="stage">
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        <div class="pill">🐟 Submarine Squad</div>
        <div class="spacer" />
        <div class="depth-badge">
          Level {view.level} · <b>{view.depth} m</b>
        </div>
        <div class="spacer" />
        <div class="pill">👥 {view.playerCount}</div>
        <ScreenControls />
        {view.phase !== "podium" && (
          <button class="btn ghost small" onClick={() => confirm("End the game now and show the final results?") && send({ type: "host.end" })}>
            End game
          </button>
        )}
      </header>
      {view.phase === "podium" ? (
        <SubPodium view={view} send={send} />
      ) : (
        <main class={`sea ${danger ? "danger" : ""}`} style={{ background: oceanGradient(view.depth) }}>
          <div class="light-rays" style={{ opacity: Math.max(0, 0.5 - view.depth / 600) }} />
          <Bubbles />
          <Seaweed />
          {view.phase === "dive" ? (
            <Dive view={view} faces={faces} />
          ) : (
            <>
              <div class="boost-progress" aria-label={`${view.boosts} of ${view.required} boosts`}>
                <div class="boost-label">
                  ⚡ Boosts <b>{view.boosts}</b> / {view.required}
                </div>
                <div class="boost-track">
                  <div class="boost-fill" style={{ width: `${(100 * view.boosts) / view.required}%` }} />
                </div>
              </div>
              <div class={`fish-pos ${caught ? "biting" : ""}`} style={{ left: `${fishLeft}%` }}>
                {/* Mouth stays nearly shut while far away and gapes as the fish closes in. */}
                <Anglerfish openness={openness} glow={closeness} />
              </div>
              <div class={`sub-pos ${boost ? "boosting" : ""} ${view.phase === "escaped" ? "escaping" : ""} ${caught ? "in-mouth" : ""} ${swallowed ? "eaten" : ""}`}>
                {boost && <div class="speed-lines" />}
                <div class="boost-pops">
                  {pops.map((b, i) => (
                    <div key={b.seq} class={`boost-pop ${i === 0 ? "newest" : ""}`}>
                      <Avatar choice={b.avatar} />
                      <span>
                        <b>{b.nickname}</b> boosted! ⚡
                      </span>
                    </div>
                  ))}
                </div>
                <Submarine faces={faces} />
              </div>
              {view.phase === "countdown" && (
                <div class="countdown-overlay">
                  <div class="countdown-label">Answer questions to earn boosts. Keep the sub away from the anglerfish!</div>
                  <div class="countdown-num" key={secs}>
                    {Math.max(1, secs)}
                  </div>
                </div>
              )}
              {view.phase === "escaped" && <div class="sea-banner good">🎉 Level {view.level} cleared! Get ready to dive!</div>}
              {view.phase === "caught" && <div class="sea-banner bad">CHOMP! The anglerfish caught the submarine at {view.depth} m</div>}
            </>
          )}
        </main>
      )}
    </div>
  );
}

function Dive({ view, faces }: { view: SubView; faces: (PortholeFace | null)[] }) {
  const dive = view.dive!;
  return (
    <>
      <div class="dive-instructors">
        {dive.instructors.map((i) => (
          <div key={i.nickname} class={`instructor-card ${i.done ? "done" : ""}`}>
            <div class="instructor-name">📣 {i.nickname}</div>
            <div class="instructor-dots">
              {Array.from({ length: i.total }, (_, k) => (
                <span key={k} class={k < i.index || i.done ? "on" : k === i.index ? "now" : ""} />
              ))}
            </div>
            <div class="instructor-found">{i.done ? "✓ Done" : `${i.found} / ${i.groupSize} found`}</div>
          </div>
        ))}
      </div>
      <div class="dive-sub">
        <Submarine faces={faces} />
      </div>
      <div class="dive-help">
        <b>Diving!</b> Instructors: describe the symbol on your phone. Everyone else: find it on yours!
      </div>
    </>
  );
}

function Bubbles() {
  return (
    <div class="bubbles" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 0.9) % 7}s`, animationDuration: `${6 + (i % 5)}s`, width: `${6 + (i % 4) * 4}px`, height: `${6 + (i % 4) * 4}px` }} />
      ))}
    </div>
  );
}

function Seaweed() {
  return (
    <svg class="seaweed" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: 22 }, (_, i) => {
        const x = i * 46 + 10;
        const h = 50 + ((i * 29) % 60);
        return <path key={i} d={`M${x},120 q-12,-${h / 2} 4,-${h} q10,${h / 3} -4,${h}`} class={i % 2 ? "weed a" : "weed b"} />;
      })}
      <rect x="0" y="108" width="1000" height="12" class="sand" />
    </svg>
  );
}

function SubPodium({ view, send }: { view: SubView; send: Send }) {
  const a = view.awards;
  return (
    <main class="podium sub-podium" style={{ background: oceanGradient(view.depth) }}>
      <h1>🐟 Caught at {view.depth} m</h1>
      <div class="sub-final">
        <div class="sub-final-depth">{view.depth} m</div>
        <div class="sub-final-level">The squad reached level {view.level}</div>
      </div>
      <div class="awards">
        <Award icon="⚡" title="Top booster" award={a?.topBooster ?? null} unit="boosts" />
        <Award icon="👀" title="Sharpest eyes" award={a?.sharpestEyes ?? null} unit="symbols found" />
        <Award icon="🎯" title="Most correct answers" award={a?.mostCorrect ?? null} unit="correct" />
      </div>
      <footer class="controls">
        {view.hasResults && (
          <a class="btn ghost" href="/api/results/latest.csv" download>
            ⬇ Download results (CSV)
          </a>
        )}
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

function Award({ icon, title, award, unit }: { icon: string; title: string; award: SubAward | null; unit: string }) {
  return (
    <div class="award">
      <div class="award-icon" aria-hidden="true">
        {icon}
      </div>
      <div>
        <div class="award-title">{title}</div>
        <div class="award-who">{award ? award.nicknames.join(", ") : "—"}</div>
        {award && (
          <div class="award-value">
            {award.value} {unit}
          </div>
        )}
      </div>
    </div>
  );
}
