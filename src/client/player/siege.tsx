import { useEffect, useRef, useState } from "preact/hooks";
import type { ClientMsg, PlayerSiegeView } from "../../shared/protocol.ts";
import {
  SIEGE_BUILD_SQUARES,
  SIEGE_CHEAPEST,
  SIEGE_DEFENDERS,
  SIEGE_DEFENDER_TYPES,
  SIEGE_GOLD_PER_CORRECT,
  SIEGE_HEARTS,
  SIEGE_LANES,
  SIEGE_MAP_IDLE_MS,
  SIEGE_SQUARES,
  siegeUpgradeCost,
  type SiegeDefenderType,
} from "../../shared/siege-rules.ts";
import { DEFENDER_EMOJI, SiegeIcon } from "../shared/siege-art.tsx";
import { useCountdown } from "../shared/ui.tsx";
import { Feedback, StreamQuestion } from "./tower.tsx";

type Send = (m: ClientMsg) => void;

const ALERT_MS = 2500;
const ALERT_TEXT = { giant: "⚠️ A giant approaches!", wall: "💥 The wall was hit!" } as const;

/** Phone screen for Kingdom Siege: answer questions for gold, and tap Build to place or upgrade defenders on the lane map. */
export function SiegePlayer({ view, send }: { view: PlayerSiegeView; send: Send }) {
  const playing = view.phase === "build" || view.phase === "wave";
  const [mapOpen, setMapOpen] = useState(false);
  const openMap = (open: boolean) => {
    setMapOpen(open);
    send({ type: "siege.map", open });
  };
  // The map closes itself when the battle ends.
  useEffect(() => {
    if (!playing && mapOpen) setMapOpen(false);
  }, [playing]);
  // After a reconnect the server has closed our map: ask for it again.
  const noMap = view.map === null;
  useEffect(() => {
    if (mapOpen && noMap && playing) send({ type: "siege.map", open: true });
  }, [mapOpen, noMap]);

  let body;
  if (view.phase === "countdown") body = <Countdown view={view} />;
  else if (view.result) body = <SiegeResult view={view} />;
  else if (view.question) body = <StreamQuestion question={view.question} onAnswer={(seq, option, text) => send({ type: "siege.answer", seq, option, text })} />;
  else
    body = (
      <main class="center">
        <div class="spinner" />
      </main>
    );

  return (
    <div class="game siege-game">
      <header class="bar siege-bar">
        <span class="siege-bar-hearts" aria-label={`${view.hearts} of ${SIEGE_HEARTS} hearts`}>
          <SiegeIcon kind="heart" /> <b>{view.hearts}</b>
        </span>
        <span class="siege-bar-gold" aria-label={`${view.gold} gold in your purse`}>
          <SiegeIcon kind="coin" /> <b>{view.gold}</b>
        </span>
        <span class="siege-bar-wave">{view.wave > 0 ? (view.waves === "endless" ? `Wave ${view.wave}` : `Wave ${view.wave}/${view.waves}`) : view.title}</span>
      </header>
      <AlertBanner alert={view.alert} />
      {body}
      {playing && !mapOpen && view.question && (
        <button class={`siege-build ${view.gold >= SIEGE_CHEAPEST ? "ready" : ""}`} onClick={() => openMap(true)}>
          🔨 Build <span class="siege-build-gold">· <SiegeIcon kind="coin" /> {view.gold}</span>
        </button>
      )}
      {playing && mapOpen && <LaneMap view={view} send={send} onClose={() => openMap(false)} />}
      <Feedback feedback={view.feedback} rightText={`+${SIEGE_GOLD_PER_CORRECT} gold`} />
    </div>
  );
}

/** "A giant approaches!" or "The wall was hit!" across the top, with a short buzz. Doesn't cover the question. */
function AlertBanner({ alert }: { alert: PlayerSiegeView["alert"] }) {
  const [shown, setShown] = useState<NonNullable<PlayerSiegeView["alert"]> | null>(null);
  const first = useRef(true);
  useEffect(() => {
    // An alert already up when the screen opens (a reconnect) isn't news.
    if (first.current) {
      first.current = false;
      return;
    }
    if (!alert) return;
    setShown(alert);
    navigator.vibrate?.(alert.kind === "giant" ? [200, 80, 200] : 120);
    const t = setTimeout(() => setShown(null), ALERT_MS);
    return () => clearTimeout(t);
  }, [alert?.seq]);
  if (!shown) return null;
  return (
    <div class={`siege-alert ${shown.kind}`} role="status" key={shown.seq}>
      {ALERT_TEXT[shown.kind]}
    </div>
  );
}

function Countdown({ view }: { view: PlayerSiegeView }) {
  const secs = useCountdown(view.phaseRemainingMs, "countdown");
  return (
    <main class="center">
      <div class="cup-emoji">🛡️</div>
      <p class="muted">Every right answer adds {SIEGE_GOLD_PER_CORRECT} gold to your own purse. Tap Build to spend it on defenders. The monsters won't wait!</p>
      <div class="tower-count">{Math.max(1, secs)}</div>
    </main>
  );
}

/** The pre-selected defender: the last one this player placed if they can afford it, else the cheapest it can. */
function defaultPick(view: PlayerSiegeView): SiegeDefenderType {
  const can = (t: SiegeDefenderType) => view.gold >= SIEGE_DEFENDERS[t].cost[0];
  if (view.lastPlaced && can(view.lastPlaced)) return view.lastPlaced;
  const cheapest = [...SIEGE_DEFENDER_TYPES].filter(can).sort((a, b) => SIEGE_DEFENDERS[a].cost[0] - SIEGE_DEFENDERS[b].cost[0])[0];
  return cheapest ?? view.lastPlaced ?? "archer";
}

/** The top-down 5 × 7 map of buildable squares (plus the entry squares, where monsters show up). */
function LaneMap({ view, send, onClose }: { view: PlayerSiegeView; send: Send; onClose: () => void }) {
  const [pick, setPick] = useState<SiegeDefenderType>(() => defaultPick(view));
  const [bubble, setBubble] = useState<{ lane: number; square: number } | null>(null);
  const [touched, setTouched] = useState(0);
  const touch = () => setTouched((n) => n + 1);
  // Closes itself after a while without a tap.
  useEffect(() => {
    const t = setTimeout(onClose, SIEGE_MAP_IDLE_MS);
    return () => clearTimeout(t);
  }, [touched]);

  const map = view.map;
  const defender = (lane: number, square: number) => map?.defenders.find((d) => d.lane === lane && d.square === square);
  const monsters = (lane: number, square: number) => map?.monsters.filter((m) => m.lane === lane && m.square === square).length ?? 0;
  const danger = new Set(view.danger);
  const selected = bubble ? defender(bubble.lane, bubble.square) : undefined;
  const upgradeCost = selected ? siegeUpgradeCost(selected.type, selected.level) : null;

  const tapSquare = (lane: number, square: number) => {
    touch();
    const d = defender(lane, square);
    if (d) {
      if (bubble && bubble.lane === lane && bubble.square === square && upgradeCost !== null) {
        send({ type: "siege.upgrade", lane, square });
        onClose();
      } else {
        setBubble({ lane, square });
      }
      return;
    }
    if (monsters(lane, square) > 0) return;
    setBubble(null);
    send({ type: "siege.place", defender: pick, lane, square });
    onClose();
  };

  return (
    <div class="siege-map" role="dialog" aria-label="Lane map">
      <div class="siege-map-head">
        <div class="siege-strip">
          {SIEGE_DEFENDER_TYPES.map((t) => {
            const cost = SIEGE_DEFENDERS[t].cost[0];
            return (
              <button
                key={t}
                class={`siege-pick ${pick === t ? "on" : ""} ${view.gold >= cost ? "" : "poor"}`}
                onClick={() => {
                  touch();
                  setPick(t);
                  setBubble(null);
                }}
              >
                <SiegeIcon kind={t} />
                <span class="siege-pick-name">{SIEGE_DEFENDERS[t].label}</span>
                <span class="siege-pick-cost">
                  <SiegeIcon kind="coin" /> {cost}
                </span>
              </button>
            );
          })}
        </div>
        <button class="siege-map-close" aria-label="Close the map" onClick={onClose}>
          ✕
        </button>
      </div>
      <div class="siege-grid" style={{ "--cols": String(SIEGE_SQUARES) }}>
        {Array.from({ length: SIEGE_LANES }, (_, lane) => (
          <div key={lane} class={`siege-row ${danger.has(lane) ? "danger" : ""}`}>
            <span class="siege-wall-edge" aria-hidden="true" />
            {Array.from({ length: SIEGE_SQUARES }, (_, i) => {
              const square = i + 1;
              const d = defender(lane, square);
              const dots = monsters(lane, square);
              const entry = square > SIEGE_BUILD_SQUARES;
              const isBubble = bubble?.lane === lane && bubble.square === square;
              return (
                <button
                  key={square}
                  class={`siege-cell ${entry ? "entry" : ""} ${d ? `has ${d.type}` : ""} ${isBubble ? "picked" : ""}`}
                  disabled={entry || (!d && dots > 0)}
                  aria-label={d ? `${SIEGE_DEFENDERS[d.type].label} level ${d.level}, lane ${lane + 1} square ${square}` : `Lane ${lane + 1} square ${square}`}
                  onClick={() => tapSquare(lane, square)}
                >
                  {d && (
                    <span class="siege-cell-def">
                      {DEFENDER_EMOJI[d.type]}
                      {d.level > 1 && <sup>{d.level}</sup>}
                    </span>
                  )}
                  {dots > 0 && <span class="siege-dot">{dots > 1 ? dots : ""}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {selected ? (
        <div class="siege-bubble">
          {upgradeCost === null ? (
            <>
              {SIEGE_DEFENDERS[selected.type].label} Lv {selected.level}: <b>Max level</b>
            </>
          ) : (
            <>
              {SIEGE_DEFENDERS[selected.type].label} Lv {selected.level} → Lv {selected.level + 1}: <b>{upgradeCost} gold</b>
              <span class="muted">{view.gold >= upgradeCost ? " · tap again to buy" : " · not enough gold"}</span>
            </>
          )}
        </div>
      ) : (
        <p class="siege-map-hint muted">Tap an empty square to place {pick === "archer" ? "an" : "a"} {SIEGE_DEFENDERS[pick].label.toLowerCase()}. Tap a defender to upgrade it.</p>
      )}
    </div>
  );
}

function SiegeResult({ view }: { view: PlayerSiegeView }) {
  const r = view.result!;
  const ending = view.phase !== "podium";
  const icon = r.outcome === "stands" ? "🏰" : r.outcome === "fallen" ? "🪨" : "🛡️";
  return (
    <main class={`center siege-result ${r.outcome}`}>
      <div class="cup-emoji">{icon}</div>
      <h1>{r.outcome === "stands" ? "The kingdom stands!" : r.outcome === "fallen" ? "The castle has fallen" : "Game over"}</h1>
      <p class="siege-headline">{r.headline}</p>
      {!ending && (
        <>
          <ul class="siege-stats">
            <li>
              <SiegeIcon kind="coin" /> {r.goldEarned} gold earned, {r.goldSpent} spent
            </li>
            <li>
              {DEFENDER_EMOJI.archer} {r.placed.archer} · {DEFENDER_EMOJI.knight} {r.placed.knight} · {DEFENDER_EMOJI.wall} {r.placed.wall} placed
            </li>
            <li>⬆️ {r.upgrades} upgrade{r.upgrades === 1 ? "" : "s"}</li>
            <li>⚔️ {r.defeated} monster{r.defeated === 1 ? "" : "s"} defeated by your defenders</li>
          </ul>
          {r.awards.length > 0 && (
            <div class="siege-awards-mine">
              {r.awards.map((a) => (
                <span key={a} class="award-chip">
                  🏅 {a}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
