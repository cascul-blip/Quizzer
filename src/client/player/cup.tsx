import { useEffect, useRef, useState } from "preact/hooks";
import { type ClientMsg, type PlayerCupView } from "../../shared/protocol.ts";
import { CupArt, Die, RollingDie, RocketHead } from "../shared/cup-art.tsx";
import { cupTheme } from "../../shared/cup-theme.ts";
import { CupThemeProvider, useChristmasCup } from "../shared/cup-skin.tsx";
import { ordinal, useCountdown } from "../shared/ui.tsx";
import { Feedback, StreamQuestion } from "./tower.tsx";

type Send = (m: ClientMsg) => void;

/** The die tumbling; the target only appears once it lands so the text doesn't give it away. */
function RollScreen({ round, target, rollMs }: { round: number; target: number; rollMs: number }) {
  const [landed, setLanded] = useState(rollMs <= 0);
  return (
    <main class="center cup-roll">
      <p class="muted">Round {round}</p>
      <RollingDie value={target} rollMs={rollMs} class="big-die" onLand={() => setLanded(true)} />
      <h2 class="cup-roll-text" style={{ visibility: landed ? "visible" : "hidden" }}>
        Get <b>{target}</b> right!
      </h2>
    </main>
  );
}

/** Phone screen for Cup of Death: roll, answer, and (if you fall short) pick a cup. */
export function CupPlayer({ view, send }: { view: PlayerCupView; send: Send }) {
  return <CupThemeProvider value={cupTheme(view.theme)}><CupPlayerContent view={view} send={send} /></CupThemeProvider>;
}

function CupPlayerContent({ view, send }: { view: PlayerCupView; send: Send }) {
  const christmas = useChristmasCup();
  const secs = useCountdown(view.phaseRemainingMs, `${view.phase}-${view.round}`);
  const me = view.me;
  const onAnswer = (seq: number, option: number, text?: string) => send({ type: "cup.answer", seq, option, text });

  let body;
  if (view.phase === "countdown") {
    body = (
      <main class="center">
        <div class="cup-emoji">{christmas ? "☕" : "🤠"}</div>
        <h1>{christmas ? "Cup of Cheer" : "Cup of Death"}</h1>
        <p class="muted">{christmas ? "Roll the die and answer that many questions before time runs out. Fall short and sip some cocoa. One cup is supercharged: shake, sparkle and blast off!" : "Roll the die, then answer that many questions right before time runs out. Fall short and you'll have to drink. One cup is poisoned!"}</p>
        <div class="tower-count">{Math.max(1, secs)}</div>
      </main>
    );
  } else if (view.phase === "podium") {
    body = <CupResult view={view} />;
  } else if (me.out && !(view.phase === "reveal" && view.myDrink?.turn)) {
    body = <GhostScreen view={view} onAnswer={onAnswer} />;
  } else if (view.phase === "roll") {
    body = <RollScreen key={view.round} round={view.round} target={me.target} rollMs={Math.max(0, view.phaseRemainingMs - 850)} />;
  } else if (view.phase === "quiz") {
    body = me.safe ? (
      <main class="center cup-safe">
        <div class="cup-emoji">😅</div>
        <h1>Safe!</h1>
        <p class="muted">You don't have to drink this round. Wait for the others…</p>
      </main>
    ) : view.question ? (
      <StreamQuestion question={view.question} onAnswer={onAnswer} />
    ) : (
      <main class="center">
        <div class="spinner" />
      </main>
    );
  } else if (view.phase === "drink") {
    body = view.drink ? (
      <CupPicker view={view} secs={secs} send={send} />
    ) : (
      <main class="center cup-safe">
        <div class="cup-emoji">😎</div>
        <h1>You're safe</h1>
        <p class="muted">{christmas ? "Watch the others pick their cocoa…" : "Watch the others pick their poison…"}</p>
      </main>
    );
  } else {
    body = <RevealScreen view={view} />;
  }

  const timed = (view.phase === "quiz" && !me.safe && !me.out) || (view.phase === "drink" && !!view.drink);
  return (
    <div class={`game cup-game ${christmas ? "cup-christmas" : ""} ${me.out ? "ghost" : ""}`}>
      <header class="bar">
        <span class="name">{me.nickname}</span>
        {me.out ? (
          <span class="robot-out-tag">{christmas ? "🚀 In orbit" : "☠ Ghost"}</span>
        ) : (
          <span class="cup-stats">
            {view.phase === "quiz" && me.target > 0 && (
              <span class={`cup-need ${me.safe ? "done" : ""}`}>
                <Die value={me.target} class="mini-die" /> {me.progress}/{me.target}
              </span>
            )}
            <CupIcons count={me.cups} of={view.startCups} />
          </span>
        )}
      </header>
      {timed && <PhoneBar view={view} />}
      {body}
      <Feedback feedback={view.feedback} rightText={me.out ? "Correct!" : me.safe ? "Safe! 😅" : `${me.progress}/${me.target}`} />
    </div>
  );
}

function CupIcons({ count, of }: { count: number; of: number }) {
  const christmas = useChristmasCup();
  return (
    <span class="cup-icons" aria-label={`${count} cups left`}>
      {Array.from({ length: of }, (_, i) => (
        <i key={i} class={i < count ? "full" : ""}>
          {christmas ? "☕" : "🥃"}
        </i>
      ))}
    </span>
  );
}

/** The red bar draining under the header while the clock runs. */
function PhoneBar({ view }: { view: PlayerCupView }) {
  const key = `${view.phase}-${view.round}`;
  const start = useRef<{ key: string; elapsed: number } | null>(null);
  if (!start.current || start.current.key !== key) start.current = { key, elapsed: Math.max(0, view.phaseDurationMs - view.phaseRemainingMs) };
  return (
    <div class="cup-phone-bar">
      <div key={key} class="cup-phone-bar-fill" style={{ animationDuration: `${view.phaseDurationMs}ms`, animationDelay: `-${start.current.elapsed}ms` }} />
    </div>
  );
}

function CupPicker({ view, secs, send }: { view: PlayerCupView; secs: number; send: Send }) {
  const christmas = useChristmasCup();
  const picked = view.drink?.picked ?? null;
  const count = view.me.cups;
  const forced = count <= 1;
  return (
    <main class="cup-pick">
      <h1>{forced ? "Your last cup…" : picked === null ? "Pick a cup!" : "Bottoms up soon…"}</h1>
      <p class="muted">
        {forced ? christmas ? "Supercharged cocoa. Get ready for liftoff!" : "No choice left. Drink up, partner." : picked === null ? `One of these is ${christmas ? "supercharged" : "poisoned"}. ${secs}s left, or one gets picked for you.` : "Waiting for the others to choose…"}
      </p>
      <div class={`cup-row n${count}`}>
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            class={`cup-btn ${picked === i ? "chosen" : ""} ${picked !== null && picked !== i ? "faded" : ""}`}
            disabled={picked !== null || forced}
            aria-label={`Cup ${i + 1}`}
            onClick={() => {
              navigator.vibrate?.(30);
              send({ type: "cup.pick", cup: i });
            }}
          >
            <CupArt />
          </button>
        ))}
      </div>
    </main>
  );
}

function RevealScreen({ view }: { view: PlayerCupView }) {
  const christmas = useChristmasCup();
  const d = view.myDrink;
  const seen = useRef("");
  useEffect(() => {
    if (!d?.verdict) return;
    const k = `${d.seq}-${d.verdict}`;
    if (seen.current === k) return;
    seen.current = k;
    navigator.vibrate?.(d.verdict === "poison" ? [400, 120, 400, 120, 600] : [60, 40, 60]);
  }, [d?.seq, d?.verdict]);
  if (!d) {
    return (
      <main class="center cup-safe">
        <div class="cup-emoji">🍻</div>
        <h1>{view.phase === "reveal" ? "Watch the table!" : "…"}</h1>
        <p class="muted">{view.alive} {christmas ? "still in the workshop" : "still alive"}</p>
      </main>
    );
  }
  if (d.verdict === "poison") {
    return (
      <main class={`center cup-verdict ${christmas ? "cheer-blastoff" : "poison"}`}>
        {christmas ? <svg key={d.seq} class="cheer-phone-launch" viewBox="-80 -100 160 220" aria-label="Your avatar shakes with energy and blasts off with sparkles"><RocketHead choice={view.me.avatar} /></svg> : <div class="cup-emoji">☠️</div>}
        <h1>{christmas ? "Blast off!" : "Poisoned!"}</h1>
        <p class="muted">You're out, but you can keep answering questions to learn.</p>
      </main>
    );
  }
  if (d.verdict === "safe") {
    return (
      <main class="center cup-verdict safe">
        <div class="cup-emoji">😮‍💨</div>
        <h1>{christmas ? "Cozy cocoa!" : "You survived!"}</h1>
        <p class="muted">{view.me.cups === 1 ? "Only 1 cup left. Don't miss again!" : `${view.me.cups} cups left.`}</p>
      </main>
    );
  }
  return (
    <main class={`center cup-drinking ${d.turn ? "turn" : ""}`}>
      <CupArt class={d.turn ? "sipping" : ""} />
      <h1>{d.turn ? "Gulp…" : "Waiting your turn…"}</h1>
      <p class="muted">{d.cupsBefore === 1 ? "Your last cup." : `1 in ${d.cupsBefore} chance it's ${christmas ? "supercharged" : "poisoned"}.`}</p>
    </main>
  );
}

/** Poisoned players keep answering to practise. */
function GhostScreen({ view, onAnswer }: { view: PlayerCupView; onAnswer: (seq: number, option: number, text?: string) => void }) {
  const christmas = useChristmasCup();
  return (
    <>
      <div class="ghost-note">{christmas ? "🚀 You're in orbit! Keep answering to learn." : "👻 You're a ghost. Keep answering to learn!"}</div>
      {view.question ? (
        <StreamQuestion question={view.question} onAnswer={onAnswer} />
      ) : (
        <main class="center">
          <div class="spinner" />
        </main>
      )}
    </>
  );
}

function CupResult({ view }: { view: PlayerCupView }) {
  const christmas = useChristmasCup();
  const r = view.result;
  if (!r) return null;
  return (
    <main class="center">
      <div class="cup-emoji">{r.won ? christmas ? "🎄" : "🤠" : christmas ? "🚀" : "☠️"}</div>
      <div class={`final-rank ${r.won ? "top" : ""}`}>{r.won ? "You win!" : `${ordinal(r.rank)} of ${r.playerCount}`}</div>
      <p class="muted">{r.outRound === null ? (r.won ? christmas ? "Last one in Santa's workshop!" : "Last one standing in the saloon!" : "You survived to the end.") : r.won ? `${christmas ? "Blasted off" : "Poisoned"} in round ${r.outRound}, along with everyone else left. Shared win!` : `${christmas ? "Blasted off" : "Poisoned"} in round ${r.outRound}.`}</p>
      <p class="big-score">{view.me.correct} correct</p>
      {r.awards.map((a) => (
        <div key={a} class="award-chip">
          🏆 {a}
        </div>
      ))}
    </main>
  );
}
