import { useEffect, useRef, useState } from "preact/hooks";
import { CORRECT_PER_DECISION, TOWER_MAX_DAMAGE, type FightEvent, type FightShot, type HostView } from "../../shared/protocol.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import { Battlefield, HealthBar, ShotLayer } from "../shared/fight-art.tsx";
import { play } from "../shared/sounds.ts";
import { useCountdown } from "../shared/ui.tsx";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen, type Send } from "./common.tsx";
import { Award } from "./tower.tsx";

type FightView = Extract<HostView, { kind: "fight" }>;

const STATE_ICON = { question: "", decide: "🤔", aim: "🎯", watch: "🚀", repair: "🔨" } as const;
const HILL_NAME = { low: "Low hill", medium: "Medium hill", high: "High hill" } as const;

/** Projector screen for Tower Fight: countdown → live battlefield → collapse → podium. */
export function FightStage({ view, send }: { view: FightView; send: Send }) {
  const secs = useCountdown(view.phaseRemainingMs, view.phase);
  const prev = useRef<FightView | null>(null);

  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!p) return;
    if (view.phase !== p.phase) {
      if (view.phase === "playing") play("start");
      if (view.phase === "collapse") play("rumble");
      if (view.phase === "podium") play("fanfare");
    }
    const seen = new Set(p.shots.map((s) => s.id));
    if (view.shots.some((s) => !seen.has(s.id))) play("whoosh");
    const lastSeq = p.events.at(-1)?.seq ?? 0;
    if (view.events.some((e) => e.seq > lastSeq && e.kind === "rebuild")) play("floor");
  }, [view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onLand = (s: FightShot) => play(s.impact.kind === "tower" ? "roar" : s.impact.kind === "ground" ? "thud" : "bubble");
  const destroyed = view.teams.find((t) => t.damage >= TOWER_MAX_DAMAGE)?.index ?? null;
  // The first player aiming on each team sits in that team's catapult.
  const loaded = view.teams.map((t) => t.members.find((m) => m.state === "aim")?.avatar ?? null);

  return (
    <div class="stage">
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        <div class="pill">🏰 Tower Fight</div>
        <div class="pill">⛰ {HILL_NAME[view.hill]}</div>
        <div class="spacer" />
        <div class="pill">👥 {view.playerCount}</div>
        <ScreenControls />
        {view.phase !== "podium" && (
          <button class="btn ghost small" onClick={() => confirm("End the game now? The least damaged tower wins.") && send({ type: "host.end" })}>
            End game
          </button>
        )}
      </header>
      {view.phase === "podium" ? (
        <FightPodium view={view} send={send} />
      ) : (
        <main class={`fight-wrap ${view.phase === "collapse" ? "shake-long" : ""}`}>
          <Battlefield terrain={view.terrain} damage={view.teams.map((t) => t.damage)} colors={view.teams.map((t) => t.color)} loaded={loaded} repairing={view.teams.map((t) => t.repairing)} collapsing={view.phase === "collapse" ? destroyed : null}>
            <ShotLayer shots={view.shots} onLand={onLand} />
          </Battlefield>
          {view.teams.map((t) => (
            <section key={t.index} class={`fight-team side-${t.index}`} style={{ "--team": t.color }}>
              <h2>Team {t.name}</h2>
              <HealthBar damage={t.damage} color={t.color} />
              <ul>
                {t.members.map((m) => (
                  <li key={m.id} class={`${m.connected ? "" : "offline"} ${m.state !== "question" ? "busy" : ""}`}>
                    <Avatar choice={m.avatar} />
                    <span class="n">{m.nickname}</span>
                    {STATE_ICON[m.state] && <span aria-label={m.state}>{STATE_ICON[m.state]}</span>}
                    {m.hits > 0 && <span class="hits">💥{m.hits}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <EventFeed events={view.events} teams={view.teams} />
          {view.phase === "countdown" && (
            <div class="countdown-overlay">
              <div class="countdown-label">
                Answer questions on your phone. Every {CORRECT_PER_DECISION} correct answers: attack or rebuild!
              </div>
              <div class="countdown-num" key={secs}>
                {Math.max(1, secs)}
              </div>
            </div>
          )}
          {view.phase === "collapse" && destroyed !== null && (
            <div class="fight-banner" key="collapse">
              🏚 Team {view.teams[destroyed]!.name}'s tower has fallen!
            </div>
          )}
        </main>
      )}
    </div>
  );
}

function EventFeed({ events, teams }: { events: FightEvent[]; teams: FightView["teams"] }) {
  const text = (e: FightEvent) => {
    const enemy = teams[1 - e.team]?.name;
    switch (e.kind) {
      case "hit":
        return `💥 ${e.nickname} hit Team ${enemy}'s tower!`;
      case "friendly":
        return `😬 ${e.nickname} hit their own tower`;
      case "miss":
        return `💨 ${e.nickname} missed`;
      case "rebuild":
        return `🧱 ${e.nickname} repaired Team ${teams[e.team]?.name}'s tower`;
    }
  };
  return (
    <ol class="fight-feed" aria-live="polite">
      {events.slice(-4).map((e) => (
        <li key={e.seq} class={e.kind} style={{ "--team": teams[e.team]?.color }}>
          {text(e)}
        </li>
      ))}
    </ol>
  );
}

function FightPodium({ view, send }: { view: FightView; send: Send }) {
  const [showErrors, setShowErrors] = useState(false);
  const o = view.outcome;
  const winner = o && o.winner !== null ? view.teams[o.winner]! : null;
  const loser = winner ? view.teams[1 - winner.index]! : null;
  const reason = !o
    ? ""
    : o.reason === "destroyed"
      ? `They knocked down Team ${loser!.name}'s tower!`
      : o.reason === "damage"
        ? "Their tower took the least damage."
        : o.reason === "correct"
          ? "Equal damage, but they answered more questions correctly."
          : "Equal damage and equal correct answers.";
  const a = view.awards;
  return (
    <main class="podium tower-podium fight-podium">
      <div class="podium-bg" aria-hidden="true">
        <Battlefield terrain={view.terrain} damage={view.teams.map((t) => t.damage)} colors={view.teams.map((t) => t.color)} />
      </div>
      <h1 style={winner ? { background: winner.color, color: "#fff" } : undefined}>{winner ? `🏆 Team ${winner.name} wins!` : "🤝 It's a draw!"}</h1>
      {showErrors ? (
        <ErrorsTable errors={view.errors ?? []} />
      ) : (
        <>
          <p class="fight-reason">{reason}</p>
          <div class="fight-scores">
            {view.teams.map((t) => (
              <div key={t.index} class={`fight-score ${winner?.index === t.index ? "won" : ""}`} style={{ "--team": t.color }}>
                <div class="place-name">Team {t.name}</div>
                <HealthBar damage={t.damage} color={t.color} />
                <div class="fight-score-line">
                  {t.damage} damage · {t.correct} correct
                </div>
              </div>
            ))}
          </div>
          <div class="awards">
            <Award icon="🎯" title="Top gunner" award={a?.topGunner ?? null} unit="tower hits" />
            <Award icon="🧱" title="Master builder" award={a?.masterBuilder ?? null} unit="rebuilds" />
            <Award icon="✅" title="Most correct answers" award={a?.mostCorrect ?? null} unit="correct" />
          </div>
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
