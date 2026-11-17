import { duelTheme } from "../../shared/duel-theme.ts";
import { landTheme } from "../../shared/land-theme.ts";
import { towerTheme } from "../../shared/tower-theme.ts";
import { racerTheme } from "../../shared/racer-theme.ts";
import { cupTheme } from "../../shared/cup-theme.ts";
import { siegeTheme } from "../../shared/siege-theme.ts";
import { captureThreat } from "../../shared/land-board.ts";
import { LAND_GUARD_COST, LAND_STEAL_COST, TOWER_MAX_DAMAGE, type GameMode, type HostView, type LandBoard } from "../../shared/protocol.ts";
import type { MusicTrackId } from "../../shared/music-tracks.ts";
import type { MusicCue } from "../shared/music/index.ts";

const LOBBY: Record<GameMode, MusicTrackId> = {
  classic: "classic-lobby",
  tower: "tower-lobby",
  submarine: "submarine-lobby",
  fight: "fight-lobby",
  robot: "robot-lobby",
  land: "land-lobby",
  racer: "racer-lobby",
  cup: "cup-lobby",
  siege: "siege-lobby",
  duel: "showdown-lobby",
  gift: "tower-christmas-lobby",
};

let landKey = "";
let landValue = 0;

/** captureThreat for this board, worked out again only when a tile or a start changes. */
function landThreat(board: LandBoard): number {
  const key = `${board.owners.join()}|${board.starts.map((s) => (s.out ? 1 : 0)).join("")}`;
  if (key !== landKey) {
    landKey = key;
    landValue = captureThreat(board.owners, board.size, board.starts, LAND_STEAL_COST, LAND_GUARD_COST);
  }
  return landValue;
}

/** Which track the projector should play for this screen, and how intense. */
export function musicFor(view: HostView | null): MusicCue {
  if (!view || view.kind === "idle") return { track: null };
  switch (view.kind) {
    case "classic": {
      if (view.phase === "lobby" && view.mode === "land") return { track: landTheme(view.land.theme) === "christmas" ? "land-christmas-lobby" : "land-lobby" };
      if (view.phase === "lobby" && view.mode === "duel" && duelTheme(view.duel.theme) === "christmas") return { track: "tower-christmas-lobby" };
      if (view.phase === "lobby" && view.mode === "siege") return { track: siegeTheme(view.siege.theme) === "christmas" ? "siege-christmas-lobby" : "siege-lobby" };
      if (view.phase === "lobby" && view.mode === "racer") return { track: racerTheme(view.racer.theme) === "christmas" ? "racer-christmas-lobby" : "racer-lobby" };
      if (view.phase === "lobby") return { track: (view.mode === "tower" && towerTheme(view.tower.theme) === "christmas") || (view.mode === "cup" && cupTheme(view.cup.theme) === "christmas") ? "tower-christmas-lobby" : LOBBY[view.mode] ?? "classic-lobby" };
      if (view.phase === "podium") return { track: "classic-results" };
      if (view.phase === "reveal" || view.phase === "leaderboard") return { track: "classic-leaderboard" };
      // Questions: tension builds over the time limit.
      const q = view.question;
      if (view.phase === "open" && q) {
        return { track: "classic-question", intensity: 0.2, rampTo: 1, rampMs: q.remainingMs, key: `q${q.index}-open` };
      }
      return { track: "classic-question", intensity: 0.1, key: `q${q?.index ?? 0}-intro` };
    }
    case "tower": {
      const christmas = towerTheme(view.theme) === "christmas";
      const play = christmas ? "tower-christmas-play" : "tower-play";
      if (view.phase === "podium") return { track: christmas ? "tower-christmas-results" : "tower-results" };
      // Builds over the last few minutes of the timer.
      const start = Math.max(0, Math.min(1, 1 - view.remainingMs / 300_000));
      return view.phase === "playing"
        ? { track: play, intensity: start, rampTo: 1, rampMs: view.remainingMs, key: "tower-playing" }
        : { track: play, intensity: 0, key: "tower-countdown" };
    }
    case "sub": {
      if (view.phase === "podium") return { track: "submarine-results" };
      if (view.phase === "dive") return { track: "submarine-dive" };
      if (view.phase === "countdown") return { track: "submarine-lobby" };
      if (view.phase === "caught") return { track: "submarine-chase", intensity: 1 };
      // The closer the Christmas goblin, the faster and more layered the music.
      return { track: "submarine-chase", intensity: Math.max(0, Math.min(1, 1 - view.gap / view.maxGap)) };
    }
    case "fight": {
      if (view.phase === "podium") return { track: "fight-results" };
      const worst = Math.max(0, ...view.teams.map((t) => t.damage)) / TOWER_MAX_DAMAGE;
      return { track: "fight-play", intensity: Math.max(0, Math.min(1, 0.15 + worst * 0.85)) };
    }
    case "robot": {
      if (view.phase === "podium") return { track: "robot-results" };
      if (view.phase === "move" || view.phase === "attack") return { track: "robot-move" };
      if (view.phase === "quiz") {
        // The less time left to answer, the more intense.
        const start = Math.max(0, Math.min(1, 1 - view.phaseRemainingMs / Math.max(1, view.phaseDurationMs)));
        return { track: "robot-quiz", intensity: 0.2 + start * 0.8, rampTo: 1, rampMs: view.phaseRemainingMs, key: `robot-q${view.round}` };
      }
      return { track: "robot-quiz", intensity: 0, key: "robot-countdown" };
    }
    case "cup": {
      if (cupTheme(view.theme) === "christmas") return { track: view.phase === "podium" ? "tower-christmas-results" : "tower-christmas-play", intensity: view.phase === "reveal" ? 0.8 : 0.35 };
      if (view.phase === "podium") return { track: "cup-results" };
      // Holding your breath: tenser while the cups are drunk than while they're picked.
      if (view.phase === "drink" || (view.phase === "reveal" && (view.reveal?.drinks.length ?? 0) > 0)) return { track: "cup-drink", intensity: view.phase === "reveal" ? 0.7 : 0.3 };
      if (view.phase === "quiz") {
        // The less time left to answer, the faster the gallop.
        const start = Math.max(0, Math.min(1, 1 - view.phaseRemainingMs / Math.max(1, view.phaseDurationMs)));
        return { track: "cup-quiz", intensity: 0.15 + start * 0.85, rampTo: 1, rampMs: view.phaseRemainingMs, key: `cup-q${view.round}` };
      }
      return { track: "cup-quiz", intensity: 0, key: `cup-${view.phase}-${view.round}` };
    }
    case "land": {
      const christmas = landTheme(view.theme) === "christmas";
      const play = christmas ? "land-christmas-play" : "land-play";
      if (view.phase === "podium") return { track: christmas ? "land-christmas-results" : "land-results" };
      if (view.phase === "conquered") return { track: play, intensity: 1 };
      // Calm until a team gets close to closing a ring. No key, so the music glides
      // up as the ring grows and back down if it is broken.
      return { track: play, intensity: view.phase === "playing" ? landThreat(view.board) : 0 };
    }
    case "racer": {
      const christmas = racerTheme(view.theme) === "christmas";
      if (view.phase === "podium") return { track: christmas ? "racer-christmas-results" : "racer-results" };
      // One continuous drive: tempo and layers follow the car's speed. No key, so the
      // music never restarts between questions; useMusic glides to each new intensity.
      const { speed, crashed } = view.car;
      return { track: christmas ? "racer-christmas-drive" : "racer-drive", intensity: crashed ? 0.03 : Math.max(0.1, Math.min(1, speed / 150)) };
    }
    case "duel": {
      if (duelTheme(view.theme) === "christmas") return { track: view.phase === "podium" ? "tower-christmas-results" : "tower-christmas-play", intensity: view.phase === "open" ? 0.6 : 0.25 };
      if (view.phase === "podium") return { track: "showdown-results" };
      // Rounds are quick, so the build starts in the intro (the whistle is already on the tune)
      // and reaches full gallop halfway through the question's time.
      if (view.phase === "intro") return { track: "showdown", intensity: 0.3, rampTo: 0.5, rampMs: view.phaseRemainingMs, key: `duel-r${view.round}-intro` };
      if (view.phase === "open") {
        const full = view.phaseDurationMs / 2;
        const elapsed = Math.max(0, view.phaseDurationMs - view.phaseRemainingMs);
        const start = Math.min(1, elapsed / Math.max(1, full));
        return { track: "showdown", intensity: 0.5 + start * 0.5, rampTo: 1, rampMs: Math.max(0, full - elapsed), key: `duel-r${view.round}-open` };
      }
      // The reveal eases back to the riding beat (no silence between quick rounds); the draw sting (duel.tsx) plays over it.
      return { track: "showdown", intensity: 0.3, key: `duel-r${view.round}-${view.phase}` };
    }
    case "siege": {
      const outcome = view.result?.outcome;
      const christmas = siegeTheme(view.settings.theme) === "christmas";
      const battle: MusicTrackId = christmas ? "siege-christmas-battle" : "siege-battle";
      // Bells and a fanfare when the kingdom stands; the low lament when the castle falls (or the host ends it).
      if (view.phase === "stands" || view.phase === "fallen" || view.phase === "podium") {
        return { track: christmas ? "siege-christmas-results" : "siege-results", intensity: outcome === "stands" ? 0.9 : 0.12, key: `siege-end-${outcome}` };
      }
      if (view.phase === "countdown") return { track: battle, intensity: 0.05, key: "siege-count" };
      // Build break: drums and a held chord, rising into a drum roll before the next wave.
      if (view.phase === "build") return { track: battle, intensity: 0.05, rampTo: 0.14, rampMs: view.phaseRemainingMs, key: `siege-break-${view.wave}` };
      // A wave: more layers as monsters fill the board and as hearts are lost; a giant brings low brass and timpani.
      const lost = 1 - view.hearts / Math.max(1, view.maxHearts);
      const giant = view.monsters.some((m) => m.type === "giant");
      const busy = Math.min(1, view.monsterCount / 10);
      const intensity = Math.max(0.2, Math.min(giant ? 1 : 0.84, 0.2 + busy * 0.35 + lost * 0.45), giant ? 0.85 : 0);
      return { track: battle, intensity, key: `siege-wave-${view.wave}` };
    }
    case "gift":
      return view.phase === "podium"
        ? { track: "tower-christmas-results" }
        : { track: "tower-christmas-play", intensity: view.phase === "finishing" ? 1 : 0.4 };
  }
}
