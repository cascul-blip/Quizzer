import { TOWER_MAX_DAMAGE, type GameMode, type HostView } from "../../shared/protocol.ts";
import type { MusicTrackId } from "../../shared/music-tracks.ts";
import type { MusicCue } from "../shared/music/index.ts";

const LOBBY: Record<GameMode, MusicTrackId> = {
  classic: "classic-lobby",
  tower: "tower-lobby",
  submarine: "submarine-lobby",
  fight: "fight-lobby",
};

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
  }
}
