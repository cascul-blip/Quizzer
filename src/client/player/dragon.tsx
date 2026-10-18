import { useEffect, useRef, useState } from "preact/hooks";
import { DRAGON_CHESTS, DRAGON_CHARM_CHESTS, type ClientMsg, type PlayerDragonView } from "../../shared/protocol.ts";
import { Chest, DragonHead, LOOT_LABEL, LootIcon, RuneShield } from "../shared/dragon-art.tsx";
import { PinDragger } from "../shared/pin.tsx";
import { LockedChoice, Shape, TextAnswer, formatClock, optionColor, ordinal, useCountdown } from "../shared/ui.tsx";
import { Feedback, StreamQuestion } from "./tower.tsx";

type Send = (m: ClientMsg) => void;

/** Phone screen for Dragon's Hoard: fight the dragon together, then open chests for your team. */
export function DragonPlayer({ view, send }: { view: PlayerDragonView; send: Send }) {
  const act1 = view.phase === "countdown" || view.phase === "battle" || view.phase === "fire";
  const onAnswer = (seq: number, option: number, text?: string) => send({ type: "dragon.answer", seq, option, text });

  let body;
  if (view.phase === "countdown") {
    body = <Countdown view={view} />;
  } else if (view.phase === "podium") {
    body = <DragonResult view={view} />;
  } else if (view.phase === "transition") {
    body = <TeamReveal view={view} />;
  } else if (view.state === "waiting") {
    body = (
      <main class="center dragon-wait">
        <div class="cup-emoji">🔥</div>
        <h1>The dragon is breathing fire!</h1>
        <p class="muted">Hold on, you'll join in as soon as it's over.</p>
      </main>
    );
  } else if (view.phase === "fire" && view.fire) {
    body = <RuneScreen view={view} send={send} />;
  } else if (view.state === "chest" && view.chest) {
    body = <ChestPicker view={view} send={send} />;
  } else if (view.state === "grab" && view.grab) {
    body = <GrabPicker view={view} send={send} />;
  } else if (view.state === "loot" && view.loot) {
    body = <LootScreen view={view} />;
  } else if (view.question) {
    body = <StreamQuestion question={view.question} onAnswer={onAnswer} />;
  } else {
    body = (
      <main class="center">
        <div class="spinner" />
      </main>
    );
  }

  return (
    <div class="game dragon-game" style={view.team ? { "--team": view.team.color } : undefined}>
      <header class="bar">
        <span class="name">{view.me.nickname}</span>
        {act1 ? (
          <span class={`dragon-phone-health stage-${view.stage}`} aria-label={`Dragon health ${view.healthPct}%`}>
            <DragonHead stage={view.stage} />
            <span class="dragon-phone-bar">
              <span style={{ width: `${view.healthPct}%` }} />
            </span>
            <b>{view.healthPct}%</b>
          </span>
        ) : (
          view.team && (
            <span class="dragon-team-gold">
              <span class="team-chip" style={{ background: view.team.color }}>
                {view.team.name}
              </span>
              💰 <b>{view.teamGold ?? 0}</b>
            </span>
          )
        )}
      </header>
      {view.me.charm > 0 && view.phase === "scramble" && <div class="dragon-charm-note">🍀 Next {view.me.charm} coin chest{view.me.charm === 1 ? "" : "s"} pay double</div>}
      {body}
      <Feedback feedback={view.feedback} rightText={act1 ? "⚔️ Hit!" : "Open a chest!"} />
      {view.feedback?.correct && act1 && <div class="sword-slash" key={view.feedback.seq} aria-hidden="true" />}
    </div>
  );
}

function Countdown({ view }: { view: PlayerDragonView }) {
  const secs = useCountdown(view.phaseRemainingMs, "countdown");
  return (
    <main class="center">
      <div class="cup-emoji">🐉</div>
      <p class="muted">Every right answer is a hit on the dragon. When it breathes fire, everyone gets the same question: get it right to raise the Shield of Faith!</p>
      <div class="tower-count">{Math.max(1, secs)}</div>
    </main>
  );
}

function RuneScreen({ view, send }: { view: PlayerDragonView; send: Send }) {
  const f = view.fire!;
  const secs = useCountdown(view.phaseRemainingMs, `fire${f.seq}-${f.step}`);
  const [pending, setPending] = useState<{ seq: number; option: number | null; text: string | null } | null>(null);
  useEffect(() => setPending(null), [f.seq]);
  useEffect(() => {
    if (f.step === "warning") navigator.vibrate?.([120, 60, 120]);
    if (f.step === "reveal") navigator.vibrate?.(f.result?.held ? 60 : [200, 80, 200]);
  }, [f.seq, f.step]);

  if (f.step === "warning") {
    return (
      <main class="center dragon-warn">
        <RuneShield class="raised" />
        <h1>The dragon is about to breathe fire!</h1>
        <p>Raise the Shield of Faith!</p>
      </main>
    );
  }
  const q = f.question!;
  if (f.step === "reveal" && f.result) {
    const r = f.result;
    return (
      <main class={`result dragon-rune-result ${r.wasCorrect ? "good" : "bad"}`}>
        <div class="verdict">
          <div class="verdict-icon">{r.wasCorrect ? "✓" : "✗"}</div>
          <h1>{r.wasCorrect ? "Correct!" : f.myChoice === null && f.myText === null ? "Time's up!" : "Wrong"}</h1>
        </div>
        <p class="q-text small-q">{q.text}</p>
        <div class="flash-answer rune-answer">
          <span>Correct answer{r.answers.length > 1 ? "s" : ""}:</span>
          <b>{r.answers.join(" / ")}</b>
        </div>
        <div class={`rune-outcome ${r.held ? "held" : "broken"}`}>
          <RuneShield class={r.held ? "held" : "broken"} />
          <h2>{r.held ? "🛡 Shield held!" : "🔥 The fire got through!"}</h2>
          <p class="muted">
            {r.right} got it right, {r.needed} needed
          </p>
        </div>
      </main>
    );
  }
  const chosen = f.myChoice ?? (pending?.seq === f.seq ? pending.option : null);
  const typed = f.myText ?? (pending?.seq === f.seq ? pending.text : null);
  if (chosen !== null || typed !== null) {
    return (
      <main class="center">
        {typed !== null ? <div class="locked-text">{typed}</div> : <LockedChoice type={q.type} index={chosen!} label={q.options[chosen!] ?? ""} />}
        <h1>Shield of Faith locked in</h1>
        <p class="muted">Waiting for the others…</p>
      </main>
    );
  }
  const answer = (option: number, text?: string) => {
    navigator.vibrate?.(30);
    setPending({ seq: f.seq, option: text === undefined ? option : null, text: text ?? null });
    send({ type: "dragon.answer", seq: f.seq, option, text, rune: true });
  };
  const head = (
    <div class="q-head">
      <div class={`timer ${secs <= 5 ? "urgent" : ""}`}>{secs}</div>
      <h2 class="q-text">
        <span class="rune-tag">Shield of Faith</span> {q.text}
      </h2>
    </div>
  );
  if (q.type === "pin" && q.image && q.spots) {
    return (
      <main class="answering rune-answering">
        {head}
        <PinDragger key={f.seq} image={q.image} spots={q.spots} labels={q.options} onSubmit={(i) => answer(i)} />
      </main>
    );
  }
  return (
    <main class="answering rune-answering">
      {head}
      {q.image && <img class="q-img" src={`/${q.image}`} alt="" />}
      {q.type === "text" ? (
        <TextAnswer onSubmit={(text) => answer(0, text)} />
      ) : (
        <div class={`answers n${q.options.length}`}>
          {q.options.map((text, i) => {
            const c = optionColor(q.type, i);
            return (
              <button key={`${f.seq}-${i}`} class={`answer opt-${c}`} onClick={() => answer(i)}>
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

function TeamReveal({ view }: { view: PlayerDragonView }) {
  useEffect(() => void navigator.vibrate?.([80, 40, 80]), []);
  return (
    <main class="center dragon-team-reveal" style={{ background: view.team?.color }}>
      <p>{view.slain ? "⚔️ The dragon is slain!" : "🐉 The dragon flew away with half its hoard!"}</p>
      <h1>You're on Team {view.team?.name}!</h1>
      <p>Grab as much gold as you can. Every right answer opens a chest.</p>
    </main>
  );
}

function ChestPicker({ view, send }: { view: PlayerDragonView; send: Send }) {
  const c = view.chest!;
  const secs = useCountdown(c.remainingMs, `chest${c.seq}`);
  const [picked, setPicked] = useState<{ seq: number; chest: number } | null>(null);
  const mine = picked?.seq === c.seq ? picked.chest : null;
  return (
    <main class="center dragon-chests">
      <h1>Pick a chest!</h1>
      <p class="muted">{secs}s, or one opens by itself</p>
      <div class="chest-row">
        {Array.from({ length: DRAGON_CHESTS }, (_, i) => (
          <button
            key={i}
            class={`chest-btn ${mine === i ? "chosen" : ""}`}
            disabled={mine !== null}
            aria-label={`Chest ${i + 1}`}
            onClick={() => {
              navigator.vibrate?.(30);
              setPicked({ seq: c.seq, chest: i });
              send({ type: "dragon.chest", chest: i });
            }}
          >
            <Chest open={mine === i} />
          </button>
        ))}
      </div>
    </main>
  );
}

function GrabPicker({ view, send }: { view: PlayerDragonView; send: Send }) {
  const g = view.grab!;
  const secs = useCountdown(g.remainingMs, `grab${g.seq}`);
  // Re-render while a team's protection runs out.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [g.seq]);
  // protectedMs counts from when this grab view arrived.
  const arrived = useRef<{ g: typeof g | null; at: number }>({ g: null, at: 0 });
  if (arrived.current.g !== g) arrived.current = { g, at: performance.now() };
  const sentAt = arrived.current.at;
  return (
    <main class="center dragon-grab">
      <LootIcon kind={g.share >= 0.25 ? "grab25" : "grab10"} class="big" />
      <h1>Grab {Math.round(g.share * 100)}%!</h1>
      <p class="muted">Pick a team to steal from · {secs}s, or the richest is picked</p>
      <ul class="grab-list">
        {g.teams.map((t) => {
          const guarded = t.protectedMs - (performance.now() - sentAt) > 0;
          const empty = t.gold <= 0;
          return (
            <li key={t.index}>
              <button
                class="grab-team"
                style={{ "--team": t.color }}
                disabled={empty || guarded}
                onClick={() => {
                  navigator.vibrate?.(30);
                  send({ type: "dragon.grab", team: t.index });
                }}
              >
                <span class="team-chip" style={{ background: t.color }}>
                  Team {t.name}
                </span>
                <span class="grab-gold">💰 {t.gold}</span>
                {empty ? <span class="grab-note">no gold</span> : guarded ? <span class="grab-note">just grabbed, wait…</span> : <span class="grab-take">take {Math.max(1, Math.round(t.gold * g.share))}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function LootScreen({ view }: { view: PlayerDragonView }) {
  const l = view.loot!;
  useEffect(() => {
    navigator.vibrate?.(l.kind === "trap" || l.blocked ? [150, 60, 150] : l.kind === "jackpot" ? [80, 40, 80, 40, 200] : 50);
  }, [l.seq]);
  let title = LOOT_LABEL[l.kind];
  let detail = "";
  let mood = "good";
  switch (l.kind) {
    case "coins":
    case "bigPile":
      title = `+${l.gold} gold!`;
      detail = `${LOOT_LABEL[l.kind]}${l.doubled ? ", doubled by your lucky charm" : ""}${view.escaped ? " (half: the dragon escaped)" : ""}`;
      break;
    case "charm":
      detail = `Your next ${DRAGON_CHARM_CHESTS} coin chests pay double`;
      break;
    case "grab10":
    case "grab25":
      if (l.asCoins) {
        title = `+${l.gold} gold!`;
        detail = "No team to grab from, so it paid as Coins";
      } else if (l.blocked) {
        title = "Blocked by a dragon scale!";
        detail = `Team ${l.target?.name} was protected`;
        mood = "bad";
      } else {
        title = `+${l.gold} gold!`;
        detail = `Grabbed from Team ${l.target?.name}`;
      }
      break;
    case "trap":
      title = l.gold > 0 ? `−${l.gold} gold` : "A puff of smoke";
      detail = "The dragon's last breath! Your team's gold went into the Jackpot";
      mood = "bad";
      break;
    case "scale":
      detail = "It blocks the next grab against your team";
      break;
    case "bats":
      title = "Bats!";
      detail = "Nothing in this one";
      mood = "meh";
      break;
    case "jackpot":
      title = `JACKPOT! +${l.gold} gold`;
      detail = "Your team wins the whole Jackpot pile";
      break;
  }
  return (
    <main class={`center dragon-loot ${mood} ${l.kind}`}>
      <Chest open class="loot-chest" />
      <LootIcon kind={l.blocked ? "scale" : l.kind} class="big" />
      <h1>{title}</h1>
      <p class="muted">{detail}</p>
    </main>
  );
}

function DragonResult({ view }: { view: PlayerDragonView }) {
  const r = view.result;
  if (!r) return null;
  const solo = r.teamCount === 1;
  return (
    <main class="center">
      <div class="cup-emoji">{r.won && !solo ? "🏆" : "💰"}</div>
      {!solo && (
        <div class={`final-rank ${r.won ? "top" : ""}`} style={{ color: view.team?.color }}>
          {r.won ? `Team ${view.team?.name} wins!` : `Team ${view.team?.name}: ${ordinal(r.teamRank)} of ${r.teamCount}`}
        </div>
      )}
      <p class="big-score">{r.teamGold} gold</p>
      <p class="muted">{r.slain && r.slainMs !== null ? `⚔️ The class slew the dragon in ${formatClock(Math.round(r.slainMs / 1000))}!` : "🐉 The dragon escaped."}</p>
      <p class="muted">
        {view.me.hits} hit{view.me.hits === 1 ? "" : "s"} on the dragon · {view.me.correct} correct
      </p>
      {r.awards.map((a) => (
        <div key={a} class="award-chip">
          🏆 {a}
        </div>
      ))}
    </main>
  );
}
