import type { JSX } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import type { DuelArena, DuelArenaResult, DuelistResult } from "../../shared/modes/duel.ts";
import { DUEL_ROUNDS, duelArenaName, duelShared } from "../../shared/modes/duel.ts";
import type { HostView } from "../../shared/protocol.ts";
import type { ScreenOf, SeasonTheme } from "../../shared/themed-modes.ts";
import { modeTheme, themedLabel, themedName, themedTrack } from "../../shared/themed-modes.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import type { DuelHat, DuelPose } from "../shared/duel-art.tsx";
import {
  BulletStreak,
  DUEL_MUZZLE,
  Duelist,
  DuelistClip,
  DuelStreet,
  DustPuff,
  duelHat,
  FlyingHat,
  GunSmoke,
  MuzzleFlash,
  preloadDuelArt,
  SheriffStar,
  TownWide,
  Tumbleweed,
  WantedPoster,
} from "../shared/duel-art.tsx";
import { preloadSnowballArt, SnowballLobbyPreview, SnowballScene, snowballBackground } from "../shared/duel-christmas.tsx";
import type { MusicCue } from "../shared/music/index.ts";
import { music } from "../shared/music/index.ts";
import { PinBoard, PinNote } from "../shared/pin.tsx";
import { play } from "../shared/sounds.ts";
import { Tex, visibleLength } from "../shared/tex.tsx";
import { optionColor, ordinal, Shape, useCountdown } from "../shared/ui.tsx";
import type { Send } from "./common.tsx";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen } from "./common.tsx";
import type { LobbyModeEntry, LobbySettingsProps } from "./lobby-modes.tsx";
import { revealCue } from "./reveal-cue.ts";
import { Award } from "./tower.tsx";

type DuelView = Extract<HostView, { kind: "duel" }>;
type Facing = "left" | "right";

// why: arena panels and Duelist boxes are both 16:9 (one 1280×720 canvas), so every point below is in panel %.

const SIDE_BOX_PCT = 70;
// why: the soles sit at 90% of the box, with the name tag below.
const SIDE_BOX_BOTTOM_PCT = 7;
const THIRD_BOX_PCT = 50;
const THIRD_BOTTOM = 21;
const SIDE_X_PCT = 21;
// why: the manifest's head point (600, 177) on the 1280×720 canvas, facing right.
const HEAD_PCT = { x: (600 / 1280) * 100, y: (177 / 720) * 100 };

// why: reveal steps, once per lastRound.round: 0 face-off → 1 draw → 2 fire → 3 settle → 4 movers walk off.
const STEP_AT_MS = [450, 750, 2000, 2700];
const STEP_DRAW = 1;
const STEP_FIRE = 2;
const STEP_SETTLE = 3;
const STEP_MOVE = 4;
// why: matches .duel-token in host.css.
const TOKEN_MS = 1500;

// why: picked from the player id so a hat never changes.
const HATS: DuelHat[] = ["brown", "black", "white"];

export function DuelStage({ view, send }: { view: DuelView; send: Send }) {
  const q = view.question;
  const secs = useCountdown(view.phaseRemainingMs, `${view.phase}:${q?.index ?? -1}`);
  const prev = useRef<DuelView | null>(null);
  const connected = view.players.filter((p) => p.connected).length;
  const round = view.phase === "reveal" ? view.lastRound : null;
  const step = useRevealStep(round?.round ?? null, view.revealElapsedMs ?? 0);

  // why: decode every pose and clip before the first reveal, so swapping one in never blinks.
  const christmas = modeTheme("duel", view.theme) === "christmas";
  useEffect(() => (christmas ? preloadSnowballArt(false) : preloadDuelArt()), [christmas]);

  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!p || view.phase === p.phase) return;
    if (view.phase === "intro") play("start");
    if (view.phase === "podium") play("fanfare");
    if (view.phase === "reveal")
      // why: a late joiner waits outside every arena, so only this round's duelists could answer.
      play(
        revealCue(
          p.phase === "open",
          view.answeredCount,
          view.arenas.flatMap((a) => a.duelists),
        ),
      );
  }, [view]);

  // why: the draw sting starts with the draw so its stab lands on the shots, also when reduced motion skips the steps.
  const stung = useRef(-1);
  useEffect(() => {
    if (!round) return;
    if (step >= STEP_DRAW && stung.current !== round.round) {
      stung.current = round.round;
      if (!christmas) music.sting("showdown-draw");
    }
    if (!christmas && step === STEP_FIRE && round.arenas.some((a) => a.draw || a.duelists.some((d) => d.outcome === "win"))) play("gunshot");
    if (step === STEP_MOVE && round.arenas.some((a) => a.duelists.some((d) => d.nextArena !== a.arena))) play("whoosh");
  }, [step, round?.round]);

  const lastTick = useRef(-1);
  useEffect(() => {
    if (view.phase !== "open" || secs === lastTick.current) return;
    lastTick.current = secs;
    if (secs > 0 && secs <= 5) play(secs <= 3 ? "tickHigh" : "tick");
  }, [secs, view.phase]);

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
    <div class={`stage duel-stage ${christmas ? "christmas" : ""}`}>
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        <div class="pill">
          {christmas ? "❄️" : "🤠"} {themedName("duel", view.theme)}
        </div>
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

// why: keyed on the round number, so later snapshots of the same reveal don't restart it.
function useRevealStep(round: number | null, elapsed = 0): number {
  const [at, setAt] = useState<{ round: number | null; step: number }>({ round, step: 0 });
  useEffect(() => {
    if (round === null) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAt({ round, step: STEP_SETTLE });
      return;
    }
    setAt({ round, step: STEP_AT_MS.filter((ms) => ms <= elapsed).length });
    const timers = STEP_AT_MS.flatMap((ms, i) => (ms > elapsed ? [setTimeout(() => setAt({ round, step: i + 1 }), ms - elapsed)] : []));
    return () => timers.forEach(clearTimeout);
  }, [round]);
  return at.round === round && round !== null ? at.step : 0;
}

function Question({ view, send, secs }: { view: DuelView; send: Send; secs: number }) {
  const q = view.question!;
  const open = view.phase === "open";
  const reveal = view.phase === "reveal";
  const correct = new Set(view.correct ?? []);
  const longest = Math.max(0, ...q.options.map(visibleLength));
  const pin = q.type === "pin" && q.image && q.spots ? { image: q.image, spots: q.spots } : null;
  return (
    <>
      <div class={`duel-question ${visibleLength(q.text) > 160 ? "long" : visibleLength(q.text) > 80 ? "medium" : ""} ${pin ? "is-pin" : ""}`}>
        <h1>
          <Tex text={q.text} />
        </h1>
        {pin ? (
          <PinBoard image={pin.image} spots={pin.spots} labels={q.options} correct={reveal ? [...correct] : undefined} />
        ) : (
          q.image && <img src={`/${q.image}`} alt="" />
        )}
      </div>
      <TimerBar view={view} secs={secs} />
      {view.phase === "intro" && <p class="duel-intro">{modeTheme("duel", view.theme) === "christmas" ? "Snowballs ready…" : "Hands off your holsters…"}</p>}
      {open && q.type === "text" && <p class="typing-note">Type your answer on your phone</p>}
      {(open || reveal) && pin && <PinNote open={!reveal} labels={[...correct].map((i) => q.options[i]!)} />}
      {(open || reveal) && !pin && (q.type !== "text" || reveal) && (
        <div
          class={`tiles duel-tiles n${q.options.length} ${longest > 60 ? "long" : longest > 30 ? "medium" : ""}`}
          style={{ gridTemplateColumns: `repeat(${q.options.length}, minmax(0, 1fr))` }}
        >
          {q.options.map((text, i) => {
            const c = optionColor(q.type, i);
            const state = reveal ? (correct.has(i) ? "right" : "wrong") : "";
            return (
              <div key={i} class={`tile opt-${c} ${state}`}>
                <Shape index={c} />
                <span class="tile-text">
                  <Tex text={text} />
                </span>
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

function TimerBar({ view, secs }: { view: DuelView; secs: number }) {
  const open = view.phase === "open";
  // why: catch up once per question; a later snapshot's smaller phaseRemainingMs would count elapsed time twice.
  const key = `${view.phase}:${view.question?.index ?? -1}`;
  const start = useRef<{ key: string; elapsed: number } | null>(null);
  if (!start.current || start.current.key !== key) start.current = { key, elapsed: Math.max(0, view.phaseDurationMs - view.phaseRemainingMs) };
  return (
    <div class={`duel-timer ${open && secs <= 5 ? "urgent" : ""}`}>
      <div class="duel-timer-track">
        <div
          key={key}
          class={`duel-timer-fill ${open ? "burning" : view.phase === "reveal" ? "spent" : ""}`}
          style={open ? { animationDuration: `${Math.max(1, view.phaseDurationMs)}ms`, animationDelay: `-${start.current.elapsed}ms` } : undefined}
        />
      </div>
      {open && <span class="duel-timer-secs">{secs}</span>}
    </div>
  );
}

// why: past 3 arenas, Arena 1 takes a 2×2 block and the column count keeps panels near 16:9.
const MAX_FIRST_ARENA_HEIGHT_VH = 46;
// why: the space under the question on a 16:9 projector.
const TARGET_GRID_ASPECT = 3;
const LOSER_SPOT_X = 0.79;
const WINNER_SPOT_X = 0.21;
const LANDING_Y = 0.45;

function showsTumbleweed(view: DuelView, arena: number, round: number): boolean {
  return view.phase === "intro" && (arena + round) % 3 === 0;
}

function gridFor(n: number): { row: true; columns: string; maxWidth: string } | { row: false; cols: number; rows: number } {
  if (n <= 3) {
    const big = n === 1 ? 1 : 1.35;
    const sum = big + (n - 1);
    // why: Arena 1's panel height is width × big/sum × 9/16.
    return {
      row: true,
      columns: [`${big}fr`, ...Array.from({ length: n - 1 }, () => "1fr")].join(" "),
      maxWidth: `min(100%, ${(((MAX_FIRST_ARENA_HEIGHT_VH * 16) / 9 / big) * sum).toFixed(1)}vh)`,
    };
  }
  const cells = n + 3;
  let best = { cols: 4, rows: Math.ceil(cells / 4), score: Infinity };
  for (let cols = 3; cols <= 9; cols++) {
    const rows = Math.max(2, Math.ceil(cells / cols));
    const aspect = (TARGET_GRID_ASPECT * rows) / cols;
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

function Arenas({ view, step }: { view: DuelView; step: number }) {
  const reveal = view.phase === "reveal" ? view.lastRound : null;
  const layout = gridFor(view.arenas.length);
  const wrap = useRef<HTMLDivElement>(null);
  const panels = useRef(new Map<number, HTMLElement>());
  const [tokens, setTokens] = useState<{ round: number; list: Token[]; delay: number } | null>(null);

  useLayoutEffect(() => {
    if (!reveal || step !== STEP_MOVE || !wrap.current) return;
    const delay = modeTheme("duel", view.theme) === "christmas" ? Math.max(0, (view.revealElapsedMs ?? 0) - STEP_AT_MS[3]!) : 0;
    if (delay >= TOKEN_MS) return;
    const base = wrap.current.getBoundingClientRect();
    const list: Token[] = [];
    for (const a of reveal.arenas) {
      const from = panels.current.get(a.arena)?.getBoundingClientRect();
      a.duelists.forEach((d, slot) => {
        const to = panels.current.get(d.nextArena)?.getBoundingClientRect();
        if (d.nextArena === a.arena || !from || !to) return;
        const x = from.left - base.left + (from.width * slotCentreX(slot)) / 100;
        const y = from.top - base.top + from.height * LANDING_Y;
        // why: winners take the loser's spot and vice versa.
        const tx = to.left - base.left + to.width * (slot === 0 ? LOSER_SPOT_X : WINNER_SPOT_X);
        const ty = to.top - base.top + to.height * LANDING_Y;
        list.push({ key: d.id, avatar: d.avatar, up: d.nextArena < a.arena, x, y, dx: tx - x, dy: ty - y });
      });
    }
    setTokens({ round: reveal.round, list, delay });
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
            <div
              key={t.key}
              class={`duel-token ${t.up ? "up" : "down"}`}
              style={{
                left: `${t.x}px`,
                top: `${t.y}px`,
                "--dx": `${t.dx}px`,
                "--dy": `${t.dy}px`,
                animationDuration: `${TOKEN_MS}ms`,
                animationDelay: `-${tokens.delay}ms`,
              }}
            >
              <Avatar choice={t.avatar} />
              <span class="duel-token-badge">{t.up ? "⬆" : "⬇"}</span>
            </div>
          ))}
      </div>
    </section>
  );
}

// why: slot 2, the third duelist, stands in the middle.
function slotCentreX(slot: number): number {
  return slot === 0 ? SIDE_X_PCT : slot === 1 ? 100 - SIDE_X_PCT : 50;
}

function boxFor(slot: number, facing: Facing): { left: number; top: number; size: number } {
  const size = slot === 2 ? THIRD_BOX_PCT : SIDE_BOX_PCT;
  const bottom = slot === 2 ? THIRD_BOTTOM : SIDE_BOX_BOTTOM_PCT;
  // why: mirroring flips the canvas, so the head sits at 100 − x of a left-facing box.
  const headX = facing === "right" ? HEAD_PCT.x : 100 - HEAD_PCT.x;
  return { left: slotCentreX(slot) - (headX * size) / 100, top: 100 - bottom - size, size };
}

function boxPoint(box: { left: number; top: number; size: number }, facing: Facing, p: { x: number; y: number }): [number, number] {
  const x = facing === "right" ? p.x : 100 - p.x;
  return [box.left + (x * box.size) / 100, box.top + (p.y * box.size) / 100];
}

interface Act {
  pose: DuelPose;
  clip?: "stagger" | "holster-spin" | "walk";
  facing: Facing;
  hat: DuelHat | undefined;
  fires: boolean;
  target?: [number, number];
  hatFlies: boolean;
  leaving?: "up" | "down";
}

function ArenaPanel({
  arena,
  result,
  view,
  step,
  panelRef,
}: {
  arena: DuelArena;
  result: DuelArenaResult | null;
  view: DuelView;
  step: number;
  panelRef: (el: HTMLElement | null) => void;
}) {
  if (modeTheme("duel", view.theme) === "christmas") return <ChristmasArenaPanel arena={arena} result={result} view={view} step={step} panelRef={panelRef} />;
  const throne = arena.arena === 1;
  const people = result ? result.duelists : arena.duelists;
  const live = new Map(arena.duelists.map((d) => [d.id, d]));
  const round = result ? view.lastRound!.round : view.round;
  const winner = result && !result.draw ? result.duelists.findIndex((d) => d.outcome === "win") : -1;
  const loser = result && !result.draw ? result.duelists.findIndex((d) => d.outcome === "lose") : -1;

  // why: the third duelist faces whoever it's shooting at or being shot by.
  const facingOf = (slot: number): Facing => {
    if (slot === 0) return "right";
    if (slot === 1) return "left";
    const other = winner === 2 ? loser : loser === 2 ? winner : -1;
    return other === 0 ? "left" : "right";
  };
  const hatOf = (id: string): DuelHat => (throne ? "sheriff" : HATS[hash(id) % HATS.length]!);
  const headOf = (slot: number): [number, number] => boxPoint(boxFor(slot, facingOf(slot)), facingOf(slot), HEAD_PCT);

  const acts: Act[] = people.map((d, slot) => {
    const facing = facingOf(slot);
    const hat = hatOf(d.id);
    const base: Act = { pose: "idle", facing, hat, fires: false, hatFlies: false };
    if (!result) {
      const answered = view.phase === "open" && live.get(d.id)?.answered;
      return { ...base, pose: answered ? "ready" : "idle" };
    }
    const r = d as DuelistResult;
    const moving = r.nextArena !== result.arena;
    if (step >= STEP_MOVE && moving) {
      const up = r.nextArena < result.arena;
      return { ...base, pose: "walk1", clip: "walk", facing: up ? "left" : "right", hat: slot === loser ? undefined : hat, leaving: up ? "up" : "down" };
    }
    if (result.draw) {
      // why: both fire and both miss, so the shot goes high over the other's head.
      const target = slot < 2 ? headOf(1 - slot) : undefined;
      const pose: DuelPose = step >= STEP_SETTLE ? "idle" : step >= STEP_FIRE ? "fire" : step >= STEP_DRAW ? "draw" : "ready";
      return { ...base, pose, fires: step === STEP_FIRE && slot < 2, target: target && [target[0], target[1] - 14] };
    }
    if (slot === winner) {
      if (step >= STEP_SETTLE) return { ...base, pose: "tip", clip: "holster-spin" };
      return {
        ...base,
        pose: step >= STEP_FIRE ? "fire" : step >= STEP_DRAW ? "draw" : "ready",
        fires: step === STEP_FIRE,
        target: loser >= 0 ? headOf(loser) : undefined,
      };
    }
    if (slot === loser) {
      // why: the stagger clip and the hat's flight run on through the settle step.
      if (step >= STEP_FIRE) return { ...base, pose: "stagger", clip: "stagger", hat: undefined, hatFlies: true };
      return { ...base, pose: "ready" };
    }
    return base;
  });

  const tumble = showsTumbleweed(view, arena.arena, round);

  return (
    <div class={`duel-panel ${throne ? "throne" : ""}`} ref={panelRef}>
      <DuelStreet arena={arena.arena} class="duel-street" />
      {tumble && <Tumbleweed key={`tw${round}`} durationMs={3000} class="duel-tumble" />}
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
              <div
                class={`duel-fx duel-flash ${a.facing}`}
                style={{ left: `${a.facing === "right" ? DUEL_MUZZLE.x : 100 - DUEL_MUZZLE.x}%`, top: `${DUEL_MUZZLE.y}%` }}
              >
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
        // why: the flight starts from the worn hat's box, so the hat neither jumps nor grows.
        const box = boxFor(slot, a.facing);
        const worn = duelHat("idle");
        const [x, y] = boxPoint(box, a.facing, worn);
        return (
          <div
            key={`hat${round}-${slot}`}
            class="duel-fx duel-hat"
            style={{ left: `${x}%`, top: `${y}%`, width: `${(worn.w * box.size) / 100}%`, height: `${(worn.h * box.size) / 100}%` }}
          >
            <FlyingHat hat={hatOf(people[slot]!.id)} facing={a.facing} />
          </div>
        );
      })}
      {result?.draw && step === STEP_FIRE && (
        <>
          {people.map((_, slot) => (
            <div
              key={`dust${round}-${slot}`}
              class="duel-fx duel-dust"
              style={{ left: `${slotCentreX(slot)}%`, top: `${100 - (slot === 2 ? THIRD_BOTTOM : SIDE_BOX_BOTTOM_PCT) - 4}%` }}
            >
              <DustPuff />
            </div>
          ))}
        </>
      )}
      {people.map((d, slot) => (
        <NameTag
          key={d.id}
          slot={slot}
          name={d.nickname}
          result={result ? (d as DuelistResult) : null}
          arena={arena.arena}
          step={step}
          answered={!result && view.phase === "open" && !!live.get(d.id)?.answered}
          away={live.get(d.id)?.connected === false}
        />
      ))}
      {result?.draw && step >= STEP_FIRE && <div class="duel-draw">Draw</div>}
    </div>
  );
}

function ChristmasArenaPanel({
  arena,
  result,
  view,
  step,
  panelRef,
}: {
  arena: DuelArena;
  result: DuelArenaResult | null;
  view: DuelView;
  step: number;
  panelRef: (el: HTMLElement | null) => void;
}) {
  const people = result?.duelists ?? arena.duelists;
  const live = new Map(arena.duelists.map((p) => [p.id, p]));
  return (
    <div class={`duel-panel christmas ${arena.arena === 1 ? "throne" : ""}`} ref={panelRef}>
      <SnowballScene
        arena={arena.arena}
        people={arena.duelists}
        result={result}
        round={view.round}
        elapsedMs={view.revealElapsedMs}
        phone={false}
        labels={false}
        sound={arena.arena === 1}
        leaving={step >= STEP_MOVE}
      />
      <div class="duel-sign">
        <span>{duelArenaName(arena.arena, "christmas")}</span>
      </div>
      {people.map((d, slot) => (
        <NameTag
          key={d.id}
          slot={slot}
          name={d.nickname}
          result={result ? (d as DuelistResult) : null}
          arena={arena.arena}
          step={step}
          answered={!result && view.phase === "open" && !!live.get(d.id)?.answered}
          away={live.get(d.id)?.connected === false}
          christmas
        />
      ))}
      {result?.draw && step >= STEP_FIRE && <div class="duel-draw">Draw</div>}
    </div>
  );
}

function NameTag({
  slot,
  name,
  result,
  arena,
  step,
  answered,
  away,
  christmas = false,
}: {
  slot: number;
  name: string;
  result: DuelistResult | null;
  arena: number;
  step: number;
  answered: boolean;
  away: boolean;
  christmas?: boolean;
}) {
  const moved = result && step >= STEP_SETTLE && result.nextArena !== arena ? (result.nextArena < arena ? "up" : "down") : null;
  return (
    <div class={`duel-name slot${slot} ${away ? "away" : ""} ${answered ? "answered" : ""}`} style={{ left: `${slotCentreX(slot)}%` }}>
      <span class="duel-name-text">{name}</span>
      {answered && (
        <span class="duel-name-ready" title="Answered">
          ✋
        </span>
      )}
      {result && (
        <span class={`duel-name-result ${result.correct ? "right" : "wrong"}`}>
          {result.correct ? "✓" : "✗"} {result.answerDurationMs !== null ? `${(result.answerDurationMs / 1000).toFixed(1)} s` : "—"}
        </span>
      )}
      {result && result.points > 0 && step >= STEP_SETTLE && <span class="duel-name-points">+{result.points}</span>}
      {moved && (
        <span class={`duel-move ${moved}`}>
          {moved === "up" ? "⬆" : "⬇"} {duelArenaName(result!.nextArena, christmas ? "christmas" : "classic")}
        </span>
      )}
    </div>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function DuelPodium({ view, send }: { view: DuelView; send: Send }) {
  const [showErrors, setShowErrors] = useState(false);
  const a = view.awards;
  const christmas = modeTheme("duel", view.theme) === "christmas";
  const ranked = [...view.players].sort((x, y) => x.rank - y.rank);
  const top = [ranked[1], ranked[0], ranked[2]];
  return (
    <main class={`podium duel-podium ${christmas ? "christmas" : ""}`}>
      {christmas ? <img class="sd-town duel-town" src={snowballBackground(1, false)} alt="" /> : <TownWide class="duel-town" />}
      <h1>{christmas ? "❄️ The snowball champions of the North Pole" : "🤠 The fastest guns in the West"}</h1>
      {showErrors ? (
        <ErrorsTable errors={view.errors ?? []} />
      ) : (
        <>
          <div class="duel-wanted">
            {top.map((p, i) =>
              p ? (
                <div key={p.id} class={`duel-wanted-slot ${p.rank === 1 ? "first" : ""}`}>
                  {p.rank === 1 && !christmas && <SheriffStar class="duel-wanted-star" />}
                  <WantedPoster avatar={p.avatar} winter={christmas} heading={christmas ? "CHAMPION" : "WANTED"}>
                    <div class="duel-wanted-name">{p.nickname}</div>
                    <div class="duel-wanted-line">
                      {ordinal(p.rank)} · {p.points} pt{p.points === 1 ? "" : "s"}
                    </div>
                  </WantedPoster>
                </div>
              ) : (
                <div key={`empty${i}`} class="duel-wanted-slot empty" />
              ),
            )}
          </div>
          <div class="awards">
            <Award
              icon="⭐"
              title={duelShared.awards.mostArenaOneWins}
              award={a?.mostArenaOneWins ?? null}
              unit=""
              valueText={(v) => `${v} round${v === 1 ? "" : "s"} at ${duelArenaName(1, view.theme)}`}
            />
            <Award
              icon={christmas ? "❄️" : "🔫"}
              title={duelShared.awards.mostWins}
              award={a?.mostWins ?? null}
              unit=""
              valueText={(v) => `${v} win${v === 1 ? "" : "s"}`}
            />
            <Award
              icon="⬆"
              title={duelShared.awards.mostArenasClimbed}
              award={a?.mostArenasClimbed ?? null}
              unit=""
              valueText={(v) => `${v} arena${v === 1 ? "" : "s"}`}
            />
          </div>
          {ranked.length > 3 && (
            <ol class="rest" start={4}>
              {ranked.slice(3).map((p) => (
                <li key={p.id}>
                  <span class="rest-who">
                    {ordinal(p.rank)} <Avatar choice={p.avatar} class="rest-avatar" /> {p.nickname}
                  </span>
                  <span>
                    {p.points} pt{p.points === 1 ? "" : "s"} · {p.wins}–{p.losses}–{p.draws}
                  </span>
                </li>
              ))}
            </ol>
          )}
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

function DuelSettings({ settings, send, children }: LobbySettingsProps<"duel">) {
  return (
    <>
      {children}
      <label class="opt">
        Rounds
        <select
          aria-label="Showdown rounds"
          value={settings.rounds}
          onChange={(e) => send({ type: "host.setModeSettings", mode: "duel", settings: { ...settings, rounds: Number(e.currentTarget.value) } })}
        >
          {DUEL_ROUNDS.map((r) => (
            <option key={r} value={r}>
              {r} rounds
            </option>
          ))}
        </select>
      </label>
      <label class="opt">
        Theme
        <select
          aria-label="Showdown theme"
          value={modeTheme("duel", settings.theme)}
          // checked: the select only offers the season themes, and the server refuses any other (pickTheme)
          onChange={(e) => send({ type: "host.setModeSettings", mode: "duel", settings: { ...settings, theme: e.currentTarget.value as SeasonTheme } })}
        >
          <option value="christmas">North Pole Snowball Showdown</option>
          <option value="classic">Classic Showdown</option>
        </select>
      </label>
      <span class="opt mode-hint">
        {themedName("duel", settings.theme)}: everyone duels at once. Win to climb toward {duelArenaName(1, settings.theme)}, lose and you drop an arena.
      </span>
    </>
  );
}

export function duelCue(view: DuelView): MusicCue {
  const track = (screen: ScreenOf<"duel">) => themedTrack("duel", view.theme, screen);
  if (modeTheme("duel", view.theme) === "christmas")
    return { track: track(view.phase === "podium" ? "results" : "play"), intensity: view.phase === "open" ? 0.6 : 0.25 };
  if (view.phase === "podium") return { track: track("results") };
  // why: rounds are quick, so the build starts in the intro and reaches full gallop halfway through the question.
  if (view.phase === "intro") return { track: track("play"), intensity: 0.3, rampTo: 0.5, rampMs: view.phaseRemainingMs, key: `duel-r${view.round}-intro` };
  if (view.phase === "open") {
    const full = view.phaseDurationMs / 2;
    const elapsed = Math.max(0, view.phaseDurationMs - view.phaseRemainingMs);
    const start = Math.min(1, elapsed / Math.max(1, full));
    return { track: track("play"), intensity: 0.5 + start * 0.5, rampTo: 1, rampMs: Math.max(0, full - elapsed), key: `duel-r${view.round}-open` };
  }
  // why: no silence between quick rounds; the draw sting plays over the riding beat.
  return { track: track("play"), intensity: 0.3, key: `duel-r${view.round}-${view.phase}` };
}

export const duelLobby: LobbyModeEntry<"duel"> = {
  label: (settings) => themedLabel("duel", settings.theme),
  Settings: DuelSettings,
  Preview: ({ settings }) => (modeTheme("duel", settings.theme) === "christmas" ? <SnowballLobbyPreview /> : null),
  lobbyTrack: (settings) => themedTrack("duel", settings.theme, "lobby"),
};
