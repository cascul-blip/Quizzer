import { useEffect, useState } from "preact/hooks";
import type { ClientMsg, DuelArenaResult, DuelistResult, DuelPlayerRef, PlayerDuelView } from "../../shared/protocol.ts";
import { DuelStreet, Duelist, DustPuff, GunSmoke, MuzzleFlash, WantedPoster } from "../shared/duel-art.tsx";
import { PinBoard, PinDragger } from "../shared/pin.tsx";
import { LockedChoice, Shape, TextAnswer, optionColor, ordinal, useCountdown } from "../shared/ui.tsx";

type Send = (m: ClientMsg) => void;
type Pose = "idle" | "ready" | "draw" | "fire" | "stagger" | "tip" | "walk1" | "walk2";
type Hat = "brown" | "black" | "white" | "sheriff" | null;

/** Questions longer than this are set in smaller type so every screen fits without scrolling. */
const LONG_QUESTION = 140;

const qClass = (text: string) => (text.length > LONG_QUESTION ? "long" : "");
const arenaName = (n: number) => (n === 1 ? "High Noon" : `Arena ${n}`);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Phone screen for Showdown: a small face-off strip on top, the shared question underneath. */
export function DuelPlayer({ view, send }: { view: PlayerDuelView; send: Send }) {
  const q = view.question;
  const watching = view.opponents.length === 0;

  let body;
  if (view.phase === "podium") {
    body = <DuelPodium view={view} />;
  } else if (!q) {
    body = (
      <main class="center">
        <div class="spinner" />
      </main>
    );
  } else if (view.phase === "intro") {
    body = <DuelIntro view={view} />;
  } else if (view.phase === "open") {
    body = watching ? <DuelWatch view={view} /> : <DuelAnswering key={q.index} view={view} send={send} />;
  } else {
    body = <DuelReveal view={view} />;
  }

  return (
    <div class="game duel-game fit-screen">
      <header class="bar">
        <span class="name">{view.me.nickname}</span>
        {view.phase !== "podium" && (
          <span class="qnum">
            Round {view.round} / {view.rounds}
          </span>
        )}
        <span class="score duel-num">
          {view.me.wins} {view.me.wins === 1 ? "win" : "wins"}
        </span>
      </header>
      {view.phase !== "podium" && <FaceOff view={view} />}
      {body}
    </div>
  );
}

/** What each figure in the strip does: from the round's result on the reveal, otherwise from the phase. */
function poses(view: PlayerDuelView, me: DuelistResult | undefined): { mine: Pose; theirs: (o: DuelPlayerRef) => Pose } {
  if (view.phase === "reveal" && view.myDuel) {
    const by = new Map(view.myDuel.duelists.map((d) => [d.id, d]));
    const pose = (d: DuelistResult | undefined): Pose => (!d ? "idle" : d.outcome === "win" ? "fire" : d.outcome === "lose" ? "stagger" : "ready");
    return { mine: pose(me), theirs: (o) => pose(by.get(o.id)) };
  }
  const answered = view.myChoice !== null || view.myText !== null;
  return { mine: view.phase === "open" && answered ? "ready" : "idle", theirs: () => (view.phase === "open" ? "ready" : "idle") };
}

/** The mini face-off: you on the left facing right, your opponent(s) on the right facing left. */
function FaceOff({ view }: { view: PlayerDuelView }) {
  const duel = view.phase === "reveal" ? view.myDuel : null;
  const me = duel?.duelists.find((d) => d.id === view.me.id);
  const opponents: DuelPlayerRef[] = duel ? duel.duelists.filter((d) => d.id !== view.me.id) : view.opponents;
  const p = poses(view, me);
  const hatFor = (pose: Pose, normal: Hat): Hat => (pose === "stagger" ? null : view.arena === 1 ? "sheriff" : normal);
  const fxKey = `${view.round}:${view.phase}`;
  const label = view.arena === 1 ? "⭐ High Noon" : `Arena ${view.arena} of ${view.arenaCount}`;

  return (
    <div class={`duel-strip ${view.arena === 1 ? "noon" : ""}`}>
      <div class="duel-street">
        <DuelStreet arena={view.arena} phone />
      </div>
      <div class="duel-caption">
        <b>{label}</b>
        {opponents.length > 0 && <span> · vs {opponents.map((o) => o.nickname).join(" & ")}</span>}
      </div>
      <div class="duel-side me">
        <div class="duel-fig">
          <Duelist avatar={view.me.avatar} pose={p.mine} facing="right" hat={hatFor(p.mine, "brown")} phone />
          {p.mine === "fire" && (
            <span key={fxKey} class="duel-fx flash">
              <MuzzleFlash facing="right" />
              <GunSmoke facing="right" />
            </span>
          )}
        </div>
      </div>
      {duel?.draw && (
        <span key={fxKey} class="duel-fx dust">
          <DustPuff />
        </span>
      )}
      <div class={`duel-side them n${opponents.length}`}>
        {opponents.map((o) => {
          const pose = p.theirs(o);
          return (
            <div key={o.id} class="duel-fig">
              <Duelist avatar={o.avatar} pose={pose} facing="left" hat={hatFor(pose, "black")} phone />
              {pose === "fire" && (
                <span key={fxKey} class="duel-fx flash">
                  <MuzzleFlash facing="left" />
                  <GunSmoke facing="left" />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DuelIntro({ view }: { view: PlayerDuelView }) {
  const q = view.question!;
  const left = useCountdown(view.phaseRemainingMs, `intro:${view.round}`);
  return (
    <main class="center duel-watch">
      <p class={`q-text duel-q ${qClass(q.text)}`}>{q.text}</p>
      {view.opponents.length === 0 ? (
        <p class="duel-ask">You'll join the bottom arena next round</p>
      ) : (
        <p class="duel-ask">Get ready… {left > 0 && <span class="duel-num">{left}</span>}</p>
      )}
    </main>
  );
}

/** Joined mid-round: no opponent yet, so just the question and the clock. */
function DuelWatch({ view }: { view: PlayerDuelView }) {
  const q = view.question!;
  const left = useCountdown(q.remainingMs, `open:${q.index}`);
  return (
    <main class="center duel-watch">
      <div class={`timer ${left <= 5 ? "urgent" : ""}`}>{left}</div>
      <p class={`q-text duel-q ${qClass(q.text)}`}>{q.text}</p>
      <p class="duel-ask">You'll join the bottom arena next round</p>
      <p class="muted">Watch the projector for now.</p>
    </main>
  );
}

function DuelAnswering({ view, send }: { view: PlayerDuelView; send: Send }) {
  const q = view.question!;
  const [pending, setPending] = useState<number | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const left = useCountdown(q.remainingMs, `open:${q.index}`);
  const chosen = view.myChoice ?? pending;
  const typed = view.myText ?? pendingText;

  if (chosen !== null || typed !== null) {
    return (
      <main class="center duel-locked">
        {typed !== null ? (
          <div class="locked-text">{typed}</div>
        ) : (
          <LockedChoice type={q.type} index={chosen!} label={q.options[chosen!] ?? ""} />
        )}
        <h1>Locked in</h1>
        <p class="duel-ask">Hand on your holster…</p>
      </main>
    );
  }

  const choose = (i: number) => {
    navigator.vibrate?.(30);
    setPending(i);
    send({ type: "duel.answer", index: q.index, option: i });
  };
  const pin = q.type === "pin" && q.image && q.spots ? { image: q.image, spots: q.spots } : null;
  return (
    <main class="answering">
      <div class="q-head">
        <div class={`timer ${left <= 5 ? "urgent" : ""}`}>{left}</div>
        <h2 class={`q-text ${qClass(q.text)}`}>{q.text}</h2>
      </div>
      {q.image && !pin && <img class="q-img" src={`/${q.image}`} alt="" />}
      {pin ? (
        <PinDragger key={q.index} image={pin.image} spots={pin.spots} labels={q.options} onSubmit={choose} />
      ) : q.type === "text" ? (
        <TextAnswer
          key={q.index}
          onSubmit={(text) => {
            navigator.vibrate?.(30);
            setPendingText(text);
            send({ type: "duel.answer", index: q.index, option: 0, text });
          }}
        />
      ) : (
        <div class={`answers n${q.options.length}`}>
          {q.options.map((text, i) => {
            const c = optionColor(q.type, i);
            return (
              <button key={i} class={`answer opt-${c}`} onClick={() => choose(i)}>
                <Shape index={c} />
                <span>{text}</span>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}

/** The line that says how the duel went and where this player goes next. */
function duelLine(duel: DuelArenaResult, me: DuelistResult): { text: string; tone: "up" | "down" | "" } {
  const here = duel.arena;
  const next = me.nextArena;
  if (me.outcome === "win") {
    if (next < here) return { text: `You drew first! ⬆ ${arenaName(next)}`, tone: "up" };
    return { text: here === 1 ? "You drew first! ⭐ You hold High Noon" : `You drew first! You stay in ${arenaName(here)}`, tone: "up" };
  }
  if (me.outcome === "lose") {
    if (next > here) return { text: `Too slow, partner. ⬇ ${arenaName(next)}`, tone: "down" };
    return { text: `Too slow, partner. You stay in ${arenaName(here)}`, tone: "down" };
  }
  return { text: duel.draw ? "Draw — you hold your ground" : `You hold your ground in ${arenaName(here)}`, tone: "" };
}

function DuelReveal({ view }: { view: PlayerDuelView }) {
  const q = view.question!;
  const r = view.reveal;
  const duel = view.myDuel;
  const me = duel?.duelists.find((d) => d.id === view.me.id);
  const good = !!r?.wasCorrect;
  const answered = !!r && (r.choice !== null || view.myText !== null);
  const heading = !answered ? "No answer" : good ? "Correct!" : "Wrong";
  const line = duel && me ? duelLine(duel, me) : null;

  // A light buzz once per round: a double tap for a win, one for a loss.
  useEffect(() => {
    if (!me) return;
    navigator.vibrate?.(me.outcome === "win" ? [40, 40, 80] : me.outcome === "lose" ? 120 : 30);
  }, [view.round]);

  const correctSet = new Set(r?.correct ?? []);
  return (
    <main class={`result duel-reveal ${good ? "good" : "bad"}`}>
      <div class="verdict">
        <div class="verdict-icon">{good ? "✓" : "✗"}</div>
        <h1>{heading}</h1>
        {r?.ms != null && <div class="points duel-num">{secs(r.ms)}</div>}
      </div>
      {line ? (
        <div class={`duel-line ${line.tone}`}>{line.text}</div>
      ) : (
        <div class="duel-line">You'll join the bottom arena next round</div>
      )}
      {!good && r && (
        <>
          {view.myText !== null && (
            <p class="muted duel-typed">
              You typed: <b>{view.myText}</b>
            </p>
          )}
          {q.type === "pin" && q.image && q.spots ? (
            <div class="pin-result">
              <PinBoard
                image={q.image}
                spots={q.spots}
                labels={q.options}
                correct={r.correct}
                pinAt={r.choice}
                wrong={r.choice !== null && !correctSet.has(r.choice) ? r.choice : null}
              />
            </div>
          ) : (
            <ul class="reveal-list">
              {r.correct.map((i) => {
                const c = optionColor(q.type, i);
                return (
                  <li key={i} class={`reveal-item opt-${c} is-correct`}>
                    <Shape index={c} />
                    <span class="t">{q.options[i]}</span>
                    <span class="tag">✓ {r.correct.length > 1 ? "Correct" : "Answer"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

function DuelPodium({ view }: { view: PlayerDuelView }) {
  const r = view.result;
  if (!r) return null;
  const m = view.me;
  return (
    <main class="center duel-podium">
      <div class="duel-poster">
        <WantedPoster avatar={m.avatar}>
          <b>{m.nickname}</b>
        </WantedPoster>
      </div>
      <div class={`final-rank ${r.rank <= 3 ? "top" : ""}`}>{ordinal(r.rank)}</div>
      <p class="big-score">
        Rank {r.rank} of {r.playerCount}
      </p>
      <p class="muted duel-num">
        {m.wins}W · {m.losses}L · {m.draws}D{m.reign > 0 ? ` · ⭐ ${m.reign} at High Noon` : ""}
      </p>
      {r.awards.map((a) => (
        <div key={a} class="award-chip">
          🏆 {a}
        </div>
      ))}
    </main>
  );
}
