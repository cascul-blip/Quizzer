import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { placementCost } from "../../shared/land-board.ts";
import { LAND_QUESTIONS_PER_ROUND, LAND_STEAL_COST, type ClientMsg, type LandBoard, type PlayerLandView } from "../../shared/protocol.ts";
import { HexBoard } from "../shared/land-art.tsx";
import { useEventFlash } from "../shared/tower-art.tsx";
import { formatClock, ordinal, useCountdown } from "../shared/ui.tsx";
import { Feedback, StreamQuestion } from "./tower.tsx";

type Send = (m: ClientMsg) => void;

/** After the last tile goes down, keep the land on screen this long before the questions come back. */
const LAST_TILE_PAUSE_MS = 900;
const MAX_ZOOM = 4;

/** Phone screen for Land Grab: three questions, then place the tiles they earned. */
export function LandPlayer({ view, send }: { view: PlayerLandView; send: Send }) {
  const secs = useCountdown(view.remainingMs, view.phase);

  // The server sends the player back to questions the moment their last claim is spent;
  // hold the board (with the new tile on it) for a beat so they see it land.
  const [hold, setHold] = useState<LandBoard | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(holdTimer.current), []);
  const onLastTile = (board: LandBoard) => {
    setHold(board);
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => setHold(null), LAST_TILE_PAUSE_MS);
  };

  const playing = view.phase === "playing";
  const board = playing ? (view.board ?? hold) : null;

  let body;
  if (view.phase === "countdown") {
    body = (
      <main class="center">
        <div class="team-badge big" style={{ background: view.team.color }}>
          Team {view.team.name}
        </div>
        <p class="muted">
          Every {LAND_QUESTIONS_PER_ROUND} questions, your correct answers become tiles. Surround land to capture it!
        </p>
        <div class="tower-count">{Math.max(1, secs)}</div>
      </main>
    );
  } else if (view.phase === "podium") {
    body = <LandResult view={view} />;
  } else if (view.phase === "conquered") {
    body = (
      <main class="center">
        <div class="land-big-icon">👑</div>
        <div class="team-badge big" style={{ background: view.team.color }}>
          Team {view.team.name}
        </div>
        <p class="big-score">rules the whole land!</p>
      </main>
    );
  } else if (board) {
    body = <ClaimMode board={board} live={!!view.board} claims={view.claims} team={view.team.index} send={send} onLastTile={onLastTile} />;
  } else if (view.state === "empty") {
    body = <EmptyNotice ms={view.emptyMs} />;
  } else if (view.question) {
    body = <StreamQuestion question={view.question} onAnswer={(seq, option) => send({ type: "land.answer", seq, option })} />;
  } else {
    body = (
      <main class="center">
        <div class="spinner" />
      </main>
    );
  }

  return (
    <div class="game tower-game land-game" style={{ "--team": view.team.color }}>
      <header class="bar team-bar">
        <span class="name">{view.me.nickname}</span>
        {playing && (
          <span class="land-meter" aria-label={`${view.answered} of ${LAND_QUESTIONS_PER_ROUND} questions answered, ${view.claims} tiles to place`}>
            <span class="blocks-meter">
              {Array.from({ length: LAND_QUESTIONS_PER_ROUND }, (_, i) => (
                <i key={i} class={i < view.answered ? "full" : ""} />
              ))}
            </span>
            <b>🚩 {view.claims}</b>
          </span>
        )}
        <span class="score">{playing ? formatClock(secs) : `Team ${view.team.name}`}</span>
      </header>
      {body}
      <Feedback feedback={view.feedback} rightText={view.state === "claim" ? "+1 tile. To the land!" : "+1 tile"} />
      <ConqueredNotice event={view.conquered} />
    </div>
  );
}

function EmptyNotice({ ms }: { ms: number }) {
  // Fixed when the message appears: later snapshots mustn't restart the bar.
  const [duration] = useState(ms);
  return (
    <main class="center land-empty">
      <div class="land-big-icon">🌱</div>
      <h2>You have no tiles to place!</h2>
      <p class="muted">Answer correctly to earn tiles.</p>
      <div class="land-empty-bar">
        <i style={{ animationDuration: `${duration}ms` }} />
      </div>
    </main>
  );
}

/** Your team's starting point was surrounded: you play for the conquerors now. */
function ConqueredNotice({ event }: { event: PlayerLandView["conquered"] }) {
  const shown = useEventFlash(event, event?.seq, 3500);
  useEffect(() => {
    if (shown) navigator.vibrate?.([200, 80, 200]);
  }, [shown?.seq]);
  if (!shown) return null;
  return (
    <div class="flash monster-flash smashed" role="alert">
      <div class="flash-icon">💥</div>
      <div class="flash-text">Team {shown.from} was surrounded!</div>
      <div class="flash-answer">
        <b class="monster-detail">You're on Team {shown.by} now. Keep playing!</b>
      </div>
    </div>
  );
}

function ClaimMode(props: { board: LandBoard; live: boolean; claims: number; team: number; send: Send; onLastTile: (board: LandBoard) => void }) {
  const { board, live, claims, team, send } = props;
  const [selected, setSelected] = useState<number | null>(null);
  const cost = selected === null ? null : placementCost(board.owners, board.size, board.starts, team, selected, LAND_STEAL_COST);
  // The tile went to someone else, or to us, since it was picked.
  useEffect(() => {
    if (selected !== null && board.owners[selected] === team) setSelected(null);
  }, [board]);

  let hint: string;
  let action: string | null = null;
  if (!live) hint = "Nice one!";
  else if (selected === null) hint = "Tap a tile to pick it";
  else if (cost === null) hint = "Too close to another team's starting point";
  else if (cost > claims) hint = `Stealing a tile takes ${LAND_STEAL_COST} tiles; you have ${claims}`;
  else {
    hint = cost > 1 ? `Take this tile from the other team for ${cost} tiles` : "Claim this tile";
    action = cost > 1 ? `⚔ Steal (${cost})` : "🚩 Claim";
  }

  function place() {
    if (selected === null || cost === null || cost > claims) return;
    send({ type: "land.place", tile: selected });
    navigator.vibrate?.(25);
    if (cost >= claims) {
      const owners = [...board.owners];
      owners[selected] = team;
      props.onLastTile({ ...board, owners });
    }
    setSelected(null);
  }

  return (
    <main class="land-claim">
      <div class="build-head">
        <b>{live ? `Place your tiles! ${claims} left` : "Tile placed!"}</b>
        <span>Grass costs 1 · another team's tile costs {LAND_STEAL_COST} · pinch to zoom</span>
      </div>
      <PanZoom onTap={(tile) => live && setSelected(tile === selected ? null : tile)}>
        <HexBoard board={board} viewer={team} selected={selected} />
      </PanZoom>
      <footer class="land-foot">
        <div class="land-hint">{hint}</div>
        <div class="land-actions">
          <button class="btn ghost" disabled={!live} onClick={() => send({ type: "land.done" })}>
            Done{claims > 0 && live ? ` (keep ${claims})` : ""}
          </button>
          <button class="btn primary big" disabled={!action} onClick={place}>
            {action ?? "🚩 Claim"}
          </button>
        </div>
      </footer>
    </main>
  );
}

/** Drag to pan, pinch (or the buttons, or the mouse wheel) to zoom; a touch that doesn't move is a tap on a tile. */
function PanZoom({ children, onTap }: { children: ComponentChildren; onTap: (tile: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const view = useRef({ s: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: false, travel: 0 });

  const apply = () => {
    const el = box.current;
    const v = view.current;
    if (!el || !inner.current) return;
    v.x = Math.min(0, Math.max(el.clientWidth * (1 - v.s), v.x));
    v.y = Math.min(0, Math.max(el.clientHeight * (1 - v.s), v.y));
    inner.current.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.s})`;
  };
  /** Zoom by `factor`, keeping the point (cx, cy) of the box under the fingers. */
  const zoomAt = (cx: number, cy: number, factor: number) => {
    const v = view.current;
    const s = Math.min(MAX_ZOOM, Math.max(1, v.s * factor));
    v.x = cx - ((cx - v.x) * s) / v.s;
    v.y = cy - ((cy - v.y) * s) / v.s;
    v.s = s;
    apply();
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 } : null;
  };

  useEffect(() => {
    const el = box.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(p.x, p.y, e.deltaY < 0 ? 1.2 : 1 / 1.2);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      el.removeEventListener("wheel", onWheel);
      ro.disconnect();
    };
  }, []);

  const onDown = (e: PointerEvent) => {
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) gesture.current = { moved: false, travel: 0 };
    else gesture.current.moved = true;
  };
  const onMove = (e: PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const before = spread();
    const now = local(e);
    pointers.current.set(e.pointerId, now);
    const g = gesture.current;
    if (pointers.current.size === 1) {
      g.travel += Math.hypot(now.x - prev.x, now.y - prev.y);
      if (g.travel > 8) g.moved = true;
      if (!g.moved) return;
      view.current.x += now.x - prev.x;
      view.current.y += now.y - prev.y;
      apply();
    } else {
      const after = spread();
      if (!before || !after || before.d === 0) return;
      view.current.x += after.cx - before.cx;
      view.current.y += after.cy - before.cy;
      zoomAt(after.cx, after.cy, after.d / before.d);
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size > 0 || gesture.current.moved || e.type !== "pointerup") return;
    const tile = (e.target as Element | null)?.closest?.("[data-tile]")?.getAttribute("data-tile");
    if (tile != null) onTap(Number(tile));
  };
  const step = (factor: number) => {
    const el = box.current!;
    zoomAt(el.clientWidth / 2, el.clientHeight / 2, factor);
  };

  return (
    <div class="land-area" ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}>
      <div class="land-pan" ref={inner}>
        {children}
      </div>
      <div class="land-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button aria-label="Zoom in" onClick={() => step(1.5)}>
          +
        </button>
        <button aria-label="Zoom out" onClick={() => step(1 / 1.5)}>
          −
        </button>
      </div>
    </div>
  );
}

function LandResult({ view }: { view: PlayerLandView }) {
  const r = view.result;
  if (!r) return null;
  return (
    <main class="center">
      <div class="team-badge big" style={{ background: view.team.color }}>
        Team {view.team.name}
      </div>
      <p class="muted">
        finished {ordinal(r.teamRank)} of {r.teamCount}
      </p>
      <div class={`final-rank ${r.won ? "top" : ""}`}>
        {r.tiles} <span class="unit">tile{r.tiles === 1 ? "" : "s"}</span>
      </div>
      <p class="big-score">
        You: {view.me.correct} correct · {view.me.placed} tile{view.me.placed === 1 ? "" : "s"} placed
      </p>
      {r.awards.map((a) => (
        <div key={a} class="award-chip">
          🏆 {a}
        </div>
      ))}
    </main>
  );
}
