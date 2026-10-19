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
  dragon: "dragon-lobby",
  bomb: "bomb-lobby",
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
      if (view.phase === "lobby") return { track: LOBBY[view.mode] ?? "classic-lobby" };
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
      if (view.phase === "podium") return { track: "tower-results" };
      // Builds over the last few minutes of the timer.
      const start = Math.max(0, Math.min(1, 1 - view.remainingMs / 300_000));
      return view.phase === "playing"
        ? { track: "tower-play", intensity: start, rampTo: 1, rampMs: view.remainingMs, key: "tower-playing" }
        : { track: "tower-play", intensity: 0, key: "tower-countdown" };
    }
    case "sub": {
      if (view.phase === "podium") return { track: "submarine-results" };
      if (view.phase === "dive") return { track: "submarine-dive" };
      if (view.phase === "caught") return { track: "submarine-chase", intensity: 1 };
      // The closer the anglerfish, the faster and more layered the music.
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
      if (view.phase === "podium") return { track: "land-results" };
      if (view.phase === "conquered") return { track: "land-play", intensity: 1 };
      // Calm until a team gets close to closing a ring. No key, so the music glides
      // up as the ring grows and back down if it is broken.
      return { track: "land-play", intensity: view.phase === "playing" ? landThreat(view.board) : 0 };
    }
    case "racer": {
      if (view.phase === "podium") return { track: "racer-results" };
      // One continuous drive: tempo and layers follow the car's speed. No key, so the
      // music never restarts between questions; useMusic glides to each new intensity.
      const { speed, crashed } = view.car;
      return { track: "racer-drive", intensity: crashed ? 0.03 : Math.max(0.1, Math.min(1, speed / 150)) };
    }
    case "dragon": {
      if (view.phase === "podium") return { track: "dragon-results" };
      const clamp = (v: number) => Math.max(0, Math.min(1, v));
      if (view.phase === "fire") {
        const step = view.fire?.step;
        const seq = view.fire?.seq ?? 0;
        // The rumble rises through the warning; war drums under the rune question as its time runs out.
        if (step === "warning") return { track: "dragon-fire", intensity: 0.1, rampTo: 0.35, rampMs: view.phaseRemainingMs, key: `fire${seq}-warn` };
        if (step === "question") return { track: "dragon-fire", intensity: 0.45, rampTo: 1, rampMs: view.phaseRemainingMs, key: `fire${seq}-q` };
        return { track: "dragon-fire", intensity: 0.3, key: `fire${seq}-reveal` };
      }
      if (view.phase === "transition" || view.phase === "scramble") {
        // Faster as the scramble clock runs out.
        const total = view.settings.scrambleMinutes * 60_000;
        if (view.phase === "transition") return { track: "dragon-scramble", intensity: 0, key: "dragon-transition" };
        return { track: "dragon-scramble", intensity: clamp(1 - view.remainingMs / total), rampTo: 1, rampMs: view.remainingMs, key: "dragon-scramble" };
      }
      if (view.phase === "countdown") return { track: "dragon-battle", intensity: 0, key: "dragon-countdown" };
      // More intense as the dragon weakens and as the battle clock runs out. No key: it glides.
      const wounds = view.maxHealth > 0 ? 1 - view.health / view.maxHealth : 0;
      const time = 1 - view.remainingMs / (view.settings.battleMinutes * 60_000);
      return { track: "dragon-battle", intensity: clamp(0.1 + wounds * 0.6 + time * 0.3) };
    }
    case "bomb": {
      const fanfare = view.outcome === "defused";
      if (view.phase === "podium" || view.phase === "defused") return { track: "bomb-results", intensity: fanfare ? 0.9 : 0.12, key: `bomb-end-${view.outcome}` };
      if (view.phase === "exploded") return { track: "bomb-results", intensity: 0.12, key: "bomb-exploded" };
      if (view.phase === "countdown") return { track: "bomb-defuse", intensity: 0.05, key: "bomb-count" };
      // Faster and more layered as the soonest bomb runs down. The key restarts the ramp from the
      // right place whenever a wrong cut moves a timer, a Race squad drops out, or the last 30 s begin.
      const total = Math.max(1, view.durationMs);
      const urgency = Math.max(0, Math.min(1, 1 - view.remainingMs / total));
      const last30 = view.remainingMs <= 30_000;
      const intensity = Math.max(0.12, urgency, last30 ? 0.75 : 0);
      const timers = view.squads.map((s) => (s.finished || s.exploded ? "x" : s.timerRev)).join(".");
      return { track: "bomb-defuse", intensity, rampTo: 1, rampMs: view.remainingMs, key: `bomb-${view.timerRev}-${timers}-${last30 ? "end" : "run"}` };
    }
  }
}
