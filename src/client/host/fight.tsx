import { useEffect, useRef, useState } from "preact/hooks";
import type { FightEvent, FightShot, HillSetting } from "../../shared/modes/fight.ts";
import { CORRECT_PER_DECISION, FIGHT_MAX_DAMAGE, fightShared, HILL_SETTINGS } from "../../shared/modes/fight.ts";
import type { HostView } from "../../shared/protocol.ts";
import type { SeasonTheme } from "../../shared/themed-modes.ts";
import { modeTheme, themedLabel, themedTrack } from "../../shared/themed-modes.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import { Battlefield, HealthBar, ShotLayer } from "../shared/fight-art.tsx";
import { FightThemeProvider } from "../shared/fight-skin.tsx";
import type { MusicCue } from "../shared/music/index.ts";
import { play } from "../shared/sounds.ts";
import { teamInk, teamVars, useCountdown } from "../shared/ui.tsx";
import type { Send } from "./common.tsx";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen } from "./common.tsx";
import type { LobbyModeEntry, LobbySettingsProps } from "./lobby-modes.tsx";
import { Award } from "./tower.tsx";

type FightView = Extract<HostView, { kind: "fight" }>;

const STATE_ICON = { question: "", decide: "🤔", aim: "🎯", watch: "🚀", repair: "🔨" } as const;
const HILL_NAME = { low: "Low hill", medium: "Medium hill", high: "High hill" } as const;

/** Projector screen for Tower Fight: countdown → live battlefield → collapse → podium. */
export function FightStage(props: { view: FightView; send: Send }) {
  return (
    <FightThemeProvider theme={props.view.theme}>
      <FightStageContent {...props} />
    </FightThemeProvider>
  );
}

function FightStageContent({ view, send }: { view: FightView; send: Send }) {
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
  const destroyed = view.teams.find((t) => t.damage >= FIGHT_MAX_DAMAGE)?.index ?? null;
  // The first player aiming on each team sits in that team's catapult.
  const loaded = view.teams.map((t) => t.members.find((m) => m.state === "aim")?.avatar ?? null);

  return (
    <div class="stage fight-stage" data-theme={view.theme ?? "classic"}>
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        <div class="pill">{themedLabel("fight", view.theme)}</div>
        <div class="pill">⛰ {HILL_NAME[view.hill]}</div>
        <div class="spacer" />
        <div class="pill">👥 {view.playerCount}</div>
        <ScreenControls join={view.join} />
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
          <Battlefield
            hill={view.hill}
            shots={view.shots}
            terrain={view.terrain}
            damage={view.teams.map((t) => t.damage)}
            colors={view.teams.map((t) => t.color)}
            loaded={loaded}
            repairing={view.teams.map((t) => t.repairing)}
            collapsing={view.phase === "collapse" ? destroyed : null}
          >
            <ShotLayer shots={view.shots} onLand={onLand} />
          </Battlefield>
          {view.teams.map((t) => (
            <section key={t.index} class={`fight-team side-${t.index}`} style={teamVars(t.color)}>
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
              <div class="countdown-label">Answer questions on your phone. Every {CORRECT_PER_DECISION} correct answers: attack or rebuild!</div>
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
        <li key={e.seq} class={e.kind} style={teamVars(teams[e.team]?.color)}>
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
        <Battlefield
          hill={view.hill}
          shots={view.shots}
          terrain={view.terrain}
          damage={view.teams.map((t) => t.damage)}
          colors={view.teams.map((t) => t.color)}
        />
      </div>
      <h1 style={winner ? { background: winner.color, color: teamInk(winner.color) } : undefined}>
        {winner ? `🏆 Team ${winner.name} wins!` : "🤝 It's a draw!"}
      </h1>
      {showErrors ? (
        <ErrorsTable errors={view.errors ?? []} />
      ) : (
        <>
          <p class="fight-reason">{reason}</p>
          <div class="fight-scores">
            {view.teams.map((t) => (
              <div key={t.index} class={`fight-score ${winner?.index === t.index ? "won" : ""}`} style={teamVars(t.color)}>
                <div class="place-name">Team {t.name}</div>
                <HealthBar damage={t.damage} color={t.color} />
                <div class="fight-score-line">
                  {t.damage} damage · {t.correct} correct
                </div>
              </div>
            ))}
          </div>
          <div class="awards">
            <Award icon="🎯" title={fightShared.awards.topGunner} award={a?.topGunner ?? null} unit="tower hits" />
            <Award icon="🧱" title={fightShared.awards.masterBuilder} award={a?.masterBuilder ?? null} unit="rebuilds" />
            <Award icon="✅" title={fightShared.awards.mostCorrect} award={a?.mostCorrect ?? null} unit="correct" />
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

const HILL_LABELS: Record<HillSetting, string> = { random: "🎲 Random", low: "Low", medium: "Medium", high: "High" };

function FightSettings({ settings, send }: LobbySettingsProps<"fight">) {
  return (
    <>
      <label class="opt">
        Theme
        <select
          aria-label="Tower Fight theme"
          value={modeTheme("fight", settings.theme)}
          // checked: the select only offers the season themes, and the server refuses any other (pickTheme)
          onChange={(e) => send({ type: "host.setModeSettings", mode: "fight", settings: { theme: e.currentTarget.value as SeasonTheme } })}
        >
          <option value="classic">🏰 Normal</option>
          <option value="christmas">🎄 Gingerbread Siege</option>
        </select>
      </label>
      <label class="opt">
        Hill
        <select
          value={settings.hill}
          onChange={(e) => send({ type: "host.setModeSettings", mode: "fight", settings: { hill: e.currentTarget.value as HillSetting } })}
        >
          {HILL_SETTINGS.map((h) => (
            <option key={h} value={h}>
              {HILL_LABELS[h]}
            </option>
          ))}
        </select>
      </label>
      <span class="opt mode-hint">Red vs Blue: knock down the other team's tower. The game runs until a tower falls or you end it.</span>
    </>
  );
}

export function fightCue(view: FightView): MusicCue {
  if (view.phase === "podium") return { track: themedTrack("fight", view.theme, "results") };
  const worst = Math.max(0, ...view.teams.map((t) => t.damage)) / FIGHT_MAX_DAMAGE;
  return { track: themedTrack("fight", view.theme, "play"), intensity: Math.max(0, Math.min(1, 0.15 + worst * 0.85)) };
}

export const fightLobby: LobbyModeEntry<"fight"> = {
  label: (settings) => themedLabel("fight", settings.theme),
  Settings: FightSettings,
  lobbyTrack: (settings) => themedTrack("fight", settings.theme, "lobby"),
};
