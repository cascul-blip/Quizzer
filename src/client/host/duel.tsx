import type { JSX } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import type { DuelArena, DuelArenaResult, DuelistResult, HostView } from "../../shared/protocol.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import {
  BulletStreak,
  DUEL_MUZZLE,
  DustPuff,
  Duelist,
  DuelistClip,
  DuelStreet,
  FlyingHat,
  GunSmoke,
  MuzzleFlash,
  SheriffStar,
  TownWide,
  Tumbleweed,
  WantedPoster,
  duelHat,
  preloadDuelArt,
  type DuelHat,
  type DuelPose,
} from "../shared/duel-art.tsx";
import { music } from "../shared/music/index.ts";
import { PinBoard, PinNote } from "../shared/pin.tsx";
import { play } from "../shared/sounds.ts";
import { Shape, optionColor, ordinal, useCountdown } from "../shared/ui.tsx";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen, type Send } from "./common.tsx";
import { Award } from "./tower.tsx";

type DuelView = Extract<HostView, { kind: "duel" }>;
type Facing = "left" | "right";

// ---------- panel geometry ----------
//
// Every arena panel is a 16:9 box, and so is a Duelist box (the bodies share one 1280×720 canvas),
// so a Duelist's width and height are the same share of the panel and every point below is in panel %.

/** A side duelist's box height (and width), % of the panel. */
const BOX = 70;
/** Gap under a side duelist's box: the soles sit at 90% of it, the name tag below. */
const BOX_BOTTOM = 7;
/** A 3-way duel's third duelist stands smaller, centred, further back. */
const THIRD_BOX = 50;
const THIRD_BOTTOM = 21;
/** How far from the panel's edge a side duelist's body is centred. */
const SIDE_X = 21;
/** The mannequin head on the body canvas (facing right), % of the box: the manifest's (600, 177). */
const HEAD = { x: (600 / 1280) * 100, y: (177 / 720) * 100 };

// ---------- reveal timeline ----------
//
// Steps of a round's reveal, played once per lastRound.round:
// 0 face-off (results shown) → 1 draw → 2 fire (flash, bullet, hat) → 3 settle (holster, badges) → 4 movers walk off.
const STEP_AT_MS = [450, 750, 2000, 2700];
const STEP_DRAW = 1;
const STEP_FIRE = 2;
const STEP_SETTLE = 3;
const STEP_MOVE = 4;
/** How long a mover's token takes to fly to its new panel (matches .duel-token in host.css). */
const TOKEN_MS = 1500;

/** The hats for the duelists below High Noon; one per player, picked from the id so it never changes. */
const HATS: DuelHat[] = ["brown", "black", "white"];

/** Projector screen for Showdown: (intro → open → reveal)… → podium. */
export function DuelStage({ view, send }: { view: DuelView; send: Send }) {
  const q = view.question;
  const secs = useCountdown(view.phaseRemainingMs, `${view.phase}:${q?.index ?? -1}`);
  const prev = useRef<DuelView | null>(null);
  const connected = view.players.filter((p) => p.connected).length;
  const round = view.phase === "reveal" ? view.lastRound : null;
  const step = useRevealStep(round?.round ?? null);

  // Every pose and clip decoded before the first reveal, so swapping one in never blinks.
  useEffect(() => preloadDuelArt(), []);

  // Sound cues on transitions.
  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!p || view.phase === p.phase) return;
    if (view.phase === "intro") play("start");
    if (view.phase === "podium") play("fanfare");
    if (view.phase === "reveal") play(p.phase === "open" && view.answeredCount < connected ? "timeUp" : "reveal");
  }, [view]);

  // The draw sting starts with the draw so its stab lands on the shots, once per round (also when reduced motion skips the steps).
  // The shots ring out when the reveal's duelists fire; the movers whoosh off.
  const stung = useRef(-1);
  useEffect(() => {
    if (!round) return;
    if (step >= STEP_DRAW && stung.current !== round.round) {
      stung.current = round.round;
      music.sting("showdown-draw");
    }
    if (step === STEP_FIRE && round.arenas.some((a) => a.draw || a.duelists.some((d) => d.outcome === "win"))) play("gunshot");
    if (step === STEP_MOVE && round.arenas.some((a) => a.duelists.some((d) => d.nextArena !== a.arena))) play("whoosh");
  }, [step, round?.round]);

  // The last seconds of the question tick down.
  const lastTick = useRef(-1);
  useEffect(() => {
    if (view.phase !== "open" || secs === lastTick.current) return;
    lastTick.current = secs;
    if (secs > 0 && secs <= 5) play(secs <= 3 ? "tickHigh" : "tick");
  }, [secs, view.phase]);

  // Keyboard: Space / → = next, S = skip, F = fullscreen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, select, textarea")) return;
      if (e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        if (view.phase !== "podium") send({ type: "host.next" });
      } else if (e.key === "s" || e.key === "S") {
        if (view.phase === "intro" || view.phase === "open") send({ type: "host.skip" });
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view.phase]);

  const podium = view.phase === "podium";

  return (
    <div class="stage duel-stage">
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        <div class="pill">🤠 Showdown</div>
        {!podium && (
          <div class="pill">
            Round {view.round} / {view.rounds}
          </div>
        )}
        <div class="spacer" />
        {view.phase === "open" && (
          <div class="pill">
            {view.answeredCount} / {connected} answered
          </div>
        )}
        {!podium && (
          <label class="pacing-toggle" title="Auto-advance after the reveal">
            <input
              type="checkbox"
              checked={view.pacing === "auto"}
              onChange={(e) => send({ type: "host.setPacing", pacing: e.currentTarget.checked ? "auto" : "manual" })}
            />
            Auto-advance
          </label>
        )}
        <div class="pill">
          👥 {connected}
          {connected < view.players.length && <span class="dim"> / {view.players.length}</span>}
        </div>
        <ScreenControls join={view.join} />
        {!podium && (
          <button class="btn ghost small" onClick={() => confirm("End the game now and show the final results?") && send({ type: "host.end" })}>
            End game
          </button>
        )}
      </header>
      {podium ? (
        <DuelPodium view={view} send={send} />
      ) : (
        <>
          <main class="duel-upper">{q && <Question view={view} send={send} secs={secs} />}</main>
          <Arenas view={view} step={step} />
        </>
      )}
    </div>
  );
}

/**
 * The reveal step for this round (see STEP_AT_MS), 0 while `round` is null.
 * Keyed on the round number, so later snapshots of the same reveal don't restart it.
 */
function useRevealStep(round: number | null): number {
  const [at, setAt] = useState<{ round: number | null; step: number }>({ round, step: 0 });
  useEffect(() => {
    if (round === null) return;
    // Reduced motion: straight to the settled result, nobody walks.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAt({ round, step: STEP_SETTLE });
      return;
    }
    setAt({ round, step: 0 });
    const timers = STEP_AT_MS.map((ms, i) => setTimeout(() => setAt({ round, step: i + 1 }), ms));
    return () => timers.forEach(clearTimeout);
  }, [round]);
  return at.round === round && round !== null ? at.step : 0;
}

/** The upper part of the screen: the question once for everyone, the shared timer, the options. */
function Question({ view, send, secs }: { view: DuelView; send: Send; secs: number }) {
  const q = view.question!;
  const open = view.phase === "open";
  const reveal = view.phase === "reveal";
  const correct = new Set(view.correct ?? []);
  const longest = Math.max(0, ...q.options.map((o) => o.length));
  const pin = q.type === "pin" && q.image && q.spots ? { image: q.image, spots: q.spots } : null;
  return (
    <>
      <div class={`duel-question ${q.text.length > 160 ? "long" : q.text.length > 80 ? "medium" : ""} ${pin ? "is-pin" : ""}`}>
        <h1>{q.text}</h1>
        {pin ? <PinBoard image={pin.image} spots={pin.spots} labels={q.options} correct={reveal ? [...correct] : undefined} /> : q.image && <img src={`/${q.image}`} alt="" />}
      </div>
      <TimerBar view={view} secs={secs} />
      {view.phase === "intro" && <p class="duel-intro">Hands off your holsters…</p>}
      {open && q.type === "text" && <p class="typing-note">Type your answer on your phone</p>}
      {(open || reveal) && pin && <PinNote open={!reveal} labels={[...correct].map((i) => q.options[i]!)} />}
      {(open || reveal) && !pin && (q.type !== "text" || reveal) && (
        <div class={`tiles duel-tiles n${q.options.length} ${longest > 60 ? "long" : longest > 30 ? "medium" : ""}`} style={{ gridTemplateColumns: `repeat(${q.options.length}, minmax(0, 1fr))` }}>
          {q.options.map((text, i) => {
            const c = optionColor(q.type, i);
            const state = reveal ? (correct.has(i) ? "right" : "wrong") : "";
            return (
              <div key={i} class={`tile opt-${c} ${state}`}>
                <Shape index={c} />
                <span class="tile-text">{text}</span>
                {state === "right" && <span class="tick">✓</span>}
              </div>
            );
          })}
        </div>
      )}
      {reveal && view.pacing === "manual" && (
        <button class="btn primary next duel-next" onClick={() => send({ type: "host.next" })}>
          Next →
        </button>
      )}
    </>
  );
}

/** One timer for the whole class: a fuse that burns down over the question's time limit. */
function TimerBar({ view, secs }: { view: DuelView; secs: number }) {
  const open = view.phase === "open";
  const total = Math.max(1, view.phaseDurationMs);
  const left = open ? Math.max(0, Math.min(1, view.phaseRemainingMs / total)) : view.phase === "intro" ? 1 : 0;
  return (
    <div class={`duel-timer ${open && secs <= 5 ? "urgent" : ""}`}>
      <div class="duel-timer-track">
        {/* Re-keyed per question so the burn starts from where the server says, then runs on its own. */}
        <div
          key={`${view.phase}:${view.question?.index ?? -1}`}
          class={`duel-timer-fill ${open ? "burning" : ""}`}
          style={{ "--from": String(left), animationDuration: `${Math.max(0, view.phaseRemainingMs)}ms` }}
        />
      </div>
      {open && <span class="duel-timer-secs">{secs}</span>}
    </div>
  );
}

// ---------- the arenas ----------

/**
 * How to lay out `n` arena panels. Up to 3 sit in one row (Arena 1 wider); more make a grid
 * where Arena 1 takes a 2×2 block, with the column count picked to keep the panels near 16:9.
 */
function gridFor(n: number): { row: true; columns: string; maxWidth: string } | { row: false; cols: number; rows: number } {
  if (n <= 3) {
    const big = n === 1 ? 1 : 1.35;
    const sum = big + (n - 1);
    // The tallest (Arena 1) panel stays under 46vh: its height is width × big/sum × 9/16.
    return { row: true, columns: [`${big}fr`, ...Array.from({ length: n - 1 }, () => "1fr")].join(" "), maxWidth: `min(100%, ${(((46 * 16) / 9 / big) * sum).toFixed(1)}vh)` };
  }
  // The grid's own shape, about 3 wide to 1 tall on a 16:9 projector below the question.
  const shape = 3;
  const cells = n + 3;
  let best = { cols: 4, rows: Math.ceil(cells / 4), score: Infinity };
  for (let cols = 3; cols <= 9; cols++) {
    const rows = Math.max(2, Math.ceil(cells / cols));
    const aspect = (shape * rows) / cols;
    const score = Math.abs(Math.log(aspect / (16 / 9))) + 0.12 * (cols * rows - cells);
    if (score < best.score) best = { cols, rows, score };
  }
  return { row: false, cols: best.cols, rows: best.rows };
}

interface Token {
  key: string;
  avatar: AvatarChoice;
  up: boolean;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** The lower part: one street panel per arena, and on the reveal the movers' tokens flying between them. */
function Arenas({ view, step }: { view: DuelView; step: number }) {
  const reveal = view.phase === "reveal" ? view.lastRound : null;
  const layout = gridFor(view.arenas.length);
  const wrap = useRef<HTMLDivElement>(null);
  const panels = useRef(new Map<number, HTMLElement>());
  const [tokens, setTokens] = useState<{ round: number; list: Token[] } | null>(null);

  // When the movers set off, measure where each one stands and where its new arena is.
  useLayoutEffect(() => {
    if (!reveal || step !== STEP_MOVE || !wrap.current) return;
    const base = wrap.current.getBoundingClientRect();
    const list: Token[] = [];
    for (const a of reveal.arenas) {
      const from = panels.current.get(a.arena)?.getBoundingClientRect();
      a.duelists.forEach((d, slot) => {
        const to = panels.current.get(d.nextArena)?.getBoundingClientRect();
        if (d.nextArena === a.arena || !from || !to) return;
        const x = from.left - base.left + (from.width * slotCentreX(slot)) / 100;
        const y = from.top - base.top + from.height * 0.45;
        // Into the side of the new street they will stand on: winners take the loser's spot and vice versa.
        const tx = to.left - base.left + to.width * (slot === 0 ? 0.79 : 0.21);
        const ty = to.top - base.top + to.height * 0.45;
        list.push({ key: d.id, avatar: d.avatar, up: d.nextArena < a.arena, x, y, dx: tx - x, dy: ty - y });
      });
    }
    setTokens({ round: reveal.round, list });
  }, [step, reveal?.round]);

  const style: JSX.CSSProperties = layout.row
    ? { gridTemplateColumns: layout.columns, maxWidth: layout.maxWidth }
    : { gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))` };

  return (
    <section class={`duel-lower ${layout.row ? "row" : "grid"}`}>
      <div class={`duel-arenas ${layout.row ? "row" : "grid"}`} ref={wrap} style={style}>
        {view.arenas.map((a) => (
          <div key={a.arena} class={`duel-cell ${a.arena === 1 ? "throne" : ""}`}>
            <ArenaPanel
              arena={a}
              result={reveal?.arenas.find((r) => r.arena === a.arena) ?? null}
              view={view}
              step={step}
              panelRef={(el) => {
                if (el) panels.current.set(a.arena, el);
                else panels.current.delete(a.arena);
              }}
            />
          </div>
        ))}
        {reveal &&
          step === STEP_MOVE &&
          tokens?.round === reveal.round &&
          tokens.list.map((t) => (
            <div key={t.key} class={`duel-token ${t.up ? "up" : "down"}`} style={{ left: `${t.x}px`, top: `${t.y}px`, "--dx": `${t.dx}px`, "--dy": `${t.dy}px`, animationDuration: `${TOKEN_MS}ms` }}>
              <Avatar choice={t.avatar} />
              <span class="duel-token-badge">{t.up ? "⬆" : "⬇"}</span>
            </div>
          ))}
      </div>
    </section>
  );
}

/** Where slot `slot` stands across the panel (% of its width): left, right, then the third in the middle. */
function slotCentreX(slot: number): number {
  return slot === 0 ? SIDE_X : slot === 1 ? 100 - SIDE_X : 50;
}

/** A duelist's box in panel %: left and top edges and its size (width = height, both 16:9 boxes). */
function boxFor(slot: number, facing: Facing): { left: number; top: number; size: number } {
  const size = slot === 2 ? THIRD_BOX : BOX;
  const bottom = slot === 2 ? THIRD_BOTTOM : BOX_BOTTOM;
  // Mirroring flips the canvas, so the head (and body) sits at 100 − x of a left-facing box.
  const headX = facing === "right" ? HEAD.x : 100 - HEAD.x;
  return { left: slotCentreX(slot) - (headX * size) / 100, top: 100 - bottom - size, size };
}

/** A point given in % of a right-facing Duelist box, in panel %. */
function boxPoint(box: { left: number; top: number; size: number }, facing: Facing, p: { x: number; y: number }): [number, number] {
  const x = facing === "right" ? p.x : 100 - p.x;
  return [box.left + (x * box.size) / 100, box.top + (p.y * box.size) / 100];
}

/** What one duelist is doing at this moment of the reveal. */
interface Act {
  pose: DuelPose;
  clip?: "stagger" | "holster-spin" | "walk";
  facing: Facing;
  hat: DuelHat | undefined;
  fires: boolean;
  /** Where its bullet goes, panel %. */
  target?: [number, number];
  hatFlies: boolean;
  leaving?: "up" | "down";
}

/** One arena: the street, its duelists, their names, and on the reveal the shoot-out. */
function ArenaPanel({ arena, result, view, step, panelRef }: { arena: DuelArena; result: DuelArenaResult | null; view: DuelView; step: number; panelRef: (el: HTMLElement | null) => void }) {
  const throne = arena.arena === 1;
  // On the reveal the panel shows the round as it was played; otherwise the live arena.
  const people = result ? result.duelists : arena.duelists;
  const count = people.length;
  const live = new Map(arena.duelists.map((d) => [d.id, d]));
  const round = result ? view.lastRound!.round : view.round;
  const winner = result && !result.draw ? result.duelists.findIndex((d) => d.outcome === "win") : -1;
  const loser = result && !result.draw ? result.duelists.findIndex((d) => d.outcome === "lose") : -1;

  // Who faces where: the sides face each other; the third faces whoever it's shooting at or being shot by.
  const facingOf = (slot: number): Facing => {
    if (slot === 0) return "right";
    if (slot === 1) return "left";
    const other = winner === 2 ? loser : loser === 2 ? winner : -1;
    return other === 0 ? "left" : "right";
  };
  const hatOf = (id: string): DuelHat => (throne ? "sheriff" : HATS[hash(id) % HATS.length]!);
  const headOf = (slot: number): [number, number] => boxPoint(boxFor(slot, facingOf(slot)), facingOf(slot), HEAD);

  const acts: Act[] = people.map((d, slot) => {
    const facing = facingOf(slot);
    const hat = hatOf(d.id);
    const base: Act = { pose: "idle", facing, hat, fires: false, hatFlies: false };
    if (!result) {
      // Intro: idle. Open: hand over the holster once they have answered.
      const answered = view.phase === "open" && live.get(d.id)?.answered;
      return { ...base, pose: answered ? "ready" : "idle" };
    }
    const r = d as DuelistResult;
    const moving = r.nextArena !== result.arena;
    if (step >= STEP_MOVE && moving) {
      const up = r.nextArena < result.arena;
      // Walk off up or down the street, toward the new arena's side of the screen.
      return { ...base, pose: "walk1", clip: "walk", facing: up ? "left" : "right", hat: slot === loser ? undefined : hat, leaving: up ? "up" : "down" };
    }
    if (result.draw) {
      // Both draw and fire, and both miss: the shot goes high over the other's head.
      const target = slot < 2 ? headOf(1 - slot) : undefined;
      const pose: DuelPose = step >= STEP_SETTLE ? "idle" : step >= STEP_FIRE ? "fire" : step >= STEP_DRAW ? "draw" : "ready";
      return { ...base, pose, fires: step === STEP_FIRE && slot < 2, target: target && [target[0], target[1] - 14] };
    }
    if (slot === winner) {
      if (step >= STEP_SETTLE) return { ...base, pose: "tip", clip: "holster-spin" };
      return { ...base, pose: step >= STEP_FIRE ? "fire" : step >= STEP_DRAW ? "draw" : "ready", fires: step === STEP_FIRE, target: loser >= 0 ? headOf(loser) : undefined };
    }
    if (slot === loser) {
      // The stagger clip (ending back on idle) and the hat's flight run on through the settle step.
      if (step >= STEP_FIRE) return { ...base, pose: "stagger", clip: "stagger", hat: undefined, hatFlies: true };
      return { ...base, pose: "ready" };
    }
    return base;
  });

  // A tumbleweed rolls through about a third of the streets while everyone sizes each other up.
  const tumble = view.phase === "intro" && (arena.arena + round) % 3 === 0;

  return (
    <div class={`duel-panel ${throne ? "throne" : ""}`} ref={panelRef}>
      <DuelStreet arena={arena.arena} class="duel-street" />
      {tumble && <Tumbleweed key={`tw${round}`} durationMs={3000} />}
      <div class="duel-sign">
        {throne && <SheriffStar class="duel-sign-star" />}
        <span>{throne ? "High Noon" : `Arena ${arena.arena}`}</span>
      </div>
      {people.map((d, slot) => {
        const a = acts[slot]!;
        const box = boxFor(slot, a.facing);
        const disconnected = live.get(d.id)?.connected === false;
        return (
          <div
            key={d.id}
            class={`duel-body slot${slot} ${disconnected ? "away" : ""} ${a.leaving ? `leaving ${a.leaving}` : ""}`}
            style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.size}%`, height: `${box.size}%` }}
          >
            {a.clip ? (
              <DuelistClip key={`${a.clip}${round}`} avatar={d.avatar} clip={a.clip} facing={a.facing} hat={a.hat} playing loop={a.clip === "walk"} />
            ) : (
              <Duelist avatar={d.avatar} pose={a.pose} facing={a.facing} hat={a.hat} />
            )}
            {a.fires && (
              <div class={`duel-fx duel-flash ${a.facing}`} style={{ left: `${a.facing === "right" ? DUEL_MUZZLE.x : 100 - DUEL_MUZZLE.x}%`, top: `${DUEL_MUZZLE.y}%` }}>
                <MuzzleFlash key={`mf${round}`} facing={a.facing} />
                <GunSmoke key={`gs${round}`} facing={a.facing} />
              </div>
            )}
          </div>
        );
      })}
      {acts.map((a, slot) => {
        if (!a.fires || !a.target) return null;
        const from = boxPoint(boxFor(slot, a.facing), a.facing, DUEL_MUZZLE);
        return <BulletStreak key={`bs${round}-${slot}`} from={from} to={a.target} />;
      })}
      {acts.map((a, slot) => {
        if (!a.hatFlies) return null;
        // The flight starts from the worn hat's own box, so the hat neither jumps nor grows as it is shot off.
        const box = boxFor(slot, a.facing);
        const worn = duelHat("idle");
        const [x, y] = boxPoint(box, a.facing, worn);
        return (
          <div key={`hat${round}-${slot}`} class="duel-fx duel-hat" style={{ left: `${x}%`, top: `${y}%`, width: `${(worn.w * box.size) / 100}%`, height: `${(worn.h * box.size) / 100}%` }}>
            <FlyingHat hat={hatOf(people[slot]!.id)} facing={a.facing} />
          </div>
        );
      })}
      {result?.draw && step === STEP_FIRE && (
        <>
          {people.map((_, slot) => (
            <div key={`dust${round}-${slot}`} class="duel-fx duel-dust" style={{ left: `${slotCentreX(slot)}%`, top: `${100 - (slot === 2 ? THIRD_BOTTOM : BOX_BOTTOM) - 4}%` }}>
              <DustPuff />
            </div>
          ))}
        </>
      )}
      {people.map((d, slot) => (
        <NameTag key={d.id} slot={slot} name={d.nickname} result={result ? (d as DuelistResult) : null} arena={arena.arena} step={step} answered={!result && view.phase === "open" && !!live.get(d.id)?.answered} away={live.get(d.id)?.connected === false} />
      ))}
      {result?.draw && step >= STEP_FIRE && <div class="duel-draw">Draw</div>}
    </div>
  );
}

/** Name under a duelist; on the reveal ✓/✗ and the answer time, then where they go next. */
function NameTag({ slot, name, result, arena, step, answered, away }: { slot: number; name: string; result: DuelistResult | null; arena: number; step: number; answered: boolean; away: boolean }) {
  const moved = result && step >= STEP_SETTLE && result.nextArena !== arena ? (result.nextArena < arena ? "up" : "down") : null;
  return (
    <div class={`duel-name slot${slot} ${away ? "away" : ""} ${answered ? "answered" : ""}`} style={{ left: `${slotCentreX(slot)}%` }}>
      <span class="duel-name-text">{name}</span>
      {answered && <span class="duel-name-ready" title="Answered">✋</span>}
      {result && (
        <span class={`duel-name-result ${result.correct ? "right" : "wrong"}`}>
          {result.correct ? "✓" : "✗"} {result.ms !== null ? `${(result.ms / 1000).toFixed(1)} s` : "—"}
        </span>
      )}
      {moved && (
        <span class={`duel-move ${moved}`}>
          {moved === "up" ? "⬆" : "⬇"} {result!.nextArena === 1 ? "High Noon" : `Arena ${result!.nextArena}`}
        </span>
      )}
    </div>
  );
}

/** A small stable number from a player id. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ---------- podium ----------

function DuelPodium({ view, send }: { view: DuelView; send: Send }) {
  const [showErrors, setShowErrors] = useState(false);
  const a = view.awards;
  const ranked = [...view.players].sort((x, y) => x.rank - y.rank);
  // Second, first, third, like the classic podium.
  const top = [ranked[1], ranked[0], ranked[2]];
  return (
    <main class="podium duel-podium">
      <TownWide class="duel-town" />
      <h1>🤠 The fastest guns in the West</h1>
      {showErrors ? (
        <ErrorsTable errors={view.errors ?? []} />
      ) : (
        <>
          <div class="duel-wanted">
            {top.map((p, i) =>
              p ? (
                <div key={p.id} class={`duel-wanted-slot ${p.rank === 1 ? "first" : ""}`}>
                  {p.rank === 1 && <SheriffStar class="duel-wanted-star" />}
                  <WantedPoster avatar={p.avatar}>
                    <div class="duel-wanted-name">{p.nickname}</div>
                    <div class="duel-wanted-line">
                      {ordinal(p.rank)} · {p.wins} win{p.wins === 1 ? "" : "s"}
                    </div>
                  </WantedPoster>
                </div>
              ) : (
                <div key={`empty${i}`} class="duel-wanted-slot empty" />
              ),
            )}
          </div>
          <div class="awards">
            <Award icon="⭐" title="Longest reign" award={a?.longestReign ?? null} unit="" valueText={(v) => `${v} round${v === 1 ? "" : "s"} at High Noon`} />
            <Award icon="🔫" title="Most wins" award={a?.mostWins ?? null} unit="" valueText={(v) => `${v} win${v === 1 ? "" : "s"}`} />
            <Award icon="⬆" title="Biggest climb" award={a?.biggestClimb ?? null} unit="" valueText={(v) => `${v} arena${v === 1 ? "" : "s"}`} />
          </div>
          {ranked.length > 3 && (
            <ol class="rest" start={4}>
              {ranked.slice(3).map((p) => (
                <li key={p.id}>
                  <span class="rest-who">
                    {ordinal(p.rank)} <Avatar choice={p.avatar} class="rest-avatar" /> {p.nickname}
                  </span>
                  <span>
                    {p.wins}–{p.losses}–{p.draws}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      <footer class="controls">
        <ErrorsButton shown={showErrors} onToggle={() => setShowErrors(!showErrors)} />
        {view.hasResults && (
          <a class="btn ghost" href="/api/results/latest.csv" download>
            ⬇ Results
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
