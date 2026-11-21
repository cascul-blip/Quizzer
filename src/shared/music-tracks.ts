// Background music tracks. Each id is also the file name (minus extension) that
// replaces the built-in track when placed in data/music/, e.g. submarine-chase.mp3.

import type { ThemedTrackId } from "./themed-modes.ts";
import { themedMusicTracks } from "./themed-modes.ts";

/** Tracks no themed mode's screen plays: modes without themes, and Showdown's draw sting. */
const OTHER_TRACKS = [
  { id: "classic-lobby", mode: "Classic", screen: "Lobby" },
  { id: "classic-question", mode: "Classic", screen: "Questions" },
  { id: "classic-leaderboard", mode: "Classic", screen: "Answer reveal & leaderboard" },
  { id: "classic-results", mode: "Classic", screen: "Final podium" },
  { id: "submarine-lobby", mode: "Sled Squad", screen: "Lobby" },
  { id: "submarine-chase", mode: "Sled Squad", screen: "Chase" },
  { id: "submarine-dive", mode: "Sled Squad", screen: "Trail challenge" },
  { id: "submarine-results", mode: "Sled Squad", screen: "Final results" },
  { id: "robot-lobby", mode: "Robot Attack", screen: "Lobby" },
  { id: "robot-quiz", mode: "Robot Attack", screen: "Quiz" },
  { id: "robot-move", mode: "Robot Attack", screen: "Movement & laser attack" },
  { id: "robot-results", mode: "Robot Attack", screen: "Final results" },
  { id: "showdown-draw", mode: "Showdown", screen: "Draw sting (plays once on each reveal)" },
] as const;

export type MusicTrackId = (typeof OTHER_TRACKS)[number]["id"] | ThemedTrackId;

/** Every track, for the admin music list; a themed mode's rows come from THEMED_MODES. */
export const MUSIC_TRACKS: readonly { id: MusicTrackId; mode: string; screen: string }[] = [...OTHER_TRACKS, ...themedMusicTracks()];

export const MUSIC_EXTENSIONS: Record<string, string> = {
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  webm: "audio/webm",
  flac: "audio/flac",
};

const TRACK_IDS = new Set<string>(MUSIC_TRACKS.map((t) => t.id));

/** "submarine-chase.mp3" → "submarine-chase" if it's a known track with a supported extension, else null. */
export function musicTrackForFile(fileName: string): MusicTrackId | null {
  const m = /^([a-z-]+)\.([a-z0-9]+)$/i.exec(fileName);
  if (!m || !MUSIC_EXTENSIONS[m[2]!.toLowerCase()]) return null;
  const id = m[1]!.toLowerCase();
  return TRACK_IDS.has(id) ? (id as MusicTrackId) : null;
}
