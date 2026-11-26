import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { EMPTY, placementCost } from "../../shared/land-board.ts";
import type { LandBoard, PlayerLandView } from "../../shared/modes/land.ts";
import { LAND_GUARD_COST, LAND_QUESTIONS_PER_ROUND, LAND_STEAL_COST } from "../../shared/modes/land.ts";
import type { ClientMsg } from "../../shared/protocol.ts";
import { HexBoard, LandShape, landArt } from "../shared/land-art.tsx";
import { LandThemeProvider, useNorthPole } from "../shared/land-skin.tsx";
import { useEventFlash } from "../shared/tower-art.tsx";
import { formatClock, ordinal, teamInk, teamVars, useCountdown } from "../shared/ui.tsx";
import { useAfterAnswerWait } from "./after-answer-wait.ts";
import { usePanZoom } from "./pan-zoom.ts";
import { Feedback, StreamQuestion } from "./stream-question.tsx";

type Send = (m: ClientMsg) => void;

const LAST_TILE_PAUSE_MS = 900;

export function LandPlayer({ view, send }: { view: PlayerLandView; send: Send }) {
  return (
    <LandThemeProvider theme={view.theme}>
      <LandPlayerContent view={view} send={send} />
    </LandThemeProvider>
  );
}

function LandPlayerContent({ view, send }: { view: PlayerLandView; send: Send }) {
  const christmas = useNorthPole();
  const secs = useCountdown(view.remainingMs, view.phase);

  // why: the server returns the player to questions as soon as their last claim is spent;
  // hold the board a beat so they see the new tile land.
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
        <div class="team-badge big" style={{ background: view.team.color, color: teamInk(view.team.color) }}>
          <LandShape team={view.team.index} />
          Team {view.team.name}
        </div>
        <p class="muted">Every {LAND_QUESTIONS_PER_ROUND} questions, your correct answers become tiles. Surround land to capture it!</p>
        <div class="tower-count">{Math.max(1, secs)}</div>
      </main>
    );
  } else if (view.phase === "podium") {
    body = <LandResult view={view} />;
  } else if (view.phase === "conquered") {
    body = (
      <main class="center">
        <div class="land-big-icon">👑</div>
        <div class="team-badge big" style={{ background: view.team.color, color: teamInk(view.team.color) }}>
          <LandShape team={view.team.index} />
          Team {view.team.name}
        </div>
        <p class="big-score">rules the whole land!</p>
      </main>
    );
  } else if (board) {
    body = <ClaimMode board={board} claimWait={view.claimWait} claims={view.claims} team={view.team.index} send={send} onLastTile={onLastTile} />;
  } else if (view.state === "empty") {
    body = <EmptyNotice ms={view.emptyRemainingMs} />;
  } else if (view.question) {
    body = <StreamQuestion question={view.question} onAnswer={(seq, option, text) => send({ type: "land.answer", seq, option, text })} />;
  } else {
    body = (
      <main class="center">
        <div class="spinner" />
      </main>
    );
  }

  return (
    <div class={`game tower-game land-game ${christmas ? "land-christmas" : ""}`} style={teamVars(view.team.color)}>
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
        <span class="score">
          {playing ? (
            formatClock(secs)
          ) : (
            <>
              <LandShape team={view.team.index} />
              Team {view.team.name}
            </>
          )}
        </span>
      </header>
      {body}
      {!board && <Feedback feedback={view.feedback} rightText="+1 tile" />}
      <ConqueredNotice event={view.conquered} />
    </div>
  );
}

function EmptyNotice({ ms }: { ms: number }) {
  // why: fixed when the message appears: later snapshots mustn't restart the bar.
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

function ClaimMode(props: {
  board: LandBoard;
  claimWait: PlayerLandView["claimWait"];
  claims: number;
  team: number;
  send: Send;
  onLastTile: (board: LandBoard) => void;
}) {
  const { board, claimWait, claims, team, send } = props;
  const live = claimWait !== null;
  const wait = useAfterAnswerWait(claimWait);
  const [selected, setSelected] = useState<number | null>(null);
  const cost = selected === null ? null : placementCost(board.owners, board.size, board.starts, team, selected, LAND_STEAL_COST, LAND_GUARD_COST);
  const steal = selected !== null && board.owners[selected] !== EMPTY;
  useEffect(() => {
    if (selected !== null && board.owners[selected] === team) setSelected(null);
  }, [board]);

  let hint: string;
  let action: string | null = null;
  if (!live) hint = "Nice one!";
  else if (selected === null) hint = "Tap a tile to pick it";
  else if (cost === null) hint = "Too close to another team's starting point";
  else if (cost > claims)
    hint = steal
      ? `Stealing a tile takes ${cost} tiles; you have ${claims}`
      : `So close to another team's starting point, a tile takes ${cost}; you have ${claims}`;
  else if (steal) {
    hint = `Take this tile from the other team for ${cost} tiles`;
    action = `⚔ Steal (${cost})`;
  } else {
    hint = cost > 1 ? `Close to another team's starting point: costs ${cost} tiles` : "Claim this tile";
    action = cost > 1 ? `🚩 Claim (${cost})` : "🚩 Claim";
  }

  function place() {
    if (!live || wait.isWaiting() || selected === null || cost === null || cost > claims) return;
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
        <span>Unclaimed land costs 1 · numbered tiles cost that many · pinch to zoom</span>
      </div>
      <PanZoom focus={() => focusTiles(board, team)} onTap={(tile) => live && setSelected(tile === selected ? null : tile)}>
        <HexBoard board={board} viewer={team} selected={selected} />
      </PanZoom>
      <footer class="land-foot">
        <div class="land-hint">{wait.seconds > 0 ? `Claim or Steal available in ${wait.seconds}s · ${hint}` : hint}</div>
        <div class="land-actions">
          <button class="btn ghost" disabled={!live} onClick={() => send({ type: "land.done" })}>
            Done{claims > 0 && live ? ` (keep ${claims})` : ""}
          </button>
          {/* The countdown can lag a tap at expiry. Keep legal placements dispatchable; place() checks the clock. */}
          <button class="btn primary big" disabled={!action} aria-disabled={action && wait.seconds > 0 ? true : undefined} onClick={place}>
            {action ?? "🚩 Claim"}
          </button>
        </div>
      </footer>
    </main>
  );
}

function focusTiles(board: LandBoard, team: number): number[] {
  const own = board.owners.flatMap((o, t) => (o === team ? [t] : []));
  if (own.length) return own;
  return board.starts.filter((s) => s.team === team).map((s) => s.tile);
}

function PanZoom({ children, focus, onTap }: { children: ComponentChildren; focus?: () => number[]; onTap: (tile: number) => void }) {
  const christmas = useNorthPole();
  const { box, inner, zoomIn, zoomOut, pointerHandlers } = usePanZoom({
    focus: (el) => focus?.().flatMap((tile) => Array.from(el.querySelectorAll(`[data-tile="${tile}"]`))) ?? [],
    onTap: (e) => {
      const target = e.target;
      if (!target || !("closest" in target) || typeof target.closest !== "function") return;
      const tile = target.closest("[data-tile]")?.getAttribute("data-tile");
      if (tile != null) onTap(Number(tile));
    },
  });

  return (
    <div class="land-area" style={{ backgroundImage: christmas ? undefined : `url(${landArt("felt-tile")})` }} ref={box} {...pointerHandlers}>
      <div class="land-pan" ref={inner}>
        {children}
      </div>
      <div class="land-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button aria-label="Zoom in" onClick={zoomIn}>
          +
        </button>
        <button aria-label="Zoom out" onClick={zoomOut}>
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
      <div class="team-badge big" style={{ background: view.team.color, color: teamInk(view.team.color) }}>
        <LandShape team={view.team.index} />
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
