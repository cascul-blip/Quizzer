import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { GiftItem, GiftItemKind } from "../../shared/gift-rules.ts";
import { GIFT_CORRECT_TO_PLAY, GIFT_DUDS, GIFT_READY_MS, GIFT_ROUND_MS } from "../../shared/gift-rules.ts";
import type { GiftHit, PlayerGiftView } from "../../shared/modes/gift.ts";
import type { ClientMsg } from "../../shared/protocol.ts";
import card from "../shared/gift/card.webp";
import chest from "../shared/gift/chest.webp";
import coal from "../shared/gift/coal.webp";
import controller from "../shared/gift/controller.webp";
import headphones from "../shared/gift/headphones.webp";
import present from "../shared/gift/present.webp";
import shield from "../shared/gift/shield.webp";
import sneaker from "../shared/gift/sneaker.webp";
import socks from "../shared/gift/socks.webp";
import star from "../shared/gift/star.webp";
import sweater from "../shared/gift/sweater.webp";
import toothbrush from "../shared/gift/toothbrush.webp";
import workshop from "../shared/gift/workshop.webp";
import { formatClock, ordinal, useCountdown } from "../shared/ui.tsx";
import { Feedback, StreamQuestion } from "./stream-question.tsx";
import "./gift.css";

type Send = (msg: ClientMsg) => void;
type Bonus = NonNullable<PlayerGiftView["bonus"]>;
const TAP_ACK_MS = 300;

const ART: Record<GiftItemKind, { src: string; label: string }> = {
  present: { src: present, label: "Wrapped present" },
  headphones: { src: headphones, label: "Headphones" },
  controller: { src: controller, label: "Game controller" },
  sneaker: { src: sneaker, label: "Sneaker" },
  card: { src: card, label: "Gift card" },
  socks: { src: socks, label: "Socks" },
  coal: { src: coal, label: "Coal" },
  sweater: { src: sweater, label: "Ugly sweater" },
  toothbrush: { src: toothbrush, label: "Toothbrush" },
  shield: { src: shield, label: "Candy Cane Shield" },
  star: { src: star, label: "Golden Star" },
};

export function GiftPlayer({ view, send }: { view: PlayerGiftView; send: Send }) {
  const seconds = useCountdown(view.remainingMs, view.phase);
  useEffect(() => {
    // Load the playfield and targets while the player is answering questions.
    for (const url of [workshop, chest, ...Object.values(ART).map(({ src }) => src)]) {
      new Image().src = url;
    }
  }, []);

  if (view.bonus) {
    return (
      <div class="game gift-game">
        <GiftBonus key={view.bonus.round} bonus={view.bonus} score={view.score} send={send} />
        {view.feedback && <Feedback feedback={view.feedback} rightText="Gift round earned!" />}
      </div>
    );
  }

  return (
    <div class="game gift-game">
      <header class="bar">
        <span class="name">🎁 Gift Grab</span>
        {view.phase === "playing" && (
          <span class="qnum">
            {view.progress} / {GIFT_CORRECT_TO_PLAY} correct
          </span>
        )}
        <span class="score">
          {view.score.toLocaleString()} pts{view.phase === "playing" && ` · ${formatClock(seconds)}`}
        </span>
      </header>
      {view.question ? (
        <StreamQuestion question={view.question} onAnswer={(seq, option, text) => send({ type: "gift.answer", seq, option, text })} />
      ) : (
        <main class="center">
          {view.phase === "countdown" ? (
            <>
              <h1>{Math.max(1, seconds)}</h1>
              <p>Get five questions right to open Santa’s chest.</p>
              <p>Tap gifts and power-ups. Dodge the duds.</p>
            </>
          ) : view.phase === "podium" ? (
            <>
              <h1>{view.rank !== null && `${ordinal(view.rank)} place`}</h1>
              <p>
                {view.score.toLocaleString()} points · {view.correct} correct
              </p>
            </>
          ) : (
            <h1>Finishing bonus rounds…</h1>
          )}
        </main>
      )}
      {view.phase === "playing" && <Feedback feedback={view.feedback} rightText="Correct!" />}
    </div>
  );
}

function itemPosition(item: GiftItem, elapsed: number) {
  const t = Math.min(1, Math.max(0, (elapsed - item.from) / (item.until - item.from)));
  const side = item.lane - 1;
  return {
    x: 50 + side * (18 + 14 * t),
    y: 73 - (44 - 6 * Math.abs(side)) * 4 * t * (1 - t) - 9 * t,
  };
}

function hitText(hit: GiftHit): string {
  if (hit.effect === "blocked") return "Blocked!";
  if (hit.effect === "shield") return "Shield!";
  if (hit.effect === "star") return "Double next gift!";
  return hit.delta > 0 ? `+${hit.delta}` : hit.delta < 0 ? `−${-hit.delta}` : "0";
}

function GiftBonus({ bonus, score, send }: { bonus: Bonus; score: number; send: Send }) {
  const deadline = useRef(performance.now() + bonus.remainingMs);
  const [elapsed, setElapsed] = useState(GIFT_ROUND_MS - bonus.remainingMs);
  const pending = useRef(new Map<number, { at: number; point: ReturnType<typeof itemPosition> }>());
  const [, refresh] = useState(0);
  const previousHitCount = useRef(bonus.hits.length);
  const [pops, setPops] = useState<Array<GiftHit & ReturnType<typeof itemPosition>>>([]);
  const claimed = new Set(bonus.hits.map((hit) => hit.item));
  // Give an unacknowledged tap another chance if the phone briefly lost its connection.
  const isPending = (id: number) => elapsed - (pending.current.get(id)?.at ?? -Infinity) < TAP_ACK_MS;
  const active = bonus.items.filter(({ id, from, until }) => elapsed >= from && elapsed < until && !claimed.has(id) && !isPending(id));

  useLayoutEffect(() => {
    deadline.current = Math.min(deadline.current, performance.now() + bonus.remainingMs);
  }, [bonus.remainingMs]);

  useEffect(() => {
    let frame: number;
    const tick = (now: number) => {
      const at = Math.min(GIFT_ROUND_MS, GIFT_ROUND_MS - Math.max(0, deadline.current - now));
      setElapsed(at);
      if (at < GIFT_ROUND_MS) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    if (bonus.hits.length <= previousHitCount.current) return;
    const arrived = bonus.hits.slice(previousHitCount.current);
    const next = arrived.map((hit) => ({ ...hit, ...(pending.current.get(hit.item)?.point ?? itemPosition(bonus.items[hit.item]!, elapsed)) }));
    previousHitCount.current = bonus.hits.length;
    setPops((old) => [...old, ...next]);
  }, [bonus.hits.length]);

  const tap = (item: GiftItem) => {
    if (isPending(item.id)) return;
    pending.current.set(item.id, { at: elapsed, point: itemPosition(item, elapsed) });
    refresh((value) => value + 1);
    send({ type: "gift.tap", round: bonus.round, item: item.id });
  };
  const ready = elapsed < 0;
  return (
    <main class="gift-bonus">
      <div class="gift-playfield" style={{ backgroundImage: `url("${workshop}")` }}>
        <header class="gift-hud">
          <span aria-label={`${score} points`}>{score.toLocaleString()}</span>
          <span aria-label="Bonus time remaining">{(Math.ceil(Math.max(0, GIFT_ROUND_MS - Math.max(0, elapsed)) / 100) / 10).toFixed(1)}s</span>
          <span aria-label={`${bonus.multiplier} times points`}>×{bonus.multiplier}</span>
        </header>
        {bonus.power && (
          <div class="gift-power" role="status">
            {bonus.power === "shield" ? "Shield ready" : "Next gift doubled"}
          </div>
        )}
        <img class="gift-chest" src={chest} alt="" draggable={false} />
        {ready && elapsed >= -GIFT_READY_MS && (
          <div class="gift-ready" role="status">
            Ready?
          </div>
        )}
        <svg class="gift-trails" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {active.map((item) => {
            const points = [135, 90, 45, 0].map((delay) => itemPosition(item, elapsed - delay));
            const color = GIFT_DUDS.some((kind) => kind === item.kind) ? "#e1a9ff" : "#ffd27d";
            return <polyline key={item.id} points={points.map(({ x, y }) => `${x},${y}`).join(" ")} stroke={color} />;
          })}
        </svg>
        {active.map((item) => {
          const { x, y } = itemPosition(item, elapsed);
          return (
            <button
              key={item.id}
              type="button"
              class="gift-target"
              aria-label={ART[item.kind].label}
              style={{ left: `${x}%`, top: `${y}%` }}
              onPointerDown={(event) => {
                if (event.button === 0) tap(item);
              }}
              onClick={(event) => {
                if (event.detail === 0) tap(item);
              }}
            >
              <img src={ART[item.kind].src} alt="" draggable={false} />
            </button>
          );
        })}
        {pops.map((hit) => (
          <span
            key={hit.item}
            class={`gift-pop ${hit.delta < 0 ? "negative" : ""}`}
            style={{ left: `${hit.x}%`, top: `${hit.y}%` }}
            onAnimationEnd={() => setPops((old) => old.filter(({ item }) => item !== hit.item))}
            aria-hidden="true"
          >
            {hitText(hit)}
          </span>
        ))}
      </div>
    </main>
  );
}
