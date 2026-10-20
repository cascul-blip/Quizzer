import { useEffect, useRef, useState } from "preact/hooks";
import type { HostView, SiegeSettings } from "../../shared/protocol.ts";
import { SIEGE_HEARTS } from "../../shared/siege-rules.ts";
import {
  ArrowShot,
  Confetti,
  DefenderFigure,
  DustPuff,
  FallenFigure,
  LaneFlash,
  MonsterFigure,
  RisingBanners,
  SiegeBoard,
  SiegeIcon,
  WarningArrow,
} from "../shared/siege-art.tsx";
import { play } from "../shared/sounds.ts";
import { useCountdown } from "../shared/ui.tsx";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen, type Send } from "./common.tsx";
import { Award } from "./tower.tsx";

type SiegeView = Extract<HostView, { kind: "siege" }>;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** How long arrows, fallen monsters and dust stay on screen after they arrive. */
const SHOT_MS = 380;
const FALLEN_MS = 1300;
const DUST_MS = 900;

export function waveLabel(wave: number, waves: SiegeSettings["waves"]): string {
  return waves === "endless" ? `Wave ${wave}` : `Wave ${wave} of ${waves}`;
}

/** Projector screen for Kingdom Siege: countdown → build break → waves (with breaks) → the kingdom stands or the castle falls → podium. */
export function SiegeStage({ view, send }: { view: SiegeView; send: Send }) {
  useSiegeSounds(view);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const battle = view.phase !== "podium";
  return (
    <div class="stage siege-stage">
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        <div class="pill">🛡️ Kingdom Siege</div>
        {view.wave > 0 && battle && <div class="pill">{waveLabel(view.wave, view.settings.waves)}</div>}
        <div class="spacer" />
        {battle && <Treasury gold={view.gold} hearts={view.hearts} />}
        <div class="spacer" />
        <div class="pill">
          👥 {view.connectedCount}
          {view.connectedCount < view.playerCount && <span class="dim"> / {view.playerCount}</span>}
        </div>
        <ScreenControls join={view.join} />
        {view.phase !== "podium" && (
          <button class="btn ghost small" onClick={() => confirm("End the game now and show the final results?") && send({ type: "host.end" })}>
            End game
          </button>
        )}
      </header>
      {view.phase === "podium" ? <SiegePodium view={view} send={send} /> : <Battlefield view={view} />}
    </div>
  );
}

function Treasury({ gold, hearts }: { gold: number; hearts: number }) {
  return (
    <div class="siege-treasury">
      <span class="siege-gold" title="The class treasury">
        <SiegeIcon kind="coin" /> {gold}
      </span>
      <span class="siege-hearts" title={`${hearts} of ${SIEGE_HEARTS} hearts`}>
        {Array.from({ length: SIEGE_HEARTS }, (_, i) => (
          <SiegeIcon key={i} kind="heart" class={i < hearts ? "" : "lost"} />
        ))}
      </span>
    </div>
  );
}

function useSiegeSounds(view: SiegeView) {
  const prev = useRef<SiegeView | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!p) return;
    if (view.phase !== p.phase) {
      if (view.phase === "build" && p.phase === "countdown") play("start");
      if (view.phase === "wave") play("start");
      if (view.phase === "stands") play("victoryBells");
      if (view.phase === "fallen") play("castleCrumble");
      if (view.phase === "podium" && p.phase !== "stands" && p.phase !== "fallen") play("fanfare");
    }
    // The drum roll leads into the next wave.
    if (view.phase === "build" && view.phaseRemainingMs <= 1500 && (p.phase !== "build" || p.phaseRemainingMs > 1500) && view.wave > 0) play("drumRoll");
    if (view.giantSeq > p.giantSeq) play("giantHorn");
    if (view.wallHitSeq > p.wallHitSeq) play("heartLost");
    const newShots = view.shots.filter((s) => s.seq > (p.shots.at(-1)?.seq ?? 0));
    if (newShots.length) {
      play("bowTwang");
      setTimeout(() => play("arrowHit"), 220);
    }
    const before = new Map(p.defenders.map((d) => [d.id, d]));
    let clang = false;
    let thud = false;
    let placed = false;
    let upgraded = false;
    for (const d of view.defenders) {
      const was = before.get(d.id);
      if (!was) placed = true;
      else {
        if (d.level > was.level) upgraded = true;
        if (d.type === "knight" && d.attackSeq > was.attackSeq) clang = true;
        if (d.type === "wall" && d.hitSeq > was.hitSeq) thud = true;
      }
    }
    if (view.defenders.length < p.defenders.length) thud = true;
    if (placed) play("placeClack");
    if (upgraded) play("upgradeChime");
    if (clang) play("swordClang");
    if (thud) play("stoneThud");
    const known = new Set(p.monsters.map((m) => m.id));
    for (const m of view.monsters) {
      if (!known.has(m.id) && m.type === "wolf") play("wolfHowl");
      if (!known.has(m.id) && m.type === "troll") play("trollRoar");
    }
    const giant = view.monsters.find((m) => m.type === "giant");
    const wasGiant = giant && p.monsters.find((m) => m.id === giant.id);
    if (giant && wasGiant && giant.attackSeq > wasGiant.attackSeq) play("giantStomp");
    if (view.gold > p.gold) play("coins");
  }, [view]);
}

/** The time since the page started, updated every animation frame while `on`. */
function useFrameClock(on: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!on) return;
    let id = 0;
    const loop = () => {
      setNow(performance.now());
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [on]);
  return now;
}

/** When each key was first seen on this screen (keys present on the first render count as old). */
function useFirstSeen<K>(keys: K[], now: number): { at: (k: K) => number; old: (k: K) => boolean } {
  const seen = useRef<Map<K, number> | null>(null);
  const first = seen.current === null;
  seen.current ??= new Map();
  for (const k of keys) if (!seen.current.has(k)) seen.current.set(k, first ? -Infinity : now);
  if (seen.current.size > 500) for (const k of [...seen.current.keys()].slice(0, 250)) seen.current.delete(k);
  return { at: (k) => seen.current!.get(k) ?? -Infinity, old: (k) => (seen.current!.get(k) ?? -Infinity) === -Infinity };
}

function Battlefield({ view }: { view: SiegeView }) {
  const live = view.phase === "build" || view.phase === "wave" || view.phase === "stands" || view.phase === "fallen";
  const now = useFrameClock(live);
  // Monster positions are animated here from where each one was and where it is going.
  const received = useRef({ at: performance.now(), view });
  if (received.current.view !== view) received.current = { at: performance.now(), view };
  const since = now - received.current.at;

  // Recent attack times, for the archers' draw pose and the monsters' attack pose.
  const attacks = useRef(new Map<string, { seq: number; at: number }>());
  const lastAttack = (key: string, seq: number) => {
    const a = attacks.current.get(key);
    if (!a || a.seq !== seq) {
      attacks.current.set(key, { seq, at: a ? now : -Infinity });
      return a ? now : -Infinity;
    }
    return a.at;
  };

  const shots = useFirstSeen(view.shots.map((s) => s.seq), now);
  const fallen = useFirstSeen(view.fallen.map((f) => f.seq), now);
  const defenders = useFirstSeen(view.defenders.map((d) => d.id), now);

  // Defenders that disappeared leave a puff of dust.
  const prevDefenders = useRef(view.defenders);
  const dust = useRef<{ key: number; lane: number; x: number; at: number }[]>([]);
  if (prevDefenders.current !== view.defenders) {
    const ids = new Set(view.defenders.map((d) => d.id));
    for (const d of prevDefenders.current) if (!ids.has(d.id)) dust.current.push({ key: d.id, lane: d.lane, x: d.square, at: now });
    prevDefenders.current = view.defenders;
  }
  dust.current = dust.current.filter((d) => now - d.at < DUST_MS);

  const castle = view.phase === "fallen" ? "crumble" : "auto";
  const flashLanes = new Set(view.danger);
  return (
    <main class={`siege-wrap phase-${view.phase}`}>
      <SiegeBoard hearts={view.hearts} castle={castle}>
        {[...flashLanes].map((lane) => (
          <LaneFlash key={`d${lane}`} lane={lane} kind="danger" />
        ))}
        {view.giant && <LaneFlash key="giant" lane={view.giant.lane} kind="giant" />}
        {view.warnings.map((w, i) => (
          <WarningArrow key={`w${w.lane}-${i}`} lane={w.lane} />
        ))}
        {view.defenders.map((d) => (
          <DefenderFigure key={d.id} d={d} fresh={!defenders.old(d.id) && now - defenders.at(d.id) < 700} drawing={d.type === "archer" && now - lastAttack(`d${d.id}`, d.attackSeq) < 350} />
        ))}
        {view.monsters.map((m) => {
          const t = m.moveMs > 0 ? Math.min(1, since / m.moveMs) : 0;
          const x = m.x + (m.toX - m.x) * t;
          return <MonsterFigure key={m.id} m={m} x={x} posed={now - lastAttack(`m${m.id}`, m.attackSeq) < 450} />;
        })}
        {view.fallen
          .filter((f) => !fallen.old(f.seq) && now - fallen.at(f.seq) < FALLEN_MS)
          .map((f) => (
            <FallenFigure key={`f${f.seq}`} type={f.type} lane={f.lane} x={f.x} reachedWall={f.reachedWall} />
          ))}
        {view.shots
          .filter((s) => !shots.old(s.seq) && now - shots.at(s.seq) < SHOT_MS)
          .map((s) => (
            <ArrowShot key={`s${s.seq}`} lane={s.lane} from={s.square} to={s.toX} />
          ))}
        {dust.current.map((d) => (
          <DustPuff key={`dust${d.key}`} at={{ lane: d.lane, x: d.x }} />
        ))}
      </SiegeBoard>
      <SiegeEvents view={view} />
      {view.phase === "countdown" && <Countdown view={view} />}
      {view.phase === "build" && <BuildBreak view={view} />}
      {view.giant && <div class="siege-banner giant" role="alert">⚠️ A giant approaches!</div>}
      {view.phase === "stands" && <Stands view={view} />}
      {view.phase === "fallen" && <Fallen view={view} />}
    </main>
  );
}

/** "Ana placed an archer" pop-ups: only the last few. */
function SiegeEvents({ view }: { view: SiegeView }) {
  return (
    <ul class="siege-events" aria-label="Latest building">
      {view.events.map((e) => (
        <li key={e.seq}>
          <b>{e.nickname}</b> {e.text}
        </li>
      ))}
    </ul>
  );
}

function Countdown({ view }: { view: SiegeView }) {
  const n = useCountdown(view.phaseRemainingMs, "siege-countdown");
  return (
    <div class="countdown-overlay siege-countdown">
      <div class="countdown-label">
        Defend the kingdom together!
        <br />
        Every right answer adds 25 gold to the class treasury. Spend it on archers, knights and stone walls.
      </div>
      <div class="countdown-num" key={n}>
        {Math.max(1, n)}
      </div>
    </div>
  );
}

/** "Build your defenses!" or "Wave N incoming", with a bar that drains. */
function BuildBreak({ view }: { view: SiegeView }) {
  const opening = view.wave <= 1;
  const start = view.phaseDurationMs > 0 ? view.phaseRemainingMs / view.phaseDurationMs : 0;
  return (
    <div class="siege-break">
      <div class="siege-break-title">{opening ? "Build your defenses!" : `${waveLabel(view.wave, view.settings.waves).replace(/ of \d+$/, "")} incoming`}</div>
      <div class="siege-break-bar">
        <i key={`${view.phase}-${view.wave}`} style={{ "--start": String(start), animationDuration: `${view.phaseRemainingMs}ms` }} />
      </div>
    </div>
  );
}

function Stands({ view }: { view: SiegeView }) {
  return (
    <div class="siege-ending stands">
      <RisingBanners />
      <Confetti />
      <h1>🏰 The kingdom stands!</h1>
      <p>{view.result?.headline}</p>
    </div>
  );
}

function Fallen({ view }: { view: SiegeView }) {
  return (
    <div class="siege-ending fallen">
      <h1>The castle has fallen on wave {view.result?.wave ?? view.wave}.</h1>
      {view.settings.waves === "endless" && <p>{view.result?.headline}</p>}
    </div>
  );
}

// ---------- lobby ----------

/** The empty diorama board with the castle wall, under the lobby's settings. */
export function SiegeLobbyPreview() {
  return (
    <div class="siege-lobby-preview" aria-hidden="true">
      <SiegeBoard hearts={SIEGE_HEARTS} />
    </div>
  );
}

// ---------- podium ----------

function SiegePodium({ view, send }: { view: SiegeView; send: Send }) {
  const [showErrors, setShowErrors] = useState(false);
  const r = view.result;
  const a = view.awards;
  const good = r?.outcome === "stands" || (r?.outcome === "ended" && r.hearts > 0);
  return (
    <main class="podium siege-podium">
      <div class="podium-bg" aria-hidden="true">
        <SiegeBoard hearts={r?.hearts ?? SIEGE_HEARTS} castle={r?.outcome === "fallen" ? "fallen" : "auto"} />
      </div>
      <h1>{r?.outcome === "stands" ? "🏰 " : r?.outcome === "fallen" ? "🛡️ " : ""}{r?.headline}</h1>
      {r && view.settings.waves === "endless" && (
        <p class={`siege-verdict ${good ? "good" : ""}`}>
          {r.outcome === "ended" && `${plural(r.wavesSurvived, "wave")} survived · `}
          Average difficulty {r.avgScale}%
          {r.record && (
            <span class="dim">
              {" "}
              · Class record: {plural(r.record.waves, "wave")} at {r.record.avgScale}%
            </span>
          )}
          {r.newRecord && <span class="siege-record">🏆 New record!</span>}
        </p>
      )}
      {showErrors ? (
        <ErrorsTable errors={view.errors ?? []} />
      ) : (
        <div class="awards siege-awards">
          <Award icon="🏹" title="Top Archer Captain" award={a?.topArcher ?? null} unit="" valueText={(n) => `${plural(n, "monster")} defeated by their archers`} />
          <Award icon="🧱" title="Master Mason" award={a?.masterMason ?? null} unit="" valueText={(n) => `${plural(n, "wall")} and upgrades`} />
          <Award icon="🎯" title="Most correct answers" award={a?.mostCorrect ?? null} unit="correct" />
        </div>
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
