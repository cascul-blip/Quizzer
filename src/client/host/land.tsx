import { useEffect, useRef, useState } from "preact/hooks";
import { captureThreat } from "../../shared/land-board.ts";
import type { HostLandTeam, LandBoard } from "../../shared/modes/land.ts";
import { LAND_GUARD_COST, LAND_MIN_TEAMS, LAND_MINUTES, LAND_STEAL_COST, landShared } from "../../shared/modes/land.ts";
import type { HostView } from "../../shared/protocol.ts";
import { MAX_TEAMS } from "../../shared/protocol.ts";
import type { SeasonTheme } from "../../shared/themed-modes.ts";
import { modeTheme, themedTrack } from "../../shared/themed-modes.ts";
import { BANNER_CAPTURE, BANNER_KNOCKOUT, HexBoard, LandShape, landArt, Plinth, useBanner, useTeamCard } from "../shared/land-art.tsx";
import { LandThemeProvider, northPoleArt, useNorthPole } from "../shared/land-skin.tsx";
import type { MusicCue } from "../shared/music/index.ts";
import { play } from "../shared/sounds.ts";
import { useEventFlash } from "../shared/tower-art.tsx";
import { formatClock, ordinal, teamInk, teamVars, useCountdown } from "../shared/ui.tsx";
import type { Send } from "./common.tsx";
import { ErrorsButton, ErrorsTable, ScreenControls, toggleFullscreen } from "./common.tsx";
import type { LobbyModeEntry, LobbySettingsProps } from "./lobby-modes.tsx";
import { Award } from "./tower.tsx";

type LandView = Extract<HostView, { kind: "land" }>;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function LandStage({ view, send }: { view: LandView; send: Send }) {
  return (
    <LandThemeProvider theme={view.theme}>
      <LandStageContent view={view} send={send} />
    </LandThemeProvider>
  );
}

function LandStageContent({ view, send }: { view: LandView; send: Send }) {
  const christmas = useNorthPole();
  const secs = useCountdown(view.remainingMs, view.phase);
  const prevPhase = useRef(view.phase);
  useEffect(() => {
    if (view.phase === prevPhase.current) return;
    prevPhase.current = view.phase;
    if (view.phase === "playing") play("start");
    if (view.phase === "podium") play("fanfare");
  }, [view.phase]);

  const placed = useEventFlash(view.lastPlace, view.lastPlace?.seq, 600);
  const capture = useEventFlash(view.lastCapture, view.lastCapture?.seq, 4000);
  useEffect(() => void (placed && play("plant")), [placed?.seq]);
  useEffect(() => void (capture && play(capture.knockedOut.length ? "conquer" : "capture")), [capture?.seq]);

  const lastTick = useRef(-1);
  useEffect(() => {
    if (view.phase !== "playing" || secs === lastTick.current) return;
    lastTick.current = secs;
    if (secs > 0 && secs <= 10) play(secs <= 3 ? "tickHigh" : "tick");
  }, [secs, view.phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const teamName = (i: number) => `Team ${view.teams[i]?.name ?? "?"}`;
  const alive = view.teams.filter((t) => !t.out);
  let banner: { text: string; color: string } | null = null;
  if (view.phase === "conquered" && alive[0]) banner = { text: `👑 ${teamName(alive[0].index)} rules the whole land!`, color: alive[0].color };
  else if (capture?.knockedOut.length)
    banner = {
      text: `💥 ${teamName(capture.team)} surrounded ${capture.knockedOut.map(teamName).join(" and ")}! Their players switch sides`,
      color: BANNER_KNOCKOUT,
    };
  else if (capture)
    banner = { text: `🚩 ${capture.nickname} closed the ring: ${teamName(capture.team)} takes ${plural(capture.tiles.length, "tile")}`, color: BANNER_CAPTURE };

  return (
    <div class={`stage ${christmas ? "land-christmas" : ""}`}>
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        <div class="pill">{christmas ? "🎄 North Pole" : "🚩 Land Grab"}</div>
        <div class="spacer" />
        {view.phase === "playing" && <div class={`tower-clock ${secs <= 30 ? "urgent" : ""}`}>{formatClock(secs)}</div>}
        <div class="spacer" />
        <div class="pill">👥 {view.playerCount}</div>
        <ScreenControls join={view.join} />
        {view.phase !== "podium" && (
          <button class="btn ghost small" onClick={() => confirm("End the game now and show the final results?") && send({ type: "host.end" })}>
            End game
          </button>
        )}
      </header>
      {view.phase === "podium" ? (
        <LandPodium view={view} send={send} />
      ) : (
        <main class="land-wrap" style={{ backgroundImage: `url(${christmas ? northPoleArt().table : landArt("background")})` }}>
          <div class="land-board">
            {!christmas && <img class="land-compass" src={landArt("compass-rose")} alt="" draggable={false} />}
            <HexBoard board={view.board} placed={placed} capture={capture} />
          </div>
          <aside class="land-side">
            {view.teams.map((t) => (
              <TeamCard key={t.index} team={t} leading={!t.out && t.rank === 1 && t.tiles > 1} by={t.conqueredBy === null ? null : teamName(t.conqueredBy)} />
            ))}
          </aside>
          {banner && <LandBanner key={banner.text} text={banner.text} color={banner.color} />}
          {view.phase === "countdown" && (
            <div class="countdown-overlay">
              <div class="countdown-label">Answer questions on your phone to earn tiles. Surround land to capture it!</div>
              <div class="countdown-num" key={secs}>
                {Math.max(1, secs)}
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}

function LandBanner({ text, color }: { text: string; color: string }) {
  return (
    <div class="monster-banner land-banner" style={{ borderImageSource: useBanner(color), color: teamInk(color) }}>
      <span>{text}</span>
    </div>
  );
}

function TeamCard({ team, leading, by }: { team: HostLandTeam; leading: boolean; by: string | null }) {
  return (
    <section class={`land-team ${team.out ? "out" : ""}`} style={{ ...teamVars(team.color), borderImageSource: useTeamCard(team.color) }}>
      <LandShape team={team.index} class="land-team-shape" />
      <header>
        <span class="land-team-name">
          {leading && <span aria-label="Leading">👑 </span>}
          Team {team.name}
        </span>
        {team.out ? (
          <span class="land-team-out">joined {by}</span>
        ) : (
          <span class="land-team-tiles">
            <b>{team.tiles}</b> tile{team.tiles === 1 ? "" : "s"}
          </span>
        )}
      </header>
      {!team.out && (
        <ul class="tower-members" style={teamVars(team.color)}>
          {team.members.map((m) => (
            <li key={m.id} class={`${m.connected ? "" : "offline"} ${m.claiming ? "building" : ""}`}>
              {m.claiming && <span aria-label="placing tiles">🚩</span>}
              {m.nickname}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LandPodium({ view, send }: { view: LandView; send: Send }) {
  const [showErrors, setShowErrors] = useState(false);
  const ranked = [...view.teams].sort((a, b) => a.rank - b.rank || a.index - b.index);
  const places = [
    { team: ranked[1], cls: "second" },
    { team: ranked[0], cls: "first" },
    { team: ranked[2], cls: "third" },
  ] as const;
  const score = (t: HostLandTeam) => (t.out ? `surrounded by Team ${view.teams[t.conqueredBy ?? 0]?.name}` : plural(t.tiles, "tile"));
  const a = view.awards;
  return (
    <main class="podium tower-podium land-podium">
      <div class="podium-bg" aria-hidden="true">
        <HexBoard board={view.board} />
      </div>
      <h1>🏆 Land Grab</h1>
      {showErrors ? (
        <ErrorsTable errors={view.errors ?? []} />
      ) : (
        <>
          <div class="podium-blocks">
            {places.map(({ team, cls }) =>
              team ? (
                <div key={cls} class={`place ${cls}`} style={teamVars(team.color)}>
                  <div class="place-name">Team {team.name}</div>
                  <div class="place-score">{score(team)}</div>
                  <Plinth place={cls} team={team.index} color={team.color} rank={ordinal(team.rank)} />
                </div>
              ) : (
                <div key={cls} class={`place ${cls} empty`} />
              ),
            )}
          </div>
          {ranked.length > 3 && (
            <ol class="rest">
              {ranked.slice(3).map((t) => (
                <li key={t.index}>
                  <span>
                    {ordinal(t.rank)} Team {t.name}
                  </span>
                  <span>{score(t)}</span>
                </li>
              ))}
            </ol>
          )}
          <div class="awards">
            <Award icon="🎯" title={landShared.awards.mostCorrect} award={a?.mostCorrect ?? null} unit="correct" />
            <Award icon="🚩" title={landShared.awards.topSettler} award={a?.topSettler ?? null} unit="tiles placed" />
            <Award icon="🪢" title={landShared.awards.topSurrounder} award={a?.topSurrounder ?? null} unit="tiles surrounded" />
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

function LandSettings({ settings, send }: LobbySettingsProps<"land">) {
  return (
    <>
      <label class="opt">
        Theme
        <select
          aria-label="Land Grab theme"
          value={modeTheme("land", settings.theme)}
          onChange={(e) =>
            send({
              type: "host.setModeSettings",
              mode: "land",
              // checked: the select only offers the season themes, and the server refuses any other (pickTheme)
              settings: { teams: settings.teams, minutes: settings.minutes, theme: e.currentTarget.value as SeasonTheme },
            })
          }
        >
          <option value="christmas">🎄 North Pole</option>
          <option value="classic">🚩 Classic</option>
        </select>
      </label>
      <label class="opt">
        Teams
        <select
          value={settings.teams}
          onChange={(e) => send({ type: "host.setModeSettings", mode: "land", settings: { teams: Number(e.currentTarget.value), minutes: settings.minutes } })}
        >
          {Array.from({ length: MAX_TEAMS - LAND_MIN_TEAMS + 1 }, (_, i) => (
            <option key={i} value={i + LAND_MIN_TEAMS}>
              {i + LAND_MIN_TEAMS}
            </option>
          ))}
        </select>
      </label>
      <label class="opt">
        Time
        <select
          value={settings.minutes}
          onChange={(e) => send({ type: "host.setModeSettings", mode: "land", settings: { teams: settings.teams, minutes: Number(e.currentTarget.value) } })}
        >
          {LAND_MINUTES.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </label>
      <span class="opt mode-hint">
        Every 3 questions, correct answers become tiles. Surround land to capture it, and another team's starting point to knock them out.
      </span>
    </>
  );
}

let landKey = "";
let landValue = 0;

function landThreat(board: LandBoard): number {
  const key = `${board.owners.join()}|${board.starts.map((s) => (s.out ? 1 : 0)).join("")}`;
  if (key !== landKey) {
    landKey = key;
    landValue = captureThreat(board.owners, board.size, board.starts, LAND_STEAL_COST, LAND_GUARD_COST);
  }
  return landValue;
}

export function landCue(view: LandView): MusicCue {
  const playTrack = themedTrack("land", view.theme, "play");
  if (view.phase === "podium") return { track: themedTrack("land", view.theme, "results") };
  if (view.phase === "conquered") return { track: playTrack, intensity: 1 };
  return { track: playTrack, intensity: view.phase === "playing" ? landThreat(view.board) : 0 };
}

export const landLobby: LobbyModeEntry<"land"> = {
  label: () => "🚩 Land Grab",
  Settings: LandSettings,
  lobbyTrack: (settings) => themedTrack("land", settings.theme, "lobby"),
};
