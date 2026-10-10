import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { BLOCKS_PER_BUILD, DROP_ZONES, MONSTER_DAMAGE, type ClientMsg, type MonsterEgg, type PlayerTowerView } from "../../shared/protocol.ts";
import { BuildingBlock, COLUMN_NAMES, EggCell, useEventFlash, viewBaseRow, DustPuff, FloorSparkle, SKY_STAGES, SkylineSvg, skyStage, useFreshKeys, useNewFloor } from "../shared/tower-art.tsx";
import { Shape, formatClock, optionColor, ordinal, useCountdown } from "../shared/ui.tsx";

type Send = (m: ClientMsg) => void;
type Build = NonNullable<PlayerTowerView["build"]>;

/** How long the dropped block takes to fall, in ms. */
const FALL_MS = 450;
/** After the last block lands, keep the tower on screen this long before returning to questions. */
const LAST_BLOCK_PAUSE_MS = 500;

/** Phone screen for Tallest Tower: own questions at own pace, then build mode every 4 correct answers. */
export function TowerPlayer({ view, send }: { view: PlayerTowerView; send: Send }) {
  const secs = useCountdown(view.remainingMs, view.phase);

  // When the last block is dropped, hold build mode (from the tap, before the server even replies)
  // so the player sees it fall and land, then pause briefly before questions come back.
  const [hold, setHold] = useState<Build | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(holdTimer.current), []);
  const onLastDrop = (b: Build) => {
    setHold(b);
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => setHold(null), FALL_MS + LAST_BLOCK_PAUSE_MS);
  };

  const build = view.phase === "playing" ? (view.build ?? hold) : null;

  let body;
  if (view.phase === "countdown") {
    body = (
      <main class="center">
        <div class="team-badge big" style={{ background: view.team.color }}>
          Team {view.team.name}
        </div>
        <p class="muted">Answer questions to earn blocks. Every {BLOCKS_PER_BUILD} correct answers, you get to build!</p>
        <div class="tower-count">{Math.max(1, secs)}</div>
      </main>
    );
  } else if (view.phase === "podium") {
    body = <TowerResult view={view} />;
  } else if (build) {
    body = <BuildMode build={build} blocksHeld={view.blocksHeld} color={view.team.color} team={view.team.index} egg={view.egg} send={send} onLastDrop={onLastDrop} />;
  } else if (view.question) {
    body = (
      <>
        {view.egg && (
          <div class="egg-chip">
            🥚 Monster egg at level {view.egg.row + 1} ({COLUMN_NAMES[view.egg.col]}): build to it first!
          </div>
        )}
        <StreamQuestion question={view.question} onAnswer={(seq, option) => send({ type: "tower.answer", seq, option })} />
      </>
    );
  } else {
    body = (
      <main class="center">
        <div class="spinner" />
      </main>
    );
  }

  return (
    <div class="game tower-game" style={{ "--team": view.team.color }}>
      <header class="bar team-bar">
        <span class="name">{view.me.nickname}</span>
        {view.phase === "playing" && (
          <span class="blocks-meter" aria-label={`${view.blocksHeld} of ${BLOCKS_PER_BUILD} blocks`}>
            {Array.from({ length: BLOCKS_PER_BUILD }, (_, i) => (
              <i key={i} class={i < view.blocksHeld ? "full" : ""} />
            ))}
          </span>
        )}
        <span class="score">{view.phase === "playing" ? formatClock(secs) : `Team ${view.team.name}`}</span>
      </header>
      {body}
      <Feedback feedback={view.feedback} rightText={view.state === "build" ? "+1 block. Build time!" : "+1 block"} />
      <MonsterNotice event={view.monsterEvent} egg={view.egg} />
    </div>
  );
}

/** A self-paced question (Tallest Tower, Submarine Squad). */
export function StreamQuestion({ question, onAnswer }: { question: NonNullable<PlayerTowerView["question"]>; onAnswer: (seq: number, option: number) => void }) {
  const [sentSeq, setSentSeq] = useState<number | null>(null);
  const locked = sentSeq === question.seq;
  return (
    <main class="answering">
      <h2 class="q-text tower-q">{question.text}</h2>
      {question.image && <img class="q-img" src={`/${question.image}`} alt="" />}
      <div class={`answers n${question.options.length}`}>
        {question.options.map((text, i) => {
          const c = optionColor(question.type, i);
          return (
            <button
              key={`${question.seq}-${i}`}
              class={`answer opt-${c}`}
              disabled={locked}
              onClick={() => {
                setSentSeq(question.seq);
                onAnswer(question.seq, i);
              }}
            >
              <Shape index={c} />
              <span>{text}</span>
            </button>
          );
        })}
      </div>
    </main>
  );
}

/** Monster news: a new egg (everyone), your team hatched it, or your tower got smashed. */
function MonsterNotice({ event, egg }: { event: PlayerTowerView["monsterEvent"]; egg: MonsterEgg | null }) {
  const shown = useEventFlash(event, event?.seq, 2200);
  useEffect(() => {
    if (shown) navigator.vibrate?.(shown.kind === "smashed" ? [200, 80, 200] : [80, 40, 80]);
  }, [shown?.seq]);
  if (!shown) return null;
  const [icon, title, detail] =
    shown.kind === "egg"
      ? ["🥚", "A monster egg appeared!", egg ? `Land a block on level ${egg.row + 1}, ${COLUMN_NAMES[egg.col]} column, before the other teams.` : "Build to it first!"]
      : shown.kind === "hatched"
        ? ["🐣", "Your team hatched the monster!", `You're safe. It smashed Team ${shown.target} (−${MONSTER_DAMAGE} floors).`]
        : ["👾", "The monster smashed your tower!", `−${MONSTER_DAMAGE} floors. Team ${shown.byTeam} hatched it.`];
  return (
    <div class={`flash monster-flash ${shown.kind}`} role="alert">
      <div class="flash-icon">{icon}</div>
      <div class="flash-text">{title}</div>
      <div class="flash-answer">
        <b class="monster-detail">{detail}</b>
      </div>
    </div>
  );
}

/** Shown on the ✗ while a player who keeps answering wrong waits out the extra time. */
function PenaltyNote({ remainingMs, seq }: { remainingMs: number; seq: number }) {
  const secs = useCountdown(remainingMs, `penalty${seq}`);
  return (
    <div class="flash-penalty">
      Slow down and read the question!
      <b>Next question in {secs}s</b>
    </div>
  );
}

/** Full-screen ✓/✗ after each answer: a second, or longer after wrong answers in a row. */
export function Feedback({ feedback, rightText }: { feedback: PlayerTowerView["feedback"]; rightText: string }) {
  // Decided during render, not in an effect: the snapshot that brings this feedback also brings
  // the next question, and an effect would let that question paint for a frame before the overlay.
  const last = useRef(feedback);
  if (feedback) last.current = feedback;
  const [hiddenSeq, setHiddenSeq] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!feedback) return;
    navigator.vibrate?.(feedback.correct ? 40 : [60, 40, 60]);
    const seq = feedback.seq;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHiddenSeq(seq), feedback.remainingMs);
  }, [feedback?.seq]);
  const shown = last.current;
  if (!shown || shown.seq === hiddenSeq) return null;
  return (
    <div class={`flash ${shown.correct ? "good" : "bad"}`} role="status">
      <div class="flash-icon">{shown.correct ? "✓" : "✗"}</div>
      <div class="flash-text">{shown.correct ? rightText : "Not quite"}</div>
      {!shown.correct && shown.answers.length > 0 && (
        <div class="flash-answer">
          <span>Correct answer{shown.answers.length > 1 ? "s" : ""}:</span>
          <b>{shown.answers.join(" / ")}</b>
        </div>
      )}
      {shown.penaltyMs > 0 && <PenaltyNote remainingMs={shown.remainingMs} seq={shown.seq} />}
    </div>
  );
}

/** A single building piece (the sliding / falling block). */
function Piece({ color, team }: { color: string; team: number }) {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <BuildingBlock x={0} y={0} size={10} color={color} team={team} col={0} row={1} fullFloor={false} />
    </svg>
  );
}

function BuildMode(props: { build: Build; blocksHeld: number; color: string; team: number; egg: MonsterEgg | null; send: Send; onLastDrop: (b: Build) => void }) {
  const { build, blocksHeld, color, team, egg, send } = props;
  const isFresh = useFreshKeys();
  const newFloor = useNewFloor(build.floors);
  const [puff, setPuff] = useState<{ x: number; y: number; id: number } | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const fallRef = useRef<HTMLDivElement>(null);
  const pos = useRef(0.5);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [falling, setFalling] = useState<{ zone: number; columns: number[]; id: number } | null>(null);

  useLayoutEffect(() => {
    const el = areaRef.current!;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cell = size.w / DROP_ZONES;
  const ground = 14;
  const sliderTop = 6;
  // While our block falls, show the tower as it was when we tapped.
  const columns = falling ? falling.columns : build.columns;
  const tallest = Math.max(...columns);
  const visibleRows = Math.max(2, Math.floor((size.h - ground - sliderTop - cell * 1.6) / Math.max(cell, 1)));
  const baseRow = viewBaseRow(tallest, visibleRows, egg ? egg.row : null);

  // Slide the block back and forth: one sweep across takes build.sweepMs.
  useEffect(() => {
    if (!size.w) return;
    let raf = 0;
    const start = performance.now();
    const loop = (t: number) => {
      const x = ((t - start) / build.sweepMs) % 2;
      const f = x < 1 ? x : 2 - x;
      pos.current = 0.1 + 0.8 * f; // center of the block, as a fraction of the width
      if (sliderRef.current) sliderRef.current.style.transform = `translateX(${(pos.current - 0.1) * size.w}px)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [build.sweepMs, size.w]);

  // Animate the falling block from the slider to where it lands (or off the edge).
  useLayoutEffect(() => {
    const el = fallRef.current;
    if (!falling || !el) return;
    const c = falling.zone - 1;
    const landed = c >= 0 && c < 3;
    const landTop = landed ? size.h - ground - (falling.columns[c]! - baseRow + 1) * cell : size.h + cell;
    const anim = el.animate(
      [
        { transform: `translateY(0) rotate(0deg)` },
        { transform: `translateY(${landTop - sliderTop}px) rotate(${landed ? 0 : falling.zone === 0 ? -35 : 35}deg)` },
      ],
      { duration: FALL_MS, easing: "cubic-bezier(0.55, 0, 1, 0.45)", fill: "forwards" },
    );
    const id = falling.id;
    if (landed) anim.onfinish = () => setPuff({ x: falling.zone * cell + cell / 2, y: landTop + cell, id });
  }, [falling?.id]);

  function drop() {
    if (falling || blocksHeld <= 0 || !size.w) return;
    const zone = Math.min(DROP_ZONES - 1, Math.max(0, Math.floor(pos.current * DROP_ZONES)));
    send({ type: "tower.drop", zone });
    navigator.vibrate?.(25);
    setFalling({ zone, columns: [...build.columns], id: performance.now() });
    // The last block stays where it landed until the screen switches back to questions.
    if (blocksHeld > 1) setTimeout(() => setFalling(null), FALL_MS + 30);
    else props.onLastDrop(build);
  }

  const floors = Math.min(...columns);
  const rowTop = (r: number) => size.h - ground - (r - baseRow + 1) * cell;
  const blocks = [];
  for (let c = 0; c < 3; c++) {
    for (let r = baseRow; r < columns[c]!; r++) {
      const key = `${c}-${r}`;
      blocks.push(
        <BuildingBlock key={key} x={(c + 1) * cell} y={rowTop(r)} size={cell} color={color} team={team} col={c} row={r} fullFloor={r < floors} fresh={isFresh(key)} />,
      );
    }
  }
  const sky = SKY_STAGES[skyStage(build.floors)]!;

  return (
    <main class="build" onPointerDown={drop}>
      <div class="build-head">
        <b>{blocksHeld > 0 ? `Drop your blocks! ${blocksHeld} left` : "Nice building!"}</b>
        <span>
          Tap anywhere to drop · Team tower: {build.floors} floor{build.floors === 1 ? "" : "s"}
        </span>
      </div>
      <div class="build-area" ref={areaRef} style={{ "--team": color, background: `linear-gradient(${sky.top}, ${sky.bottom})` }}>
        <div class="phone-skyline" style={{ bottom: `${ground}px` }}>
          <SkylineSvg />
        </div>
        <div class="zone miss left" style={{ width: `${cell}px` }}>
          ✕
        </div>
        <div class="zone miss right" style={{ width: `${cell}px` }}>
          ✕
        </div>
        {size.w > 0 && (
          <svg class="build-svg scene-squash" viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true">
            <rect class="sidewalk" x={cell * 0.8} y={size.h - ground} width={cell * 3.4} height={ground} />
            {blocks}
            {newFloor !== null && newFloor > baseRow && newFloor <= floors && (
              <FloorSparkle key={`s${newFloor}`} x={cell} y={rowTop(newFloor - 1)} width={cell * 3} size={cell} />
            )}
            {puff && <DustPuff key={puff.id} x={puff.x} y={puff.y} size={cell} />}
            {egg && egg.row >= baseRow && <EggCell x={(egg.col + 1) * cell} y={rowTop(egg.row)} size={cell} />}
          </svg>
        )}
        {baseRow > 0 && <div class="below">▼ {baseRow} more below</div>}
        {!falling && blocksHeld > 0 && cell > 0 && (
          <div ref={sliderRef} class="piece slider" style={{ top: `${sliderTop}px`, width: `${cell}px`, height: `${cell}px` }}>
            <Piece color={color} team={team} />
          </div>
        )}
        {falling && (
          <div ref={fallRef} key={falling.id} class="piece" style={{ top: `${sliderTop}px`, left: `${falling.zone * cell}px`, width: `${cell}px`, height: `${cell}px` }}>
            <Piece color={color} team={team} />
          </div>
        )}
      </div>
    </main>
  );
}

function TowerResult({ view }: { view: PlayerTowerView }) {
  const r = view.result;
  if (!r) return null;
  return (
    <main class="center">
      <div class="team-badge big" style={{ background: view.team.color }}>
        Team {view.team.name}
      </div>
      <p class="muted">
        finished {r.teamCount > 1 ? `${ordinal(r.teamRank)} of ${r.teamCount}` : "the game"}
      </p>
      <div class={`final-rank ${r.teamRank === 1 && r.teamCount > 1 ? "top" : ""}`}>
        {r.floors} <span class="unit">floor{r.floors === 1 ? "" : "s"}</span>
      </div>
      <p class="big-score">
        You: {view.me.correct} correct · {view.me.placed} block{view.me.placed === 1 ? "" : "s"} placed
      </p>
      {r.awards.map((a) => (
        <div key={a} class="award-chip">
          🏆 {a}
        </div>
      ))}
    </main>
  );
}
