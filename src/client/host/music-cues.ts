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
  }
}
