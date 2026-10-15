import { useEffect, useRef, useState } from "preact/hooks";
import { CUP_CUPS, type HostView } from "../../shared/protocol.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import { SaloonScene, TABLE_CENTER, type SaloonMode } from "../shared/cup-art.tsx";
import { play } from "../shared/sounds.ts";
import { ordinal, useCountdown } from "../shared/ui.tsx";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen, type Send } from "./common.tsx";
import { Award } from "./tower.tsx";

type CupView = Extract<HostView, { kind: "cup" }>;

/** Projector screen for Cup of Death: countdown → (roll → quiz → drink → reveal)… → podium. */
export function CupStage({ view, send }: { view: CupView; send: Send }) {
  const secs = useCountdown(view.phaseRemainingMs, `${view.phase}-${view.round}`);
  const prev = useRef<CupView | null>(null);

  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!p) return;
    if (view.phase !== p.phase) {
      if (view.phase === "roll") play(view.round === 1 ? "gunshot" : "diceRoll");
      if (view.phase === "quiz") play("diceLand");
      if (view.phase === "drink") play("timeUp");
      if (view.phase === "reveal" && view.reveal?.drinks.length === 0) play("survive");
      if (view.phase === "podium") play("fanfare");
    }
    if (view.phase === "roll" && p.phase !== "roll" && view.round === 1) setTimeout(() => play("diceRoll"), 400);
    // Someone just made it to safety.
    const safeBefore = new Set(p.players.filter((x) => x.safe).map((x) => x.id));
    if (view.phase === "quiz" && view.players.some((x) => x.safe && !safeBefore.has(x.id))) play("floor");
    if (view.phase === "drink" && view.players.filter((x) => x.picked).length > p.players.filter((x) => x.picked).length) play("clink");
    // The reveal, one drinker at a time: a gulp, then the verdict.
    const r = view.reveal;
    const pr = p.reveal;
    if (r && r.drinks.length > 0) {
      if (r.current >= 0 && (pr?.seq !== r.seq || pr.current !== r.current)) play("gulp");
      const d = r.drinks[r.current];
      const before = pr?.seq === r.seq ? pr.drinks[r.current]?.verdict : null;
      if (d?.verdict && !before) play(d.verdict === "poison" ? "poison" : "survive");
    }
  }, [view]);

  // The last seconds of the quiz and of picking tick down.
  useEffect(() => {
    if ((view.phase === "quiz" || view.phase === "drink") && secs > 0 && secs <= 3) play("tick");
  }, [secs, view.phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const alive = view.players.filter((p) => !p.out);
  const r = view.phase === "reveal" ? view.reveal : null;
  // Players poisoned in this reveal stay at the table until it's over, so they can fall.
  const dying = new Set(r?.drinks.filter((d) => d.verdict === "poison").map((d) => d.id) ?? []);
  const seated = view.players.filter((p) => !p.out || dying.has(p.id));
  const mode: SaloonMode = view.phase === "countdown" || view.phase === "podium" ? "idle" : view.phase;

  return (
    <div class="stage cup-stage">
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        <div class="pill">☠️ Cup of Death</div>
        {view.round > 0 && <div class="pill">Round {view.round}</div>}
        <div class="spacer" />
        <div class="pill">
          🤠 {alive.length} / {view.playerCount}
        </div>
        <ScreenControls join={view.join} />
        {view.phase !== "podium" && (
          <button class="btn ghost small" onClick={() => confirm("End the game now? Everyone still alive shares the win.") && send({ type: "host.end" })}>
            End game
          </button>
        )}
      </header>
      {view.phase === "podium" ? (
        <CupPodium view={view} send={send} />
      ) : (
        <>
          <TimerBar view={view} secs={secs} />
          <main class="cup-wrap">
            <SaloonScene players={seated} mode={mode} drinks={r?.drinks ?? []} current={r?.current ?? -1} rollKey={`r${view.round}`}>
              <TableText view={view} secs={secs} />
            </SaloonScene>
            {view.phase === "countdown" && (
              <div class="countdown-overlay cup-countdown">
                <div class="countdown-label">
                  Each round, roll the die and answer that many questions right before time runs out.
                  <br />
                  Fall short, and you drink one of your {CUP_CUPS} cups. One of them is poisoned.
                  <br />
                  Every cup you survive is one fewer to choose from. Last one standing wins!
                </div>
                <div class="countdown-num" key={secs}>
                  {Math.max(1, secs)}
                </div>
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}

/** What's written on the table: the phase, or the drinker in the spotlight and their fate. */
function TableText({ view, secs }: { view: CupView; secs: number }) {
  const { x, y } = TABLE_CENTER;
  let big = "";
  let small = "";
  let cls = "";
  if (view.phase === "roll") {
    big = "🎲 Roll!";
    small = "Get that many right to stay safe";
  } else if (view.phase === "quiz") {
    const left = view.players.filter((p) => !p.out && !p.safe).length;
    big = String(secs);
    small = left === 0 ? "Everyone's safe!" : `${left} still answering`;
    cls = secs <= 5 ? "urgent" : "";
  } else if (view.phase === "drink") {
    const drinkers = view.players.filter((p) => p.drinker);
    big = "Pick your poison";
    small = `${drinkers.filter((p) => p.picked).length} of ${drinkers.length} picked · ${secs}s`;
  } else if (view.phase === "reveal" && view.reveal) {
    const r = view.reveal;
    const d = r.drinks[r.current];
    if (r.drinks.length === 0) {
      big = "😅 Nobody drinks!";
      small = "Everyone made it this round";
      cls = "good";
    } else if (d) {
      const name = view.players.find((p) => p.id === d.id)?.nickname ?? "?";
      big = d.verdict === "poison" ? "☠ POISONED!" : d.verdict === "safe" ? "Survived!" : `${name} drinks…`;
      small = d.verdict === null ? `${d.cupsBefore === 1 ? "The last cup…" : `1 in ${d.cupsBefore} chance`}` : name;
      cls = d.verdict === "poison" ? "bad" : d.verdict === "safe" ? "good" : "suspense";
    }
  }
  if (!big) return null;
  return (
    <g class={`table-text ${cls}`} key={`${view.phase}-${big}`}>
      <text x={x} y={y + 8} text-anchor="middle" class="table-big">
        {big}
      </text>
      <text x={x} y={y + 58} text-anchor="middle" class="table-small">
        {small}
      </text>
    </g>
  );
}

/** The red bar across the top drains over each phase, with what to do right now. */
function TimerBar({ view, secs }: { view: CupView; secs: number }) {
  // Catch up once, when the phase starts (see Robot Attack's PhaseBar).
  const key = `${view.phase}-${view.round}`;
  const start = useRef<{ key: string; elapsed: number } | null>(null);
  if (!start.current || start.current.key !== key) start.current = { key, elapsed: Math.max(0, view.phaseDurationMs - view.phaseRemainingMs) };
  const timed = view.phase === "quiz" || view.phase === "drink";
  const label =
    view.phase === "countdown"
      ? "Get ready…"
      : view.phase === "roll"
        ? "🎲 Rolling the dice…"
        : view.phase === "quiz"
          ? `Answer your dice number of questions! · ${secs}s`
          : view.phase === "drink"
            ? `☠ Choose a cup! · ${secs}s`
            : "Bottoms up…";
  return (
    <div class={`robot-bar cup-bar ${view.phase} ${timed && secs <= 5 ? "warn" : ""}`}>
      {timed && <div key={key} class="robot-bar-fill" style={{ animationDuration: `${view.phaseDurationMs}ms`, animationDelay: `-${start.current.elapsed}ms` }} />}
      <div class="robot-bar-label">{label}</div>
    </div>
  );
}

function Cups({ count }: { count: number }) {
  return (
    <span class="cup-count" aria-label={`${count} cups left`}>
      {Array.from({ length: CUP_CUPS }, (_, i) => (
        <i key={i} class={i < count ? "full" : ""}>
          🥃
        </i>
      ))}
    </span>
  );
}

function CupPodium({ view, send }: { view: CupView; send: Send }) {
  const [showErrors, setShowErrors] = useState(false);
  const standings = view.standings ?? [];
  const winners = standings.filter((s) => s.rank === 1);
  const a = view.awards;
  const title =
    winners.length === 0
      ? "Game over"
      : winners.length === 1
        ? `🤠 ${winners[0]!.nickname} wins!`
        : winners.length <= 3
          ? `🤠 ${winners.map((w) => w.nickname).join(" & ")} win!`
          : `🤠 ${winners.length} gunslingers share the win!`;
  return (
    <main class="podium tower-podium cup-podium">
      <div class="podium-bg" aria-hidden="true">
        <SaloonScene players={[]} mode="idle" />
      </div>
      <h1>{title}</h1>
      {showErrors ? (
        <ErrorsTable errors={view.errors ?? []} />
      ) : (
        <>
          <ol class="robot-standings">
            {standings.slice(0, Math.max(5, Math.min(winners.length, 6))).map((s, i) => (
              <li key={s.id} class={s.rank === 1 ? "won" : ""} style={{ animationDelay: `${i * 80}ms` }}>
                <span class="lb-rank">{ordinal(s.rank)}</span>
                <Avatar choice={s.avatar} />
                <span class="lb-name">{s.nickname}</span>
                <span class="robot-status">{s.outRound === null ? <Cups count={s.cups} /> : `☠ Poisoned in round ${s.outRound}`}</span>
              </li>
            ))}
          </ol>
          <div class="awards cup-awards">
            <Award icon="✅" title="Most correct answers" award={a?.mostCorrect ?? null} unit="correct" />
            <Award icon="🍀" title="Luckiest drinker" award={a?.luckiest ?? null} unit="" valueText={(n) => `${n} drink${n === 1 ? "" : "s"} survived`} />
            <Award icon="🛡" title="Never thirsty" award={a?.neverThirsty ?? null} unit="" valueText={(n) => `${n} round${n === 1 ? "" : "s"} safe`} />
            <Award icon="⚰️" title="Unluckiest" award={a?.unluckiest ?? null} unit="" valueText={(round) => `poisoned by their first cup in round ${round}`} />
          </div>
        </>
      )}
      <p class="cup-credits">
        Idea by <b>Malachi</b> · Design by <b>Brooke</b>
      </p>
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
