// Background music tracks. Each id is also the file name (minus extension) that
// replaces the built-in track when placed in data/music/, e.g. submarine-chase.mp3.

export const MUSIC_TRACKS = [
  { id: "classic-lobby", mode: "Classic", screen: "Lobby" },
  { id: "classic-question", mode: "Classic", screen: "Questions" },
  { id: "classic-leaderboard", mode: "Classic", screen: "Answer reveal & leaderboard" },
  { id: "classic-results", mode: "Classic", screen: "Final podium" },
  { id: "tower-lobby", mode: "Tallest Tower", screen: "Lobby" },
  { id: "tower-play", mode: "Tallest Tower", screen: "Building" },
  { id: "tower-results", mode: "Tallest Tower", screen: "Final podium" },
  { id: "submarine-lobby", mode: "Submarine Squad", screen: "Lobby" },
  { id: "submarine-chase", mode: "Submarine Squad", screen: "Chase" },
  { id: "submarine-dive", mode: "Submarine Squad", screen: "Diving" },
  { id: "submarine-results", mode: "Submarine Squad", screen: "Final results" },
  { id: "fight-lobby", mode: "Tower Fight", screen: "Lobby" },
  { id: "fight-play", mode: "Tower Fight", screen: "Battle" },
  { id: "fight-results", mode: "Tower Fight", screen: "Final results" },
  { id: "robot-lobby", mode: "Robot Attack", screen: "Lobby" },
  { id: "robot-quiz", mode: "Robot Attack", screen: "Quiz" },
  { id: "robot-move", mode: "Robot Attack", screen: "Movement & laser attack" },
  { id: "robot-results", mode: "Robot Attack", screen: "Final results" },
  { id: "land-lobby", mode: "Land Grab", screen: "Lobby" },
  { id: "land-play", mode: "Land Grab", screen: "The land" },
  { id: "land-results", mode: "Land Grab", screen: "Final podium" },
] as const;

export type MusicTrackId = (typeof MUSIC_TRACKS)[number]["id"];

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
